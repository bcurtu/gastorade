# Multi-sheet Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user keep multiple independent expense logs ("hojas") side by side in localStorage — create a new empty one, switch between them, rename, and delete — instead of having to wipe the current one to start a new trip.

**Architecture:** Replace the flat localStorage keys (`expenses`, `exchangeRate`, `sourceCurrency`, ...) with a single `sheets` array + `activeSheetId`. Keep the existing top-level reactive properties (`this.expenses`, `this.currencies`, `this.exchangeRate`, `this.lastRateUpdate`) as a live mirror of the active sheet so every existing method that already reads them needs no change — persistence is centralized instead through a new `saveActiveSheet()` method that all existing `localStorage.setItem` call sites route through. A one-time migration folds any pre-existing single-sheet install into "sheet 1". Sheet names are auto-computed from the earliest expense date + up to 2 distinct source currencies used, unless manually overridden.

**Tech Stack:** Vanilla JS, Alpine.js (no build step). No automated test framework exists in this repo — verification is `node -c app.js` for syntax plus manual browser testing via the Browser pane tools, per `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-07-27-multi-sheet-design.md`

**Note on commits:** this environment's `gpg-agent` cannot prompt for a passphrase (no TTY for `pinentry`), so every commit step below uses `git commit --no-gpg-sign`, matching the convention already used in this repo's prior plans (`docs/superpowers/plans/2026-07-26-multicurrency.md`, etc.).

---

### Task 1: Sheet data model, migration, and name calculation

**Files:**
- Modify: `app.js:4` (`DB_VERSION`)
- Modify: `app.js:31-59` (initial state: `currencies`, `exchangeRate`, `lastRateUpdate`, `newExpense`, `expenses`)
- Modify: `app.js:78` (add `sheets`, `activeSheetId`, `showSheetSelector` state)
- Modify: `app.js:81-132` (`init()`)
- Modify: `app.js:423-437` (replace `migrateExpenseCurrencies` with the new sheet-migration methods)

- [ ] **Step 1: Bump `DB_VERSION`**

In `app.js:4`, change:

```js
        DB_VERSION: '1.1',
```

to:

```js
        DB_VERSION: '2.0',
```

- [ ] **Step 2: Make the initial currency/rate/expenses state static defaults**

These values get overwritten synchronously by `init()` (via the migration + `loadActiveSheetIntoState()` + `resetForm()`, added in later steps) before Alpine's first render, exactly like `migrateExpenseCurrencies()` already does today for `expenses` — so it's safe for them to start as plain defaults instead of reading localStorage directly.

In `app.js`, change:

```js
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
        lastRateUpdate: localStorage.getItem('lastRateUpdate') || null,
        showRateEditor: false,
        showCurrencyEditor: false,
        newExpense: {
            amount: '',
            units: 1,
            date: new Date(),
            location: '',
            coords: null,
            note: '',
            currency: {
                code: localStorage.getItem('sourceCurrency') || 'THB',
                symbol: localStorage.getItem('sourceCurrencySymbol') || '฿'
            },
            exchangeRate: parseFloat(localStorage.getItem('exchangeRate')) || 0.026
        },
        convertedAmount: '0.00',
        expenses: JSON.parse(localStorage.getItem('expenses') || '[]'),
```

to:

```js
        currencies: {
            source: { code: 'THB', symbol: '฿' },
            target: { code: 'EUR', symbol: '€' }
        },
        exchangeRate: 0.026,
        lastRateUpdate: null,
        showRateEditor: false,
        showCurrencyEditor: false,
        newExpense: {
            amount: '',
            units: 1,
            date: new Date(),
            location: '',
            coords: null,
            note: '',
            currency: { code: 'THB', symbol: '฿' },
            exchangeRate: 0.026
        },
        convertedAmount: '0.00',
        expenses: [],
```

- [ ] **Step 3: Add sheet-related state fields**

In `app.js`, change:

```js
        expandedDays: new Set(),

        // Inicialización
```

to:

```js
        expandedDays: new Set(),
        sheets: [],
        activeSheetId: null,
        showSheetSelector: false,

        // Inicialización
```

- [ ] **Step 4: Replace `migrateExpenseCurrencies` with the sheet-migration methods**

In `app.js`, replace this method:

