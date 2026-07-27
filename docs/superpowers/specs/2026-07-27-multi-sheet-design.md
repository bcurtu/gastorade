# Multi-sheet support — design

## Problem

Gastorade stores exactly one set of expenses at a time. Starting a new
trip/log requires wiping the current one first (optionally exporting it to
JSON as a manual backup). The user wants to keep multiple logs ("hojas")
side by side — create a new one without touching existing ones, switch
between them, and delete the ones no longer needed — without any backend,
staying fully client-side in localStorage.

## Goals

- Create a new, empty sheet at any time via an "Añadir hoja" button.
- List existing sheets and switch the active one.
- Each sheet has its own expenses, source/target currencies, and exchange
  rate — trips can use entirely different currency pairs.
- Each sheet gets an automatic name (first-expense date + up to 2 source
  currencies used, e.g. `Ago26 TRY+JPY`), recalculated as new currencies
  are used, unless the user has manually renamed it.
- Delete a sheet from the list (with confirmation).
- Existing single-sheet installs migrate transparently into "sheet 1" on
  first load after the update, with no data loss.

## Non-goals

- Tag categories (`tagCategories`) stay global/shared across sheets — no
  per-sheet tag configuration.
- No merging/combining data across sheets (analytics, totals, or the
  summary map only ever show the active sheet).
- Export continues to export a single sheet at a time (the active one) —
  no "export all sheets" bundle.
- No renaming via a dedicated modal — a simple inline edit is enough.

## Data model changes

### New localStorage shape

Replace the flat keys (`expenses`, `exchangeRate`, `lastRateUpdate`,
`sourceCurrency`, `sourceCurrencySymbol`, `targetCurrency`,
`targetCurrencySymbol`) with:

- `sheets`: JSON array of sheet objects
- `activeSheetId`: the `id` of the currently selected sheet

```js
{
  id: '1735...',            // timestamp string, same pattern as expense ids
  name: 'Ago26 TRY+JPY',
  isCustomName: false,      // true once the user manually renames it
  createdAt: '2026-08-01T10:00:00.000Z',
  expenses: [...],          // same shape as today
  currencies: {
    source: { code: 'TRY', symbol: '₺' },
    target: { code: 'EUR', symbol: '€' }
  },
  exchangeRate: 0.026,
  lastRateUpdate: '2026-08-01'
}
```

### Runtime state stays mostly unchanged

To keep the diff small and avoid touching every method that already reads
`this.expenses` / `this.currencies` / `this.exchangeRate` /
`this.lastRateUpdate` (`saveExpense`, `groupExpensesByDay`,
`calculateAnalytics`, `checkExchangeRate`, `formatSourceAmount`, etc.),
those top-level reactive properties keep existing exactly as today and
always mirror the **active sheet**. Persistence is centralized instead:

```js
saveActiveSheet() {
    const sheet = this.sheets.find(s => s.id === this.activeSheetId);
    if (!sheet) return;
    sheet.expenses = this.expenses;
    sheet.currencies = {
        source: { ...this.currencies.source },
        target: { ...this.currencies.target }
    };
    sheet.exchangeRate = this.exchangeRate;
    sheet.lastRateUpdate = this.lastRateUpdate;
    if (!sheet.isCustomName) sheet.name = this.computeSheetName(sheet);
    localStorage.setItem('sheets', JSON.stringify(this.sheets));
}
```

Every existing call site that does `localStorage.setItem('expenses', ...)`,
`localStorage.setItem('exchangeRate', ...)`, `localStorage.setItem('sourceCurrency', ...)`,
etc. (in `saveExpense`, `saveTag`, `updateExpense`, `deleteExpense`,
`saveCurrencies`, `updateExchangeRate`, `resetData`) is replaced with a
single `this.saveActiveSheet()` call.

### Migration (one-time, in `init()` before anything else runs)

