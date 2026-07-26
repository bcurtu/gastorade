# Multicurrency Expense Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow expenses to be created in different source currencies over time (one fixed target currency), with each expense rendering using its own currency.

**Architecture:** Add a `currency` snapshot field to each expense (parallel to the existing `exchangeRate` snapshot). Extract currency formatting into a symbol-parameterized helper so any amount can be rendered in any currency, not just the "current" global one. Replace single-currency total accumulators with per-currency-code breakdown maps. Lock the target-currency select once expenses exist; keep the source-currency select always editable. Fix a latent bug where editing an old expense read the live global currency/rate instead of the expense's own frozen values.

**Tech Stack:** Vanilla JS, Alpine.js (no build step). No automated test framework exists in this repo — verification is `node -c app.js` for syntax plus manual browser testing via the Browser pane tools, per `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-07-26-multicurrency-design.md`

---

### Task 1: Extract `formatCurrencyAmount` helper

**Files:**
- Modify: `app.js:368-397`

- [ ] **Step 1: Replace `formatSourceAmount`/`formatTargetAmount` with a shared helper**

Replace this block in `app.js`:

```js
        // Formateadores y utilidades
        formatSourceAmount(amount) {
            const formattedAmount = amount.toFixed(2);
            const symbol = this.currencies.source.symbol;
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

        formatTargetAmount(amount) {
            const formattedAmount = amount.toFixed(2);
            const symbol = this.currencies.target.symbol;
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

with:

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

        formatSourceAmount(amount) {
            return this.formatCurrencyAmount(amount, this.currencies.source.symbol);
        },

        formatTargetAmount(amount) {
            return this.formatCurrencyAmount(amount, this.currencies.target.symbol);
        },
```

- [ ] **Step 2: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

- [ ] **Step 3: Manual check — behavior unchanged**

Open the app in the browser preview, confirm the amount input's converted-amount preview and the expense list totals still render exactly as before (same symbols, same positions). This step only refactors, it must not change any visible output yet.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit --no-gpg-sign -m "$(cat <<'EOF'
Extract formatCurrencyAmount helper from format*Amount methods

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add `currency` field to expenses, bump DB_VERSION, migrate existing data

**Files:**
- Modify: `app.js:4` (DB_VERSION)
- Modify: `app.js:148-170` (`saveExpense`)
- Modify: `app.js:75-124` (`init`)

- [ ] **Step 1: Bump DB_VERSION**

In `app.js:4`, change:

```js
        DB_VERSION: '1.0',
```

to:

```js
        DB_VERSION: '1.1',
```

- [ ] **Step 2: Snapshot currency onto new expenses in `saveExpense`**

In `app.js`, inside `saveExpense()`, change:

```js
            const expense = {
                id: Date.now().toString(),
                amount: amount,
                units: this.newExpense.units,
                exchangeRate: this.exchangeRate,
                date: new Date(),
                location: this.newExpense.location,
                coords: this.newExpense.coords ? { ...this.newExpense.coords } : null,
                showMap: false,
                tag: this.newExpense.tag || '',
                note: (this.newExpense.note || '').slice(0, 24)
            };
```

to:

```js
            const expense = {
                id: Date.now().toString(),
                amount: amount,
                units: this.newExpense.units,
                currency: { code: this.currencies.source.code, symbol: this.currencies.source.symbol },
                exchangeRate: this.exchangeRate,
                date: new Date(),
                location: this.newExpense.location,
                coords: this.newExpense.coords ? { ...this.newExpense.coords } : null,
                showMap: false,
                tag: this.newExpense.tag || '',
                note: (this.newExpense.note || '').slice(0, 24)
            };
```

- [ ] **Step 3: Add a migration method for expenses missing `currency`**

Add this new method to `app.js`, right after `updateCurrencySymbol` (after the closing `},` of that method, before `saveCurrencies`):

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

- [ ] **Step 4: Call the migration at the start of `init()`**

In `app.js`, inside `init()`, add the migration call as the very first line:

```js
        init() {
            this.migrateExpenseCurrencies();

            if (navigator.geolocation) {
```