```js
        migrateExpenseCurrencies() {
            let migrated = false;
            this.expenses.forEach(expense => {
                if (!expense.currency) {
                    expense.currency = {
                        code: this.currencies.source.code,
                        symbol: this.currencies.source.symbol
                    };
                    migrated = true;
                }
            });
            if (migrated) {
                localStorage.setItem('expenses', JSON.stringify(this.expenses));
            }
        },
```

with:

```js
        backfillExpenseCurrency(expenses, fallbackCurrency) {
            expenses.forEach(expense => {
                if (!expense.currency) {
                    expense.currency = { ...fallbackCurrency };
                }
            });
        },

        computeSheetName(sheet) {
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const firstDate = sheet.expenses.length
                ? new Date(Math.min(...sheet.expenses.map(e => new Date(e.date).getTime())))
                : new Date(sheet.createdAt);
            const label = months[firstDate.getMonth()] + String(firstDate.getFullYear()).slice(-2);

            const codes = [];
            [...sheet.expenses]
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .forEach(expense => {
                    if (!codes.includes(expense.currency.code)) codes.push(expense.currency.code);
                });

            const currencyPart = codes.slice(0, 2).join('+');
            return currencyPart ? `${label} ${currencyPart}` : label;
        },

        migrateToSheets() {
            if (localStorage.getItem('sheets')) return;

            const legacyExpenses = JSON.parse(localStorage.getItem('expenses') || 'null');

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

            this.backfillExpenseCurrency(sheet.expenses, sheet.currencies.source);
            sheet.name = this.computeSheetName(sheet);

            localStorage.setItem('sheets', JSON.stringify([sheet]));
            localStorage.setItem('activeSheetId', sheet.id);

            ['expenses', 'exchangeRate', 'lastRateUpdate', 'sourceCurrency',
             'sourceCurrencySymbol', 'targetCurrency', 'targetCurrencySymbol']
                .forEach(key => localStorage.removeItem(key));
        },

        loadActiveSheetIntoState() {
            const sheet = this.sheets.find(s => s.id === this.activeSheetId);
            if (!sheet) return;
            this.expenses = sheet.expenses;
            this.currencies = {
                source: { ...sheet.currencies.source },
                target: { ...sheet.currencies.target }
            };
            this.exchangeRate = sheet.exchangeRate;
            this.lastRateUpdate = sheet.lastRateUpdate;
        },
```

- [ ] **Step 5: Wire the migration and sheet loading into `init()`**

In `app.js`, change:

```js
        init() {
            this.migrateExpenseCurrencies();

            if (navigator.geolocation) {
```

to:

```js
        init() {
            this.migrateToSheets();
            this.sheets = JSON.parse(localStorage.getItem('sheets') || '[]');
            this.activeSheetId = localStorage.getItem('activeSheetId');
            this.loadActiveSheetIntoState();
            this.resetForm();

            if (navigator.geolocation) {
```

(everything else in `init()` stays exactly the same)

- [ ] **Step 6: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

- [ ] **Step 7: Manual check — fresh install**

In the browser preview, open `javascript_tool` and run:

```js
localStorage.clear();
location.reload();
```

After reload, inspect state:

```js
JSON.parse(localStorage.getItem('sheets'))
```

Expected: an array with exactly one sheet object, `expenses: []`, `currencies.source.code === 'THB'`, `currencies.target.code === 'EUR'`, and a `name` like `Jul26` (current month/year, no currency suffix since there are no expenses yet). Confirm `localStorage.getItem('activeSheetId')` matches that sheet's `id`. Confirm the app itself still loads and lets you save a new expense normally.

- [ ] **Step 8: Manual check — migrating an existing legacy install**

Seed legacy-format data and remove any sheets data, via `javascript_tool`:

```js
localStorage.clear();
localStorage.setItem('expenses', JSON.stringify([
    { id: 'legacy-1', amount: 500, units: 1, currency: { code: 'THB', symbol: '฿' }, exchangeRate: 0.026, date: new Date().toISOString(), location: '', coords: null, showMap: false, tag: '', note: '' }
]));
localStorage.setItem('sourceCurrency', 'THB');
localStorage.setItem('sourceCurrencySymbol', '฿');
localStorage.setItem('targetCurrency', 'EUR');
localStorage.setItem('targetCurrencySymbol', '€');
localStorage.setItem('exchangeRate', '0.026');
localStorage.setItem('lastRateUpdate', new Date().toISOString().split('T')[0]);
location.reload();
```

After reload, confirm via `javascript_tool`:

```js
JSON.parse(localStorage.getItem('sheets'))
```