```js
migrateToSheets() {
    if (localStorage.getItem('sheets')) return; // already migrated

    const legacyExpenses = JSON.parse(localStorage.getItem('expenses') || 'null');
    const hasLegacyData = legacyExpenses !== null;

    const sheet = {
        id: Date.now().toString(),
        name: '',
        isCustomName: false,
        createdAt: new Date().toISOString(),
        expenses: legacyExpenses || [],
        currencies: {
            source: {
                code: localStorage.getItem('sourceCurrency') || 'THB',
                symbol: localStorage.getItem('sourceCurrencySymbol') || '฿'
            },
            target: {
                code: localStorage.getItem('targetCurrency') || 'EUR',
                symbol: localStorage.getItem('targetCurrencySymbol') || '€'
            }
        },
        exchangeRate: parseFloat(localStorage.getItem('exchangeRate')) || 0.026,
        lastRateUpdate: localStorage.getItem('lastRateUpdate') || null
    };

    // backfill currency on pre-multicurrency expenses (existing migrateExpenseCurrencies logic)
    sheet.expenses.forEach(e => {
        if (!e.currency) e.currency = { ...sheet.currencies.source };
    });

    sheet.name = this.computeSheetName(sheet);

    localStorage.setItem('sheets', JSON.stringify([sheet]));
    localStorage.setItem('activeSheetId', sheet.id);

    ['expenses', 'exchangeRate', 'lastRateUpdate', 'sourceCurrency',
     'sourceCurrencySymbol', 'targetCurrency', 'targetCurrencySymbol']
        .forEach(k => localStorage.removeItem(k));
}
```

After migration, `init()` loads `this.sheets` from localStorage,
`this.activeSheetId` from localStorage, and mirrors the active sheet's
fields into `this.expenses` / `this.currencies` / `this.exchangeRate` /
`this.lastRateUpdate` (same fields `selectSheet()` sets — see below).

The existing `migrateExpenseCurrencies()` (backfilling `expense.currency`
on legacy pre-multicurrency data) is folded into `migrateToSheets()` and
into `importDatabase()`'s handling of old-format backups; it no longer
needs to run on every `init()`.

### `DB_VERSION`

Bump from `'1.1'` to `'2.0'`.

## Sheet name calculation

```js
computeSheetName(sheet) {
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const firstDate = sheet.expenses.length
        ? new Date(Math.min(...sheet.expenses.map(e => new Date(e.date).getTime())))
        : new Date(sheet.createdAt);
    const label = months[firstDate.getMonth()] + String(firstDate.getFullYear()).slice(-2);

    const codes = [];
    [...sheet.expenses]
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .forEach(e => {
            if (!codes.includes(e.currency.code)) codes.push(e.currency.code);
        });

    const currencyPart = codes.slice(0, 2).join('+');
    return currencyPart ? `${label} ${currencyPart}` : label;
}
```

- Capped at the first 2 distinct source currencies used, in chronological
  order of first use. A 3rd+ currency does not change the name.
- Recomputed inside `saveActiveSheet()` whenever the sheet isn't
  custom-named — i.e. every time an expense is saved/edited/deleted or the
  currency pair changes.

## Sheet management methods

```js
addSheet() {
    const id = Date.now().toString();
    const sheet = {
        id,
        name: '',
        isCustomName: false,
        createdAt: new Date().toISOString(),
        expenses: [],
        currencies: {
            source: { code: 'THB', symbol: '฿' },
            target: { ...this.currencies.target } // keep current home/target currency
        },
        exchangeRate: 0,
        lastRateUpdate: null
    };
    sheet.name = this.computeSheetName(sheet);
    this.sheets.push(sheet);
    localStorage.setItem('sheets', JSON.stringify(this.sheets));
    this.selectSheet(id);
}

selectSheet(id) {
    const sheet = this.sheets.find(s => s.id === id);
    if (!sheet) return;

    this.cancelEdit();
    this.cleanupMaps(); // remove() every active Leaflet instance, reset this.maps = {}

    this.activeSheetId = id;
    localStorage.setItem('activeSheetId', id);

    this.expenses = sheet.expenses;
    this.currencies = {
        source: { ...sheet.currencies.source },
        target: { ...sheet.currencies.target }
    };
    this.exchangeRate = sheet.exchangeRate;
    this.lastRateUpdate = sheet.lastRateUpdate;

    this.resetForm();
    const today = new Date().toISOString().split('T')[0];
    this.expandedDays = new Set([today]);
    this.showSheetSelector = false;

    this.groupExpensesByDay();
    this.checkExchangeRate();
}

renameSheet(id, newName) {
    const sheet = this.sheets.find(s => s.id === id);
    if (!sheet) return;
    const trimmed = (newName || '').trim();
    if (!trimmed) {
        sheet.isCustomName = false;
        sheet.name = this.computeSheetName(sheet);
    } else {
        sheet.isCustomName = true;
        sheet.name = trimmed;
    }
    localStorage.setItem('sheets', JSON.stringify(this.sheets));
}

deleteSheet(id) {
    const sheet = this.sheets.find(s => s.id === id);
    if (!sheet) return;
    if (!confirm(`¿Seguro que quieres eliminar la hoja "${sheet.name}"? Esta acción no se puede deshacer.`)) return;

    this.sheets = this.sheets.filter(s => s.id !== id);
    localStorage.setItem('sheets', JSON.stringify(this.sheets));

    if (this.activeSheetId === id) {
        if (this.sheets.length === 0) {
            this.addSheet(); // always leaves at least one sheet active
        } else {
            this.selectSheet(this.sheets[0].id);
        }
    }
}
```

