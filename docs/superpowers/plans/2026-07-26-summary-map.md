# Summary Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clustered overview map inside "Resumen Total" showing every expense with coordinates, grouping nearby ones at low zoom and splitting them on zoom-in, with a popup on individual markers.

**Architecture:** Add the `leaflet.markercluster` plugin via CDN (same pattern as the existing Leaflet CDN include). Add two new Alpine methods (`initSummaryMap`, `renderSummaryMap`) plus a small `escapeHtml` helper, following the existing per-expense-map lifecycle pattern (`this.maps[...]`, guarded init, explicit refresh calls instead of Alpine watchers). Hook the refresh into `groupExpensesByDay()`, which already runs after every expense mutation.

**Tech Stack:** Vanilla JS, Alpine.js, Leaflet + Leaflet.markercluster (CDN, no build step), Service Worker cache.

**Reference spec:** `docs/superpowers/specs/2026-07-26-summary-map-design.md`

---

### Task 1: Add leaflet.markercluster dependency

**Files:**
- Modify: `index.html:23-25`
- Modify: `sw.js:1-11`

- [ ] **Step 1: Add the plugin's CSS/JS to `index.html`**

Current (`index.html:22-26`):

```html
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="app.js"></script>
```

New:

```html
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
    <script src="app.js"></script>
```

- [ ] **Step 2: Add the same URLs to the Service Worker cache and bump the cache version**

Current (`sw.js:1-12`):

```js
const CACHE_NAME = 'gastorade-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/gastorade.jpg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
```

New:

```js
const CACHE_NAME = 'gastorade-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/gastorade.jpg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'
];
```

- [ ] **Step 3: Verify syntax**

Run: `node -c sw.js && echo "sw.js syntax OK"`
Expected: `sw.js syntax OK`

- [ ] **Step 4: Commit**

```bash
git add index.html sw.js
git commit -m "Add leaflet.markercluster dependency for summary map"
```

---

### Task 2: Add summary-map state and escapeHtml helper

**Files:**
- Modify: `app.js:75` (state)
- Modify: `app.js:397-410` (helper, right before `formatSourceAmount`)

- [ ] **Step 1: Add cluster-group state next to `maps`**

Current (`app.js:73-77`):

```js
        tagInput: '',
        editingExpenseId: null,
        maps: {},
        currentLocation: null,
        expandedDays: new Set(),
```

New:

```js
        tagInput: '',
        editingExpenseId: null,
        maps: {},
        summaryMarkerCluster: null,
        currentLocation: null,
        expandedDays: new Set(),
```

- [ ] **Step 2: Add `escapeHtml` next to the other formatting utilities**

Current (`app.js:397-410`):

```js
        // Formateadores y utilidades
        formatCurrencyAmount(amount, symbol) {
            const formattedAmount = amount.toFixed(2);
            const isRTL = ['د.م.', 'د.إ', 'ر.ق'].includes(symbol);
            const isGBP = symbol === '£';

            if (isRTL) {
                return `${formattedAmount} <span class="rtl-text">${symbol}</span>`;
            } else if (isGBP) {
                return `${symbol}${formattedAmount}`;
            } else {
                return `${formattedAmount} ${symbol}`;
            }
        },
```