shows one sheet containing the `legacy-1` expense, with `currencies.source.code === 'THB'` and `currencies.target.code === 'EUR'`, and that the legacy keys are gone:

```js
['expenses', 'exchangeRate', 'lastRateUpdate', 'sourceCurrency', 'sourceCurrencySymbol', 'targetCurrency', 'targetCurrencySymbol'].map(k => localStorage.getItem(k))
```

Expected: all `null`. Confirm the expense list in the UI shows the migrated 500 ฿ expense correctly. Clean up afterwards with `localStorage.clear(); location.reload();`.

- [ ] **Step 9: Commit**

```bash
git add app.js docs/superpowers/specs/2026-07-27-multi-sheet-design.md
git commit --no-gpg-sign -m "$(cat <<'EOF'
Add sheet data model, migration from legacy single-sheet storage, and auto-naming

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Centralize persistence through `saveActiveSheet()`

**Files:**
- Modify: `app.js` — `loadActiveSheetIntoState()` block (add `saveActiveSheet()` after it)
- Modify: `app.js:153-155` (`saveExchangeRate`)
- Modify: `app.js:157-180` (`saveExpense`)
- Modify: `app.js:202-210` (`saveTag`)
- Modify: `app.js:277-298` (`updateExpense`)
- Modify: `app.js:305-311` (`deleteExpense`)
- Modify: `app.js:439-452` (`saveCurrencies`)
- Modify: `app.js:611-617` (`resetData`)
- Modify: `app.js:628-648` (`updateExchangeRate`)

- [ ] **Step 1: Add `saveActiveSheet()` right after `loadActiveSheetIntoState()`**

In `app.js`, change:

```js
        loadActiveSheetIntoState() {
            const sheet = this.sheets.find(s => s.id === this.activeSheetId);
            if (!sheet) return;
            this.expenses = sheet.expenses;
            this.currencies = {
                source: { ...sheet.currencies.source },
                target: { ...sheet.currencies.target }
            };
            this.exchangeRate = sheet.exchangeRate;
            this.lastRateUpdate = sheet.lastRateUpdate;
        },
```

to:

```js
        loadActiveSheetIntoState() {
            const sheet = this.sheets.find(s => s.id === this.activeSheetId);
            if (!sheet) return;
            this.expenses = sheet.expenses;
            this.currencies = {
                source: { ...sheet.currencies.source },
                target: { ...sheet.currencies.target }
            };
            this.exchangeRate = sheet.exchangeRate;
            this.lastRateUpdate = sheet.lastRateUpdate;
        },

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
        },
```

- [ ] **Step 2: `saveExchangeRate`**

In `app.js`, change:

```js
        saveExchangeRate() {
            localStorage.setItem('exchangeRate', this.exchangeRate);
        },
```

to:

```js
        saveExchangeRate() {
            this.saveActiveSheet();
        },
```

- [ ] **Step 3: `saveExpense`**

In `app.js`, change:

```js
            this.expenses.push(expense);
            localStorage.setItem('expenses', JSON.stringify(this.expenses));
            this.resetForm();
```

to:

```js
            this.expenses.push(expense);
            this.saveActiveSheet();
            this.resetForm();
```

- [ ] **Step 4: `saveTag`**

In `app.js`, change:

```js
        saveTag(id, category) {
            const index = this.expenses.findIndex(e => e.id === id);
            if (index !== -1) {
                this.expenses[index].tag = category.emoji;
                localStorage.setItem('expenses', JSON.stringify(this.expenses));
                this.showTagEditor = null;
                this.groupExpensesByDay();
            }
        },
```

to:

```js
        saveTag(id, category) {
            const index = this.expenses.findIndex(e => e.id === id);
            if (index !== -1) {
                this.expenses[index].tag = category.emoji;
                this.saveActiveSheet();
                this.showTagEditor = null;
                this.groupExpensesByDay();
            }
        },
```

- [ ] **Step 5: `updateExpense`**

In `app.js`, change:

```js
                localStorage.setItem('expenses', JSON.stringify(this.expenses));
                this.editingExpenseId = null;
                this.resetForm();
                this.groupExpensesByDay();
            }
        },
```

to:

```js
                this.saveActiveSheet();
                this.editingExpenseId = null;
                this.resetForm();
                this.groupExpensesByDay();
            }
        },