`cleanupMaps()` is a small new helper extracted from the existing
map-cleanup pattern already used in `showExpenseLocation()` — calls
`.remove()` on every entry in `this.maps` (including `maps.summary`) and
resets `this.maps = {}`, `this.summaryMarkerCluster = null`.

## Export / Import changes

### Export (active sheet only)

`exportDatabase()` adds `name` and `isCustomName` to the exported payload
so re-importing preserves the sheet's name:

```js
data: {
    name: sheet.name,
    isCustomName: sheet.isCustomName,
    expenses: this.expenses,
    exchangeRate: this.exchangeRate,
    lastRateUpdate: this.lastRateUpdate,
    sourceCurrency: this.currencies.source.code,
    sourceCurrencySymbol: this.currencies.source.symbol,
    targetCurrency: this.currencies.target.code,
    targetCurrencySymbol: this.currencies.target.symbol
}
```

### Import (creates a new sheet, doesn't touch existing ones)

`importDatabase()` no longer overwrites `this.expenses`/`this.currencies`.
After the existing version-mismatch confirm, it builds a new sheet object
from `importedData.data` (reusing the same flat-field reading the old
format already uses: `sourceCurrency`, `exchangeRate`, etc. — works
unchanged for both v1.1 and v2.0 backups since both export those fields),
backfills `expense.currency` for any expense missing it, computes or reuses
the name, pushes it into `this.sheets`, persists, and calls
`this.selectSheet(newSheet.id)`. The final confirm changes from "esto
sobrescribirá todos los datos actuales" to something like "se añadirá como
una hoja nueva".

## UI changes (`index.html`)

New section directly under the `.header` block, matching the existing
show/hide toggle pattern used by the currency editor:

```html
<div class="sheet-selector">
    <button type="button" class="link-button" @click="showSheetSelector = !showSheetSelector">
        📑 <span x-text="sheets.find(s => s.id === activeSheetId)?.name"></span> ▾
    </button>

    <div x-show="showSheetSelector" class="sheet-panel">
        <template x-for="sheet in sheets" :key="sheet.id">
            <div class="sheet-item" :class="{ active: sheet.id === activeSheetId }">
                <span @click="selectSheet(sheet.id)" x-text="sheet.name"></span>
                <button class="icon-button" @click="deleteSheet(sheet.id)" title="Borrar hoja">🗑️</button>
            </div>
        </template>

        <div class="sheet-rename">
            <input type="text" placeholder="Renombrar hoja activa"
                   @keydown.enter="renameSheet(activeSheetId, $event.target.value); $event.target.value = ''">
        </div>

        <button class="secondary-button" @click="addSheet()">+ Añadir hoja</button>
    </div>
</div>
```

New Alpine state: `sheets: []`, `activeSheetId: null`,
`showSheetSelector: false`.

`style.css` gets a handful of small additions (`.sheet-selector`,
`.sheet-panel`, `.sheet-item`, `.sheet-item.active`, `.sheet-rename`)
following the visual language already used for `.currency-editor` and
`.tag-editor`.

## Testing / verification

No test framework in this repo (vanilla JS, no build — per CLAUDE.md).
Verification is `node -c app.js` for syntax, plus manual browser testing:

- Fresh install (no localStorage): a single default empty sheet is created
  and usable.
- Existing install with legacy keys: migrates into one sheet with all
  existing expenses/currencies/rate intact, legacy keys removed, app
  behaves exactly as before the update.
- Add a sheet, add expenses in a different currency pair, verify totals /
  summary map only reflect the active sheet.
- Switch back to the first sheet — its expenses, currencies, and exchange
  rate are exactly as left.
- Sheet name updates as expenses are added (date + up to 2 currencies),
  and stops updating once manually renamed; clearing the custom name
  reverts to auto-naming.
- Delete a non-active sheet — list updates, active sheet unaffected.
- Delete the active sheet with others remaining — switches to another
  sheet correctly.
- Delete the last remaining sheet — a fresh empty sheet is created and
  becomes active.
- Export active sheet, re-import it — creates a new sheet (doesn't
  overwrite), with the same name.
- Import an old-format (v1.1) backup — still works, lands as a new sheet.
- Switching sheets while a per-expense map is open, or while the summary
  map is rendered, doesn't leak Leaflet instances or throw.