(everything else in `init()` stays the same)

- [ ] **Step 5: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

- [ ] **Step 6: Manual check — migration**

In the browser preview, open the JS console via `javascript_tool` and seed a legacy-style expense (no `currency` field):

```js
const expenses = JSON.parse(localStorage.getItem('expenses') || '[]');
expenses.push({ id: 'legacy-test', amount: 100, units: 1, exchangeRate: 0.026, date: new Date().toISOString(), location: '', coords: null, showMap: false, tag: '', note: '' });
localStorage.setItem('expenses', JSON.stringify(expenses));
```

Reload the page. Confirm via `javascript_tool` that the stored expense now has a `currency` field matching the current `currencies.source` (e.g. `{code: 'THB', symbol: '฿'}`). Then remove the test expense:

```js
let expenses = JSON.parse(localStorage.getItem('expenses'));
expenses = expenses.filter(e => e.id !== 'legacy-test');
localStorage.setItem('expenses', JSON.stringify(expenses));
```

Reload again.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit --no-gpg-sign -m "$(cat <<'EOF'
Add per-expense currency snapshot with migration for existing data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Always-visible currency editor, lock target currency

**Files:**
- Modify: `index.html:75-99`

- [ ] **Step 1: Lock the target select once expenses exist**

In `index.html`, change:

```html
                <div class="currency-input">
                    <label>Moneda destino:</label>
                    <select x-model="currencies.target.code" @change="updateCurrencySymbol('target')">
                        <template x-for="(currency, code) in supportedCurrencies" :key="code">
                            <option :value="code" :selected="code === currencies.target.code" x-text="currency.name + ' (' + currency.symbol + ')'"></option>
                        </template>
                    </select>
                </div>
```

to:

```html
                <div class="currency-input">
                    <label>Moneda destino:</label>
                    <select x-model="currencies.target.code" @change="updateCurrencySymbol('target')" :disabled="expenses.length > 0">
                        <template x-for="(currency, code) in supportedCurrencies" :key="code">
                            <option :value="code" :selected="code === currencies.target.code" x-text="currency.name + ' (' + currency.symbol + ')'"></option>
                        </template>
                    </select>
                    <small x-show="expenses.length > 0">La moneda destino queda fija una vez hay gastos registrados.</small>
                </div>
```

- [ ] **Step 2: Make the "editar" button always visible**

In `index.html`, change:

```html
                    <button x-show="!expenses.length" type="button" class="link-button" @click="showCurrencyEditor = !showCurrencyEditor">editar</button>
```

to:

```html
                    <button type="button" class="link-button" @click="showCurrencyEditor = !showCurrencyEditor">editar</button>
```

- [ ] **Step 3: Manual check**

In the browser preview, with at least one expense saved, open the currency editor via "editar". Confirm the "Moneda destino" select is disabled and shows the caption, while "Moneda origen" is still a normal enabled select. With zero expenses (fresh/cleared state), confirm the target select is enabled and no caption shows.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit --no-gpg-sign -m "$(cat <<'EOF'
Always show currency editor, lock target currency after first expense

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Render each expense in its own currency

**Files:**
- Modify: `index.html:187`

- [ ] **Step 1: Use the expense's own currency symbol in the list**

In `index.html`, change:

```html
                                                    <span x-html="formatSourceAmount(expense.amount * expense.units)"></span>
```

to:

```html
                                                    <span x-html="formatCurrencyAmount(expense.amount * expense.units, expense.currency.symbol)"></span>
```

(the line below it, converting to target currency via `expense.exchangeRate`, is unchanged — it was already per-expense correct)

- [ ] **Step 2: Manual check**

Clear expenses, set source currency to THB, save one expense (e.g. 500). Open the currency editor, change source currency to USD, click "Guardar" (triggers a rate re-fetch — confirm the success `alert()` shows the new THB→EUR... wait, USD→EUR rate). Save a second expense (e.g. 20). Confirm the list shows the THB expense with `฿` and the USD expense with `$`, regardless of which currency is currently selected.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit --no-gpg-sign -m "$(cat <<'EOF'
Render expense list amounts using each expense's own currency

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Per-currency total breakdowns