```

- [ ] **Step 6: `deleteExpense`**

In `app.js`, change:

```js
        deleteExpense(id) {
            if (confirm('¿Seguro que quieres eliminar este gasto?')) {
                this.expenses = this.expenses.filter(e => e.id !== id);
                localStorage.setItem('expenses', JSON.stringify(this.expenses));
                this.groupExpensesByDay();
            }
        },
```

to:

```js
        deleteExpense(id) {
            if (confirm('¿Seguro que quieres eliminar este gasto?')) {
                this.expenses = this.expenses.filter(e => e.id !== id);
                this.saveActiveSheet();
                this.groupExpensesByDay();
            }
        },
```

- [ ] **Step 7: `saveCurrencies`**

In `app.js`, change:

```js
        saveCurrencies() {
            // Update symbols before saving
            this.updateCurrencySymbol('source');
            this.updateCurrencySymbol('target');

            localStorage.setItem('sourceCurrency', this.currencies.source.code);
            localStorage.setItem('sourceCurrencySymbol', this.currencies.source.symbol);
            localStorage.setItem('targetCurrency', this.currencies.target.code);
            localStorage.setItem('targetCurrencySymbol', this.currencies.target.symbol);
            this.showCurrencyEditor = false;

            // Update exchange rate with new currencies
            this.updateExchangeRate();
        },
```

to:

```js
        saveCurrencies() {
            // Update symbols before saving
            this.updateCurrencySymbol('source');
            this.updateCurrencySymbol('target');

            this.saveActiveSheet();
            this.showCurrencyEditor = false;

            // Update exchange rate with new currencies
            this.updateExchangeRate();
        },
```

- [ ] **Step 8: `resetData`**

In `app.js`, change:

```js
        resetData() {
            if (confirm('¿Estás seguro de que quieres borrar todos los gastos? Esta acción no se puede deshacer.')) {
                this.expenses = [];
                localStorage.removeItem('expenses');
                this.groupExpensesByDay();
            }
        },
```

to:

```js
        resetData() {
            if (confirm('¿Estás seguro de que quieres borrar todos los gastos? Esta acción no se puede deshacer.')) {
                this.expenses = [];
                this.saveActiveSheet();
                this.groupExpensesByDay();
            }
        },
```

- [ ] **Step 9: `updateExchangeRate`**

In `app.js`, change:

```js
                if (data.rates && data.rates[this.currencies.target.code]) {
                    this.exchangeRate = data.rates[this.currencies.target.code];
                    this.lastRateUpdate = new Date().toISOString().split('T')[0];

                    // Save to localStorage
                    localStorage.setItem('exchangeRate', this.exchangeRate);
                    localStorage.setItem('lastRateUpdate', this.lastRateUpdate);

                    // Show success message
                    alert(`Tipo de cambio actualizado: 1 ${this.currencies.source.code} = ${this.exchangeRate} ${this.currencies.target.code}`);
                }
```

to:

```js
                if (data.rates && data.rates[this.currencies.target.code]) {
                    this.exchangeRate = data.rates[this.currencies.target.code];
                    this.lastRateUpdate = new Date().toISOString().split('T')[0];

                    // Save to localStorage
                    this.saveActiveSheet();

                    // Show success message
                    alert(`Tipo de cambio actualizado: 1 ${this.currencies.source.code} = ${this.exchangeRate} ${this.currencies.target.code}`);
                }
```

- [ ] **Step 10: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

- [ ] **Step 11: Manual check**

In the browser preview (clear localStorage and reload first for a clean single default sheet): save a new expense, then inspect via `javascript_tool`:

```js
JSON.parse(localStorage.getItem('sheets'))[0].expenses.length
```

Expected: `1`. Confirm `localStorage.getItem('expenses')` is `null` (no stray legacy key reappears). Edit the expense's note, delete it, tag another expense, change currencies via the currency editor (triggers a rate refresh), and after each action re-check that `sheets` in localStorage reflects the change and no flat legacy keys (`expenses`, `exchangeRate`, etc.) are written.

- [ ] **Step 12: Commit**

```bash
git add app.js
git commit --no-gpg-sign -m "$(cat <<'EOF'
Centralize persistence through saveActiveSheet, replacing flat localStorage writes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `cleanupMaps()` helper

**Files:**
- Modify: `app.js:313-347` (right after `showExpenseLocation`, before `initSummaryMap`)

- [ ] **Step 1: Add the helper**

In `app.js`, change:

```js
                // Clean up map when hiding
                if (this.maps[expense.id]) {
                    this.maps[expense.id].remove();
                    delete this.maps[expense.id];
                }
            }
        },

        initSummaryMap() {
```

to:

```js
                // Clean up map when hiding
                if (this.maps[expense.id]) {
                    this.maps[expense.id].remove();
                    delete this.maps[expense.id];
                }
            }
        },

        cleanupMaps() {
            Object.values(this.maps).forEach(map => map.remove());
            this.maps = {};
            this.summaryMarkerCluster = null;
        },

        initSummaryMap() {
```

- [ ] **Step 2: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

(No behavioral check yet — `cleanupMaps()` has no caller until Task 4. It's exercised end-to-end in Task 4's manual check and again in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit --no-gpg-sign -m "$(cat <<'EOF'
Add cleanupMaps helper to remove all active Leaflet instances at once

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Sheet management methods (add/select/rename/delete)

**Files:**
- Modify: `app.js` — right after `saveActiveSheet()` (added in Task 2)

- [ ] **Step 1: Add `addSheet`, `selectSheet`, `renameSheet`, `deleteSheet`**

In `app.js`, change:

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
        },
```

to:

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
        },

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
                    target: { ...this.currencies.target }
                },
                exchangeRate: 0,
                lastRateUpdate: null
            };
            sheet.name = this.computeSheetName(sheet);
            this.sheets.push(sheet);
            localStorage.setItem('sheets', JSON.stringify(this.sheets));
            this.selectSheet(id);
        },

        selectSheet(id) {
            if (!this.sheets.find(s => s.id === id)) return;

            this.cancelEdit();
            this.cleanupMaps();

            this.activeSheetId = id;
            localStorage.setItem('activeSheetId', id);
            this.loadActiveSheetIntoState();

            this.resetForm();
            const today = new Date().toISOString().split('T')[0];
            this.expandedDays = new Set([today]);
            this.showSheetSelector = false;

            this.groupExpensesByDay();
            this.checkExchangeRate();
        },

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
        },

        deleteSheet(id) {
            const sheet = this.sheets.find(s => s.id === id);
            if (!sheet) return;
            if (!confirm(`¿Seguro que quieres eliminar la hoja "${sheet.name}"? Esta acción no se puede deshacer.`)) return;

            this.sheets = this.sheets.filter(s => s.id !== id);
            localStorage.setItem('sheets', JSON.stringify(this.sheets));

            if (this.activeSheetId === id) {
                if (this.sheets.length === 0) {
                    this.addSheet();
                } else {
                    this.selectSheet(this.sheets[0].id);
                }
            }
        },
```

- [ ] **Step 2: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

- [ ] **Step 3: Manual check — add, switch, isolate**

Clear localStorage and reload for a clean start. Via `javascript_tool`, drive the flow directly against the Alpine component (grab it with `document.querySelector('.app-container').__x.$data` or equivalent — Alpine exposes the reactive data on the element via `Alpine.$data(el)`; use `Alpine.$data(document.querySelector('[x-data]'))`):

```js
const app = Alpine.$data(document.querySelector('[x-data]'));
app.addSheet();
app.sheets.length; // expect 2
app.activeSheetId === app.sheets[1].id; // expect true
```

Save an expense while sheet 2 is active (via the UI). Then:

```js
app.selectSheet(app.sheets[0].id);
app.expenses.length; // expect 0 — sheet 1 untouched
app.selectSheet(app.sheets[1].id);
app.expenses.length; // expect 1
```

- [ ] **Step 4: Manual check — rename**

```js
app.renameSheet(app.activeSheetId, 'Viaje Tailandia');
app.sheets.find(s => s.id === app.activeSheetId).name; // expect 'Viaje Tailandia'
```

Save another expense on this sheet, confirm the name does **not** revert to an auto-computed one (since `isCustomName` is now `true`). Then clear the custom name:

```js
app.renameSheet(app.activeSheetId, '');
app.sheets.find(s => s.id === app.activeSheetId).name; // expect an auto-computed name again, e.g. "Jul26 THB"
```

- [ ] **Step 5: Manual check — delete**

With 2 sheets present, delete the non-active one and confirm the active sheet/expenses are unaffected:

```js
const otherId = app.sheets.find(s => s.id !== app.activeSheetId).id;
app.deleteSheet(otherId); // will show a confirm() dialog — accept it
app.sheets.length; // expect 1
```

Then delete the last remaining sheet and confirm a fresh empty one takes its place automatically:

