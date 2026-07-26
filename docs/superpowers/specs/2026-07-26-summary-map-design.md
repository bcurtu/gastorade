# Summary map with marker clustering — design

## Problem

Each expense already stores its geo coordinates (`expense.coords`), but the
only way to see them is opening one expense's own toggleable mini-map at a
time. There's no way to see, at a glance, everywhere money was spent across
the whole trip.

## Goals

- Show one map inside the "Resumen Total" section with a marker for every
  expense that has coordinates.
- Cluster markers that are close together at low zoom, splitting into
  individual markers as the user zooms in.
- Clicking an individual marker shows a popup with that expense's amount
  (in its own currency), note, and date.

## Non-goals

- No filtering/toggling which expenses appear on the map (always shows all
  of them).
- No editing location from this map — it's read-only, display-only.
- No changes to the existing per-expense toggleable map.

## Approach

Add `leaflet.markercluster`, the standard Leaflet clustering plugin, via
CDN — same pattern as the existing Leaflet CDN include. It auto-groups
markers by proximity/zoom and expands on click/zoom, which is exactly the
behavior wanted, without writing custom clustering logic (rejected as
unnecessary given a mature plugin exists) and without switching to a
heatmap approach (rejected — a heatmap shows density, not discrete grouped
counts with click-through detail, which is what's wanted here).

## Data model

No changes. Uses existing `expense.coords`, `expense.amount`,
`expense.units`, `expense.currency`, `expense.note`, `expense.date`.

## New dependency

`leaflet.markercluster@1.5.3`, loaded from unpkg in `index.html` right
after the existing Leaflet `<script>`/`<link>` tags:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
```

Added to `urlsToCache` in `sw.js` (all three URLs), with `CACHE_NAME`
bumped, so it's cached for offline use like every other dependency.

## UI placement

New block at the end of `.analytics-section` (after the tag breakdown),
guarded so it doesn't render at all when no expense has coordinates:

```html
<div class="summary-map-section" x-show="expenses.some(e => e.coords)">
    <h3>Mapa de Gastos</h3>
    <div class="summary-map-container">
        <div id="summary-map" class="map-container" x-init="setTimeout(() => initSummaryMap(), 100)"></div>
    </div>
</div>
```

`.summary-map-container .map-container` gets a taller height (300px)
than the 200px per-expense maps, since it's an overview covering
potentially many points:

```css
.summary-map-container .map-container {
    height: 300px;
}
```

(`.map-container` and `.expense-map`-style rounded corners are reused
as-is from the existing per-expense map styles.)

## Behavior

### Initialization — `initSummaryMap()`

Called once via `x-init` (with the same 100ms `setTimeout` guard the
existing per-expense map init uses, to ensure the container has laid out
before Leaflet measures it). Guarded against double-init:

```js
initSummaryMap() {
    if (this.maps.summary) return;

    this.maps.summary = L.map('summary-map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(this.maps.summary);

    this.summaryMarkerCluster = L.markerClusterGroup();
    this.maps.summary.addLayer(this.summaryMarkerCluster);

    const fallbackCenter = this.currentLocation || { lat: 20, lng: 0 };
    this.maps.summary.setView(fallbackCenter, this.currentLocation ? 12 : 2);

    this.renderSummaryMap();
},
```

### Populating markers — `renderSummaryMap()`

Rebuilds the marker set from `this.expenses` and re-fits the view.
Guarded so it's a no-op before the map exists (it's called from
`groupExpensesByDay()`, which also runs during `init()`, before the
`x-init` on the map `<div>` has necessarily fired):

```js
renderSummaryMap() {
    if (!this.maps.summary) return;

    this.summaryMarkerCluster.clearLayers();

    const located = this.expenses.filter(e => e.coords);
    located.forEach(expense => {
        const amountLabel = this.formatCurrencyAmount(
            expense.amount * expense.units,
            expense.currency.symbol
        );
        const dateLabel = new Date(expense.date).toLocaleDateString('es-ES');
        const noteLine = expense.note
            ? `<br>${this.escapeHtml(expense.note)}`
            : '';

        L.marker(expense.coords)
            .bindPopup(`${amountLabel}${noteLine}<br>${dateLabel}`)
            .addTo(this.summaryMarkerCluster);
    });

    if (located.length > 0) {
        this.maps.summary.fitBounds(this.summaryMarkerCluster.getBounds(), {
            padding: [20, 20],
            maxZoom: 15
        });
    }
},
```

Leaflet's `bindPopup()` inserts its argument as HTML, so the user-editable
`note` field must be escaped before being interpolated — otherwise a note
containing `<img onerror=...>`-style content would execute as HTML/script
inside the popup. Add a small shared helper:

```js
escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
},
```

### Hooking into existing mutation flow

`groupExpensesByDay()` already runs after every place expenses are
created/edited/deleted/imported/migrated (8 call sites). Add one line at
the end of it to keep the summary map in sync everywhere, instead of
touching all 8 call sites individually:

```js
groupExpensesByDay() {
    // ...existing body...
    this.renderSummaryMap();
},
```

## Testing / verification

No test framework in this repo. Verification is `node -c app.js` for
syntax, plus manual browser testing:

- Create expenses with coordinates in at least two distinct locations far
  apart and one pair of nearby locations; verify the nearby pair renders
  as a single cluster at low zoom and splits into two markers when zoomed
  in.
- Click an individual marker; verify the popup shows the correct amount
  (in the expense's own currency, matching the multicurrency work),
  note, and date.
- Create/edit/delete an expense and confirm the summary map updates
  without a full page reload.
- With zero located expenses (fresh install or all expenses lack coords),
  confirm the whole "Mapa de Gastos" block is hidden rather than showing
  an empty map.
- Enter a note containing `<script>` or an `<img onerror>` payload and
  confirm it renders as inert text in the popup, not executed HTML.
- Reload with the Service Worker active and network disabled; confirm
  the summary map still renders (tiles aside, which require network
  regardless).