New (adds `escapeHtml` after `formatCurrencyAmount`, needed because Leaflet's `bindPopup()` inserts its argument as raw HTML — user-entered `note` text must be escaped before going into a popup):

```js
        // Formateadores y utilidades
        formatCurrencyAmount(amount, symbol) {
            const formattedAmount = amount.toFixed(2);
            const isRTL = ['د.م.', 'د.إ', 'ر.ق'].includes(symbol);
            const isGBP = symbol === '£';

            if (isRTL) {
                return `${formattedAmount} <span class="rtl-text">${symbol}</span>`;
            } else if (isGBP) {
                return `${symbol}${formattedAmount}`;
            } else {
                return `${formattedAmount} ${symbol}`;
            }
        },

        escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },
```

- [ ] **Step 3: Verify syntax**

Run: `node -c app.js && echo "app.js syntax OK"`
Expected: `app.js syntax OK`

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Add summary map state and escapeHtml helper"
```

---

### Task 3: Add initSummaryMap() and renderSummaryMap()

**Files:**
- Modify: `app.js:345-347` (insert new methods between `showExpenseLocation` and `toggleDayExpansion`)

- [ ] **Step 1: Insert the two new methods**

Current (`app.js:338-347`):

```js
            } else {
                // Clean up map when hiding
                if (this.maps[expense.id]) {
                    this.maps[expense.id].remove();
                    delete this.maps[expense.id];
                }
            }
        },

        toggleDayExpansion(dateKey) {
```

New:

```js
            } else {
                // Clean up map when hiding
                if (this.maps[expense.id]) {
                    this.maps[expense.id].remove();
                    delete this.maps[expense.id];
                }
            }
        },

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

        toggleDayExpansion(dateKey) {
```

- [ ] **Step 2: Verify syntax**

Run: `node -c app.js && echo "app.js syntax OK"`
Expected: `app.js syntax OK`

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Add initSummaryMap and renderSummaryMap methods"
```

---

### Task 4: Hook renderSummaryMap() into groupExpensesByDay()

**Files:**
- Modify: `app.js:493-495`

- [ ] **Step 1: Call `renderSummaryMap()` at the end of `groupExpensesByDay()`**

`groupExpensesByDay()` already runs after every place expenses are created, edited, deleted, imported, or migrated (8 call sites) — adding the refresh here keeps the summary map in sync everywhere without touching each call site.

Current (`app.js:492-495`):

```js
            // Convertir a array y ordenar
            this.groupedExpenses = Object.values(groups);
        },
```

New:

```js
            // Convertir a array y ordenar
            this.groupedExpenses = Object.values(groups);

            this.renderSummaryMap();
        },
```

- [ ] **Step 2: Verify syntax**

Run: `node -c app.js && echo "app.js syntax OK"`
Expected: `app.js syntax OK`

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Refresh summary map whenever expenses change"
```

---

### Task 5: Add summary map UI block and styles

**Files:**
- Modify: `index.html:291-293` (insert new block right after the tag-analytics `</div>`, still inside `.analytics-section`)
- Modify: `style.css` (append new rule near the existing `.map-container` rule at `style.css:450-453`)

- [ ] **Step 1: Add the map container markup**

Current (`index.html:276-293`):

```html
                <h3>Gastos por Etiqueta</h3>
                <div class="tag-analytics">
                    <template x-for="tag in analytics.tagsSorted" :key="tag.emoji">
                        <div class="tag-summary">
                            <div class="tag-header">
                                <span class="tag-emoji" x-text="tag.emoji"></span>
                                <span class="tag-name" x-text="tag.name"></span>
                                <span class="tag-count" x-text="tag.count + ' gastos'"></span>
                            </div>
                            <div class="tag-amounts">
                                <span x-html="formatCurrencyBreakdown(tag.totalsByCurrency)"></span>
                                <span class="eur" x-html="'(' + formatTargetAmount(tag.totalTarget) + ')'"></span>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
```

New:

```html
                <h3>Gastos por Etiqueta</h3>
                <div class="tag-analytics">
                    <template x-for="tag in analytics.tagsSorted" :key="tag.emoji">
                        <div class="tag-summary">
                            <div class="tag-header">
                                <span class="tag-emoji" x-text="tag.emoji"></span>
                                <span class="tag-name" x-text="tag.name"></span>
                                <span class="tag-count" x-text="tag.count + ' gastos'"></span>
                            </div>
                            <div class="tag-amounts">
                                <span x-html="formatCurrencyBreakdown(tag.totalsByCurrency)"></span>
                                <span class="eur" x-html="'(' + formatTargetAmount(tag.totalTarget) + ')'"></span>
                            </div>
                        </div>
                    </template>
                </div>

                <div class="summary-map-section" x-show="expenses.some(e => e.coords)">
                    <h3>Mapa de Gastos</h3>
                    <div class="summary-map-container">
                        <div id="summary-map" class="map-container" x-init="setTimeout(() => initSummaryMap(), 100)"></div>
                    </div>
                </div>
            </div>
        </div>
```

- [ ] **Step 2: Add the taller map-container override**

Current (`style.css:450-453`):

```css
.map-container {
    height: 200px;
    width: 100%;
}
```

New:

```css
.map-container {
    height: 200px;
    width: 100%;
}

.summary-map-container .map-container {
    height: 300px;
}

.summary-map-section {
    margin-top: 16px;
}
```

- [ ] **Step 3: Verify syntax**

Run: `node -c app.js && echo "app.js syntax OK"` (no JS changed in this task, but keeps the check consistent — the real check here is visual, done in Task 6)

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Add summary map UI block to Resumen Total section"
```

---

### Task 6: Full end-to-end verification pass

No code changes — this task is pure verification using the Browser pane tools, checking off every scenario from the spec's testing section.

- [ ] **Step 1: Start a local server and open the app**

Serve the app (e.g. `python -m http.server 8000`) and navigate to `http://localhost:8000` (cache-bust with a `?bust=` query param if a stale Service Worker/HTTP cache serves old files).

- [ ] **Step 2: Verify clustering behavior**

Create expenses with coordinates in at least two distant locations and one pair of nearby locations (via `localStorage` seeding or the app's geolocation capture). Confirm the nearby pair renders as a single numbered cluster at low zoom and splits into two separate markers when zoomed in.

- [ ] **Step 3: Verify marker popup content**

Click an individual (non-clustered) marker. Confirm the popup shows the correct amount in the expense's own currency (via `formatCurrencyAmount`), its note (if any), and its date.

- [ ] **Step 4: Verify live updates**

Create, edit, and delete an expense with coordinates while the summary map is visible. Confirm the map's markers update without a full page reload.

- [ ] **Step 5: Verify empty-state hiding**

With zero expenses that have `coords` (fresh install, or all expenses lack coordinates), confirm the entire "Mapa de Gastos" block is hidden (`x-show="expenses.some(e => e.coords)"` evaluates false) rather than showing an empty map.

- [ ] **Step 6: Verify note escaping**

Create an expense with a note containing `<img src=x onerror="alert(1)">` or `<script>alert(1)</script>`. Open its marker's popup and confirm the payload renders as inert visible text, not executed HTML/script.

- [ ] **Step 7: Verify offline caching**

With the Service Worker active (registered from a prior load), disable the network and reload. Confirm the summary map section still renders (map tiles themselves require network regardless — only the plugin/app code needs to work offline).

- [ ] **Step 8: Verify no regressions in the per-expense map**

Confirm the existing individual expense "show location" toggle map (`showExpenseLocation`) still works correctly alongside the new summary map — both use the shared `this.maps` object with different keys (`expense.id` vs `'summary'`), so no key collisions should occur.