```js
app.deleteSheet(app.activeSheetId); // accept the confirm()
app.sheets.length; // expect 1 (a brand new empty sheet)
app.expenses.length; // expect 0
```

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit --no-gpg-sign -m "$(cat <<'EOF'
Add addSheet/selectSheet/renameSheet/deleteSheet management methods

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Export includes sheet name; import creates a new sheet

**Files:**
- Modify: `app.js:650-675` (`exportDatabase`)
- Modify: `app.js:677-742` (`importDatabase`)

- [ ] **Step 1: Include `name`/`isCustomName` in the export payload**

In `app.js`, change:

```js
        exportDatabase() {
            const data = {
                version: this.DB_VERSION,
                exportDate: new Date().toISOString(),
                data: {
                    expenses: this.expenses,
                    exchangeRate: this.exchangeRate,
                    lastRateUpdate: this.lastRateUpdate,
                    sourceCurrency: this.currencies.source.code,
                    sourceCurrencySymbol: this.currencies.source.symbol,
                    targetCurrency: this.currencies.target.code,
                    targetCurrencySymbol: this.currencies.target.symbol
                }
            };
```

to:

```js
        exportDatabase() {
            const activeSheet = this.sheets.find(s => s.id === this.activeSheetId);
            const data = {
                version: this.DB_VERSION,
                exportDate: new Date().toISOString(),
                data: {
                    name: activeSheet ? activeSheet.name : '',
                    isCustomName: activeSheet ? activeSheet.isCustomName : false,
                    expenses: this.expenses,
                    exchangeRate: this.exchangeRate,
                    lastRateUpdate: this.lastRateUpdate,
                    sourceCurrency: this.currencies.source.code,
                    sourceCurrencySymbol: this.currencies.source.symbol,
                    targetCurrency: this.currencies.target.code,
                    targetCurrencySymbol: this.currencies.target.symbol
                }
            };
```

- [ ] **Step 2: Make `importDatabase` create a new sheet instead of overwriting state**

In `app.js`, replace the whole method:

```js
        importDatabase() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedData = JSON.parse(event.target.result);

                        // Validate version
                        if (!importedData.version) {
                            alert('El archivo no tiene un formato válido (falta versión).');
                            return;
                        }

                        // Check version compatibility
                        if (importedData.version !== this.DB_VERSION) {
                            if (!confirm(`El archivo es de una versión diferente (${importedData.version} vs ${this.DB_VERSION}). ¿Quieres intentar importarlo de todas formas?`)) {
                                return;
                            }
                        }

                        // Confirm import
                        if (!confirm('¿Estás seguro de que quieres importar estos datos? Esto sobrescribirá todos los datos actuales.')) {
                            return;
                        }

                        // Import data
                        const data = importedData.data;
                        this.expenses = data.expenses || [];
                        this.exchangeRate = data.exchangeRate || 0.026;
                        this.lastRateUpdate = data.lastRateUpdate || null;
                        this.currencies.source.code = data.sourceCurrency || 'THB';
                        this.currencies.source.symbol = data.sourceCurrencySymbol || '฿';
                        this.currencies.target.code = data.targetCurrency || 'EUR';
                        this.currencies.target.symbol = data.targetCurrencySymbol || '€';

                        // Backfill currency on expenses imported from a pre-multicurrency backup
                        this.migrateExpenseCurrencies();

                        // Save to localStorage
                        localStorage.setItem('expenses', JSON.stringify(this.expenses));
                        localStorage.setItem('exchangeRate', this.exchangeRate);
                        localStorage.setItem('lastRateUpdate', this.lastRateUpdate);
                        localStorage.setItem('sourceCurrency', this.currencies.source.code);
                        localStorage.setItem('sourceCurrencySymbol', this.currencies.source.symbol);
                        localStorage.setItem('targetCurrency', this.currencies.target.code);
                        localStorage.setItem('targetCurrencySymbol', this.currencies.target.symbol);

                        // Update UI
                        this.groupExpensesByDay();

                        alert('Datos importados correctamente.');
                    } catch (error) {
                        console.error('Error importing data:', error);
                        alert('Error al importar los datos. Asegúrate de que el archivo sea válido.');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        },
```

with:

```js
        importDatabase() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedData = JSON.parse(event.target.result);

                        // Validate version
                        if (!importedData.version) {
                            alert('El archivo no tiene un formato válido (falta versión).');
                            return;
                        }

                        // Check version compatibility
                        if (importedData.version !== this.DB_VERSION) {
                            if (!confirm(`El archivo es de una versión diferente (${importedData.version} vs ${this.DB_VERSION}). ¿Quieres intentar importarlo de todas formas?`)) {
                                return;
                            }
                        }

                        // Confirm import
                        if (!confirm('Se añadirá como una hoja nueva, sin tocar las hojas existentes. ¿Continuar?')) {
                            return;
                        }

                        // Build a new sheet from the imported data
                        const data = importedData.data;
                        const expenses = data.expenses || [];
                        const sourceCurrency = {
                            code: data.sourceCurrency || 'THB',
                            symbol: data.sourceCurrencySymbol || '฿'
                        };

                        // Backfill currency on expenses imported from a pre-multicurrency backup
                        this.backfillExpenseCurrency(expenses, sourceCurrency);

                        const sheet = {
                            id: Date.now().toString(),
                            name: data.name || '',
                            isCustomName: !!data.isCustomName,
                            createdAt: new Date().toISOString(),
                            expenses: expenses,
                            currencies: {
                                source: sourceCurrency,
                                target: {
                                    code: data.targetCurrency || 'EUR',
                                    symbol: data.targetCurrencySymbol || '€'
                                }
                            },
                            exchangeRate: data.exchangeRate || 0.026,
                            lastRateUpdate: data.lastRateUpdate || null
                        };

                        if (!sheet.name) sheet.name = this.computeSheetName(sheet);

                        this.sheets.push(sheet);
                        localStorage.setItem('sheets', JSON.stringify(this.sheets));
                        this.selectSheet(sheet.id);

                        alert('Datos importados correctamente como una nueva hoja.');
                    } catch (error) {
                        console.error('Error importing data:', error);
                        alert('Error al importar los datos. Asegúrate de que el archivo sea válido.');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        },
```

- [ ] **Step 3: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

- [ ] **Step 4: Manual check — export/import round-trip creates a new sheet**

With one sheet active and at least one expense saved, click "Exportar" (downloads a JSON file). Note how many sheets currently exist:

```js
const app = Alpine.$data(document.querySelector('[x-data]'));
app.sheets.length; // note this number, e.g. 1
```

Click "Importar" and select the file just exported. Accept both confirm dialogs. Confirm:

```js
app.sheets.length; // expect previous count + 1
app.activeSheetId === app.sheets[app.sheets.length - 1].id; // expect true — new sheet is now active
app.sheets[app.sheets.length - 1].name; // expect the same name as the sheet that was exported
```

Confirm the originally active sheet's data is untouched (switch to it via `app.selectSheet(...)` and check its expense count matches what it had before importing).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit --no-gpg-sign -m "$(cat <<'EOF'
Export includes sheet name; import creates a new sheet instead of overwriting

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Sheet selector UI

**Files:**
- Modify: `index.html:72-95` (header block)
- Modify: `style.css` (new rules after the `.currency-editor` block, `style.css:547-549`)

- [ ] **Step 1: Add the sheet selector markup to the header**

In `index.html`, change:

```html
        <div class="header">
            <h1><img src="gastorade.jpg" alt="" class="header-icon">Gastorade</h1>

            <div x-show="showCurrencyEditor" class="currency-editor">
```

to:

```html
        <div class="header">
            <h1><img src="gastorade.jpg" alt="" class="header-icon">Gastorade</h1>

            <div class="sheet-selector">
                <button type="button" class="link-button" @click="showSheetSelector = !showSheetSelector">
                    📑 <span x-text="sheets.find(s => s.id === activeSheetId)?.name"></span> ▾
                </button>

                <div x-show="showSheetSelector" class="sheet-panel">
                    <template x-for="sheet in sheets" :key="sheet.id">
                        <div class="sheet-item" :class="{ active: sheet.id === activeSheetId }">
                            <span @click="selectSheet(sheet.id)" x-text="sheet.name"></span>
                            <button type="button" class="icon-button delete" @click="deleteSheet(sheet.id)" title="Borrar hoja">🗑️</button>
                        </div>
                    </template>

                    <div class="sheet-rename">
                        <input
                            type="text"
                            placeholder="Renombrar hoja activa"
                            @keydown.enter="renameSheet(activeSheetId, $event.target.value); $event.target.value = ''"
                        >
                    </div>

                    <button type="button" class="secondary-button" @click="addSheet()">+ Añadir hoja</button>
                </div>
            </div>

            <div x-show="showCurrencyEditor" class="currency-editor">
```

