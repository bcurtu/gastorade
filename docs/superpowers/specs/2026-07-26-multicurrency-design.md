# Multicurrency support — design

## Problem

Gastorade currently supports exactly one source currency and one target
currency at a time, both stored globally (`currencies.source`,
`currencies.target`). The currency editor is only shown before the first
expense is created (`x-show="!expenses.length"`), which is how the app has
implicitly guaranteed that all expenses in a given install share the same
source currency.

The user wants to travel through multiple countries in a single trip/log,
recording expenses in different source currencies, while always converting
to one fixed target currency (e.g. home currency, EUR).

## Goals

- Allow expenses to be created in different source currencies over time.
- Target currency stays single and fixed once the log has started.
- Each expense renders using its own currency, not whatever the "current"
  global source currency happens to be.
- Existing (pre-migration) expenses keep rendering correctly.

## Non-goals

- No per-expense currency picker in the expense form — currency selection
  continues to go through the existing global currency editor.
- No editing the currency of an already-saved expense.
- No changes to tag categories, notes, geolocation, or the exchange-rate
  fetch mechanism itself (beyond re-fetching on source currency change,
  which already happens today).

## Data model changes

### Expense object

Add one field, populated at creation time (a snapshot, same pattern as
`exchangeRate` today):

```js
{
  ...,
  currency: { code: 'THB', symbol: '฿' },
  exchangeRate: 0.0261, // already existed — rate for `currency.code` → target, at creation time
}
```

`editExpense()` / `updateExpense()` never modify `currency` — it is
immutable after creation, consistent with `exchangeRate`.

### Migration for existing expenses

Expenses saved before this change won't have a `currency` field. Because
the currency editor was hidden once `expenses.length > 0`, every expense in
an existing install was necessarily created under whatever source currency
is *currently* set in `currencies.source` — that invariant held until now.

On `init()`, backfill: for any expense missing `currency`, set
`expense.currency = { code: currencies.source.code, symbol:
currencies.source.symbol }`, then persist `expenses` back to localStorage
once if any backfill happened.

### DB_VERSION

Bump `DB_VERSION` from `'1.0'` to `'1.1'` to mark the schema change (import
already handles version mismatches with a confirm-to-proceed prompt, so
this is just bookkeeping, not a behavior change).

## Currency editor changes

- The "editar" button next to the "Importe" label loses its
  `x-show="!expenses.length"` guard — it's always visible now.
- Inside `.currency-editor`:
  - Source `<select>` stays always enabled.
  - Target `<select>` gets `:disabled="expenses.length > 0"`, with a small
    caption shown only while disabled (e.g. "moneda destino fija una vez
    hay gastos registrados").
- `saveCurrencies()` is unchanged — it already calls `updateExchangeRate()`
  after saving, which re-fetches the rate for the new source→target pair.
  This covers "fetch rate automatically when source currency changes."

## Rendering changes

### Per-expense formatting (list items)

Today, list items call `formatSourceAmount(expense.amount * expense.units)`,
which formats using the **global current** `currencies.source.symbol` —
wrong once expenses can have different currencies than the current one.

Extract the RTL/GBP formatting logic from `formatSourceAmount` /
`formatTargetAmount` into a shared helper:

```js
formatCurrencyAmount(amount, symbol) {
    const formattedAmount = amount.toFixed(2);
    const isRTL = ['د.م.', 'د.إ', 'ر.ق'].includes(symbol);
    const isGBP = symbol === '£';
    if (isRTL) return `${formattedAmount} <span class="rtl-text">${symbol}</span>`;
    if (isGBP) return `${symbol}${formattedAmount}`;
    return `${formattedAmount} ${symbol}`;
}
```

`formatSourceAmount(amount)` / `formatTargetAmount(amount)` become thin
wrappers calling `formatCurrencyAmount(amount, this.currencies.source.symbol)`
/ `...target.symbol` — used by the create-form preview (still driven by the
live global source, which is correct there since it's a new expense).

List items (`index.html` expense row) call
`formatCurrencyAmount(expense.amount * expense.units, expense.currency.symbol)`
instead of `formatSourceAmount(...)`.

### Totals — per-currency breakdown

`groupExpensesByDay()` and `calculateAnalytics()` currently accumulate a
single `totalSource` assuming one shared currency. Replace with a
per-currency map:

```js
totalsByCurrency: {
    THB: { symbol: '฿', total: 500 },
    USD: { symbol: '$', total: 20 }
}
```

accumulated per group (day, or tag) by `expense.currency.code`.
`totalTarget` is unchanged (always a single sum — target currency is
uniform across all expenses by design).

A new formatter renders the breakdown as text:

```js
formatCurrencyBreakdown(totalsByCurrency) {
    return Object.values(totalsByCurrency)
        .map(({ symbol, total }) => formatCurrencyAmount(total, symbol))
        .join(' + ');
}
```

Used in place of `formatSourceAmount(day.totalSource)` /
`formatSourceAmount(tag.totalSource)` /
`formatSourceAmount(analytics.totalSource)`.

## Edit-form correctness fix

`editExpense()` currently leaves the edit form's "Importe" label and live
conversion preview reading the **global** `currencies.source` /
`this.exchangeRate` — harmless today (single currency), but wrong once
multiple currencies exist: editing a USD expense while the global source is
now THB would show "Importe (1 THB = ...)" while editing a USD amount.

Fix: when entering edit mode, snapshot the expense's own currency and rate
onto the editing state:

```js
this.newExpense.currency = { ...expense.currency };
this.newExpense.exchangeRate = expense.exchangeRate;
```

- The edit-form's "Importe" label uses `newExpense.currency.code` instead
  of `currencies.source.code` (target side stays `currencies.target`,
  since target is global and fixed).
- `updateConversion()` uses `this.editingExpenseId ? this.newExpense.exchangeRate
  : this.exchangeRate` to pick the right rate for the preview calculation.
- The edit form does not offer a currency selector — currency is
  display-only there (plain text), matching that it's immutable once
  created.

## Testing / verification

No test framework exists in this repo (vanilla JS, no build — per
CLAUDE.md). Verification is `node -c app.js` for syntax, plus manual
browser testing via the Browser pane:

- Create expenses in two different source currencies in sequence; verify
  each renders with its own symbol in the list.
- Verify day/tag totals show a breakdown when currencies are mixed within
  a group, and a single total when not.
- Verify the target currency select becomes disabled after the first
  expense, with the explanatory caption showing.
- Verify editing an old expense (created in currency A) while the current
  global source is currency B shows the correct original currency/rate in
  the edit form, and doesn't corrupt the stored `currency`/`exchangeRate`
  on save.
- Verify existing localStorage data (no `currency` field) migrates
  correctly on load and renders with the right symbol.