**Files:**
- Modify: `app.js:432-463` (`groupExpensesByDay`)
- Modify: `app.js:465-506` (`calculateAnalytics`)
- Modify: `index.html:270`, `index.html:285`

- [ ] **Step 1: Replace `totalSource` with `totalsByCurrency` in `groupExpensesByDay`**

In `app.js`, replace:

```js
        groupExpensesByDay() {
            // Ordenar gastos por fecha
            const sortedExpenses = [...this.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

            // Agrupar por día
            const groups = {};
            sortedExpenses.forEach(expense => {
                const date = new Date(expense.date);
                const dateKey = date.toISOString().split('T')[0];

                if (!groups[dateKey]) {
                    groups[dateKey] = {
                        date: this.formatDate(expense.date),
                        dateKey: dateKey,
                        expenses: [],
                        totalSource: 0,
                        totalTarget: 0
                    };
                }

                const total = expense.amount * expense.units;
                groups[dateKey].expenses.push(expense);
                groups[dateKey].totalSource += total;
                groups[dateKey].totalTarget += total * expense.exchangeRate;
            });

            // Convertir a array y ordenar
            this.groupedExpenses = Object.values(groups);
        },
```

with:

```js
        groupExpensesByDay() {
            // Ordenar gastos por fecha
            const sortedExpenses = [...this.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

            // Agrupar por día
            const groups = {};
            sortedExpenses.forEach(expense => {
                const date = new Date(expense.date);
                const dateKey = date.toISOString().split('T')[0];

                if (!groups[dateKey]) {
                    groups[dateKey] = {
                        date: this.formatDate(expense.date),
                        dateKey: dateKey,
                        expenses: [],
                        totalsByCurrency: {},
                        totalTarget: 0
                    };
                }

                const total = expense.amount * expense.units;
                groups[dateKey].expenses.push(expense);

                const code = expense.currency.code;
                if (!groups[dateKey].totalsByCurrency[code]) {
                    groups[dateKey].totalsByCurrency[code] = { symbol: expense.currency.symbol, total: 0 };
                }
                groups[dateKey].totalsByCurrency[code].total += total;
                groups[dateKey].totalTarget += total * expense.exchangeRate;
            });

            // Convertir a array y ordenar
            this.groupedExpenses = Object.values(groups);
        },
```

- [ ] **Step 2: Replace `totalSource` with `totalsByCurrency` in `calculateAnalytics`**

In `app.js`, replace:

```js
        calculateAnalytics() {
            const analytics = {
                totalSource: 0,
                totalTarget: 0,
                byTag: {}
            };

            this.expenses.forEach(expense => {
                const amount = expense.amount * expense.units;
                const targetAmount = amount * expense.exchangeRate;

                analytics.totalSource += amount;
                analytics.totalTarget += targetAmount;

                const tag = expense.tag || '🏷️';
                if (!analytics.byTag[tag]) {
                    analytics.byTag[tag] = {
                        totalSource: 0,
                        totalTarget: 0,
                        count: 0,
                        name: this.tagCategories.find(c => c.emoji === tag)?.name || 'Sin etiqueta'
                    };
                }
                analytics.byTag[tag].totalSource += amount;
                analytics.byTag[tag].totalTarget += targetAmount;
                analytics.byTag[tag].count++;
            });

            // Convert to array and sort by target amount
            analytics.tagsSorted = Object.entries(analytics.byTag)
                .map(([emoji, data]) => ({
                    emoji,
                    ...data
                }))
                .sort((a, b) => b.totalTarget - a.totalTarget);

            return analytics;
        },
```

with:

```js
        calculateAnalytics() {
            const analytics = {
                totalsByCurrency: {},
                totalTarget: 0,
                byTag: {}
            };

            this.expenses.forEach(expense => {
                const amount = expense.amount * expense.units;
                const targetAmount = amount * expense.exchangeRate;
                const code = expense.currency.code;

                if (!analytics.totalsByCurrency[code]) {
                    analytics.totalsByCurrency[code] = { symbol: expense.currency.symbol, total: 0 };
                }
                analytics.totalsByCurrency[code].total += amount;
                analytics.totalTarget += targetAmount;

                const tag = expense.tag || '🏷️';
                if (!analytics.byTag[tag]) {
                    analytics.byTag[tag] = {
                        totalsByCurrency: {},
                        totalTarget: 0,
                        count: 0,
                        name: this.tagCategories.find(c => c.emoji === tag)?.name || 'Sin etiqueta'
                    };
                }
                if (!analytics.byTag[tag].totalsByCurrency[code]) {
                    analytics.byTag[tag].totalsByCurrency[code] = { symbol: expense.currency.symbol, total: 0 };
                }
                analytics.byTag[tag].totalsByCurrency[code].total += amount;
                analytics.byTag[tag].totalTarget += targetAmount;
                analytics.byTag[tag].count++;
            });

            // Convert to array and sort by target amount
            analytics.tagsSorted = Object.entries(analytics.byTag)
                .map(([emoji, data]) => ({
                    emoji,
                    ...data
                }))
                .sort((a, b) => b.totalTarget - a.totalTarget);

            return analytics;
        },
```

- [ ] **Step 3: Add `formatCurrencyBreakdown` helper**

In `app.js`, add this method right after `formatTargetAmount`:

```js
        formatCurrencyBreakdown(totalsByCurrency) {
            return Object.values(totalsByCurrency)
                .map(({ symbol, total }) => this.formatCurrencyAmount(total, symbol))
                .join(' + ');
        },
```

- [ ] **Step 4: Wire up the breakdown in the overall total**

In `index.html`, change:

```html
                        <span x-html="formatSourceAmount(analytics.totalSource)"></span>
```

to:

```html
                        <span x-html="formatCurrencyBreakdown(analytics.totalsByCurrency)"></span>
```

- [ ] **Step 5: Wire up the breakdown in per-tag totals**

In `index.html`, change:

```html
                                <span x-html="formatSourceAmount(tag.totalSource)"></span>
```

to:

```html
                                <span x-html="formatCurrencyBreakdown(tag.totalsByCurrency)"></span>
```

- [ ] **Step 6: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

- [ ] **Step 7: Manual check**

With the THB (500) + USD (20) expenses from Task 4 both present and tagged the same category, confirm:
- "Resumen Total" shows something like `500.00 ฿ + 20.00 $` alongside the single `(...)` target total.
- The matching tag's breakdown in "Gastos por Etiqueta" shows the same two-currency breakdown.
- Tag a third expense (any currency) with a different tag, confirm its breakdown shows only its own currency (no cross-contamination between tags).

- [ ] **Step 8: Commit**

```bash
git add app.js index.html
git commit --no-gpg-sign -m "$(cat <<'EOF'
Show per-currency breakdown in totals instead of single-currency sum

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Fix edit-form to use the expense's own currency/rate

**Files:**
- Modify: `app.js:127-130` (`updateConversion`)
- Modify: `app.js:200-245` (`editExpense`)
- Modify: `index.html:217`, `index.html:244-247`

- [ ] **Step 1: Make `updateConversion` rate-aware of edit mode**

In `app.js`, change:

```js
        updateConversion() {
            const amount = parseFloat(this.newExpense.amount) || 0;
            this.convertedAmount = (amount * this.exchangeRate).toFixed(2);
        },
```

to:

```js
        updateConversion() {
            const amount = parseFloat(this.newExpense.amount) || 0;
            const rate = this.editingExpenseId ? this.newExpense.exchangeRate : this.exchangeRate;
            this.convertedAmount = (amount * rate).toFixed(2);
        },
```

- [ ] **Step 2: Snapshot the expense's currency and rate when entering edit mode**

In `app.js`, inside `editExpense()`, change:

```js
                this.newExpense = {
                    amount: expense.amount,
                    units: expense.units,
                    date: expense.date,
                    location: expense.location,
                    coords: expense.coords,
                    dateInput: date.toISOString().split('T')[0],
                    timeInput: date.toTimeString().slice(0, 5),
                    note: expense.note || ''
                };