- [ ] **Step 2: Add CSS for the new elements**

In `style.css`, change:

```css
.currency-editor button:hover {
    background-color: #1565c0;
}

.analytics-section {
```

to:

```css
.currency-editor button:hover {
    background-color: #1565c0;
}

.sheet-selector {
    margin-top: 12px;
}

.sheet-selector > button {
    background: none;
    border: none;
    color: white;
    padding: 0;
    font-size: 0.9rem;
    cursor: pointer;
}

.sheet-selector > button:hover {
    text-decoration: underline;
}

.sheet-panel {
    background: #f5f5f5;
    padding: 16px;
    border-radius: 8px;
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sheet-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-radius: 6px;
    background: white;
    border: 1px solid #ddd;
}

.sheet-item span:first-child {
    color: #333;
    cursor: pointer;
    flex: 1;
}

.sheet-item.active {
    border-color: #1976d2;
    background: #e3f2fd;
}

.sheet-rename input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
}

.analytics-section {
```

- [ ] **Step 3: Manual check — visual and interaction**

Open the browser preview. Confirm the header shows "📑 <sheet name> ▾" below the title. Click it — confirm the panel expands showing the (single, at this point) sheet, a rename input, and a "+ Añadir hoja" button, styled consistently with the existing currency editor panel (light card on the dark header). Click "+ Añadir hoja" — confirm a second entry appears and the app switches to it (form resets, expense list is empty). Click the first sheet's name — confirm it switches back and shows its expenses again. Type a name in the rename box and press Enter — confirm the active sheet's displayed name updates immediately. Click the 🗑️ on a non-active sheet — confirm/accept — confirm it disappears from the list.

Use `resize_window` (mobile preset) and confirm the panel doesn't overflow horizontally.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit --no-gpg-sign -m "$(cat <<'EOF'
Add sheet selector UI: switch, add, rename, and delete sheets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full end-to-end verification pass

**Files:** none (verification only)

- [ ] **Step 1: Fresh-state walkthrough**

Clear localStorage, reload. Confirm exactly one sheet exists and is usable (create an expense, tag it, see it in the list and in "Resumen Total").

- [ ] **Step 2: Two-sheet, two-currency-pair walkthrough**

Create a THB→EUR expense on sheet 1. Click "+ Añadir hoja". On sheet 2, change currencies to TRY→EUR via the currency editor, save an expense. Switch back to sheet 1 — confirm its THB expense, currency pair, and exchange rate are exactly as left (not overwritten by sheet 2's TRY settings). Switch to sheet 2 — same check in reverse.

- [ ] **Step 3: Sheet naming walkthrough**

On a sheet with no expenses, confirm the name shows just the month/year (e.g. `Jul26`). Save an expense — confirm the name updates to include the currency (e.g. `Jul26 THB`). Change currency and save another expense in the new currency — confirm the name now shows both, capped at 2 (e.g. `Jul26 THB+TRY`). Rename the sheet manually, save another expense in a third currency, confirm the manual name does **not** get overwritten.

- [ ] **Step 4: Map cleanup regression check**

On a sheet with a geolocated expense, open its per-expense map (📍 toggle) and the summary map (scroll to "Resumen Total"). Switch to another sheet, then back. Check the browser console (`read_console_messages`) for errors — confirm no Leaflet "already initialized" or DOM-detached errors appear, and that both maps re-render correctly on the sheet you switched back to.

- [ ] **Step 5: Delete-sheet edge cases**

With 2 sheets, delete the active one — confirm it switches to the remaining sheet with that sheet's own data intact. Delete that last remaining sheet — confirm a fresh empty sheet is auto-created and usable.

- [ ] **Step 6: Export/import regression check**

Export the active sheet. Import it back — confirm it lands as an additional sheet (not overwriting), with the same name, and that all other sheets are untouched.

- [ ] **Step 7: Existing-feature regression check**

Re-run the core existing flows to confirm nothing regressed: multi-currency expense list rendering (each expense keeps its own symbol), per-day and per-tag totals showing a `+`-joined breakdown when currencies are mixed, editing an old expense showing its own frozen currency/rate, and the summary map rendering located expenses for the active sheet only.

- [ ] **Step 8: Report to user**

No code changes in this task — summarize the verification results to the user directly (no commit needed).