```

to:

```js
                this.newExpense = {
                    amount: expense.amount,
                    units: expense.units,
                    date: expense.date,
                    location: expense.location,
                    coords: expense.coords,
                    dateInput: date.toISOString().split('T')[0],
                    timeInput: date.toTimeString().slice(0, 5),
                    note: expense.note || '',
                    currency: { ...expense.currency },
                    exchangeRate: expense.exchangeRate
                };
```

- [ ] **Step 3: Use the snapshotted currency/rate in the edit form's label**

In `index.html`, change:

```html
                                        <label>Importe (1 <span x-text="currencies.source.code"></span> = <span x-text="formatExchangeRate(exchangeRate)"></span><span x-text="currencies.target.symbol"></span>)</label>
```

to:

```html
                                        <label>Importe (1 <span x-text="newExpense.currency.code"></span> = <span x-text="formatExchangeRate(newExpense.exchangeRate)"></span><span x-text="currencies.target.symbol"></span>)</label>
```

- [ ] **Step 4: Use the snapshotted currency/rate in the edit form's TOTAL section**

In `index.html`, change:

```html
                                    <div class="total">
                                        <h3>TOTAL</h3>
                                        <div x-html="formatSourceAmount(newExpense.amount * newExpense.units)"></div>
                                        <div x-html="'(' + formatTargetAmount(newExpense.amount * newExpense.units * exchangeRate) + ')'"></div>
                                    </div>
```

to:

```html
                                    <div class="total">
                                        <h3>TOTAL</h3>
                                        <div x-html="formatCurrencyAmount(newExpense.amount * newExpense.units, newExpense.currency.symbol)"></div>
                                        <div x-html="'(' + formatTargetAmount(newExpense.amount * newExpense.units * newExpense.exchangeRate) + ')'"></div>
                                    </div>
```

- [ ] **Step 5: Verify syntax**

Run: `node -c app.js`
Expected: no output (exit code 0)

- [ ] **Step 6: Manual check**

With the THB (500) and USD (20) expenses present and the app's current global source currency set to USD, click "Editar" on the THB expense. Confirm the edit form's "Importe" label reads `Importe (1 THB = ...)` (not USD), and the TOTAL section shows the amount in `฿` with the correct target conversion. Save the edit (e.g. just change the note) and confirm via `javascript_tool`/localStorage inspection that the expense's `currency` and `exchangeRate` are unchanged from before the edit.

- [ ] **Step 7: Commit**

```bash
git add app.js index.html
git commit --no-gpg-sign -m "$(cat <<'EOF'
Fix edit form to use the expense's own currency and rate, not the live global ones

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full end-to-end verification pass

**Files:** none (verification only)

- [ ] **Step 1: Fresh-state walkthrough**

In the browser preview: clear `localStorage` and reload. Confirm the currency editor's target select is enabled (no expenses yet) and the "editar" button is visible (it now always is).

- [ ] **Step 2: Multi-currency creation walkthrough**

Set source currency to THB (default), save an expense of 500. Open currency editor, confirm target select is now disabled with the caption. Change source to USD, click "Guardar", confirm the rate-updated `alert()` reflects USD→EUR. Save an expense of 20.

- [ ] **Step 3: List rendering check**

Confirm the expense list shows `500.00 ฿` for the first and `20.00 $` for the second, each with its own correct `(... €)` target conversion using its own frozen rate.

- [ ] **Step 4: Totals check**

Confirm "Resumen Total" and the relevant tag summary show a `+`-joined breakdown across both currencies, and the target total is a single correct sum.

- [ ] **Step 5: Edit-form correctness check**

Edit the THB expense while the global source is USD; confirm the label and TOTAL show THB, not USD. Cancel without saving.

- [ ] **Step 6: Regression check — single currency case**

Delete all expenses (`resetData()`), confirm the app returns to the "no expenses" state (target select re-enabled), and that creating/editing a single expense in one currency still works exactly as before (no breakdown `+` artifacts with only one currency present).

- [ ] **Step 7: Report to user**

No code changes in this task — summarize the verification results to the user directly (no commit needed).
