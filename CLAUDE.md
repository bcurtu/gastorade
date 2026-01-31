# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gastorade is a Progressive Web App (PWA) for managing travel expenses with currency conversion. Built as a single-page application with vanilla JavaScript and Alpine.js, it runs entirely client-side with offline support via Service Workers.

**Technology Stack:**
- Alpine.js for reactive UI
- Leaflet for map visualization
- Service Worker for offline functionality
- LocalStorage for data persistence
- External API: exchangerate-api.com for currency rates

## Architecture

### State Management
All application state is managed through Alpine.js's reactive data store in `app.js`. The main component `expenseCalculator()` contains:
- **Persistent state**: Stored in localStorage (expenses, exchange rates, currency settings)
- **UI state**: In-memory only (form inputs, expanded days, map instances)

### Data Flow
1. User actions trigger Alpine.js methods (e.g., `saveExpense()`, `editExpense()`)
2. Methods update the reactive state
3. State changes automatically trigger UI updates via Alpine.js directives
4. Critical state persists to localStorage for offline access

### Key Components

**Currency System** (app.js:4-34):
- `supportedCurrencies`: Static currency definitions with symbols
- `currencies.source/target`: Active currency pair
- Currency formatting handles RTL scripts (Arabic) and special cases (GBP)

**Expense Management** (app.js:141-286):
- Each expense stores its own exchange rate (snapshot at creation time)
- Expenses are grouped by day for display (app.js:424-452)
- Tags use emoji categories (app.js:50-60)

**Geolocation** (app.js:69-77, 237-251):
- Captures current location on init if available
- Stores coordinates with each expense
- Uses Leaflet for map rendering (app.js:288-321)

**Exchange Rate Updates** (app.js:505-534):
- Automatically checks on init if last update > 7 days old
- Fetches from exchangerate-api.com
- Updates only apply to new expenses (existing expenses preserve their original rate)

## Development Commands

### Local Development
Since this is a static site, serve it with any HTTP server:

```bash
# Python
python -m http.server 8000

# Node.js (if http-server is installed)
npx http-server -p 8000
```

Then navigate to `http://localhost:8000`

### Testing Service Worker
Service Workers require HTTPS or localhost. When testing PWA features:
1. Use `http://localhost` (not `127.0.0.1`)
2. Clear cache via DevTools > Application > Clear Storage
3. Unregister old Service Workers before testing changes

### Deployment
The site is deployed as a static site (current deployment uses GitHub Pages based on CNAME file). Simply push to the main branch to deploy.

## Code Patterns

### Alpine.js Conventions
- All reactive methods are defined in `app.js` as part of the Alpine data object
- HTML uses `x-data`, `x-show`, `x-model`, `x-text`, `x-html` directives
- Use `x-html` (not `x-text`) when displaying formatted currency amounts that contain HTML

### Currency Formatting
Always use `formatSourceAmount()` and `formatTargetAmount()` methods rather than direct formatting. These handle:
- Decimal precision
- RTL text direction for Arabic scripts
- GBP prefix vs suffix positioning

### LocalStorage Keys
- `expenses`: Array of expense objects
- `exchangeRate`: Current rate (number)
- `lastRateUpdate`: ISO date string
- `sourceCurrency`, `sourceCurrencySymbol`
- `targetCurrency`, `targetCurrencySymbol`

### Map Management
Maps are stored in the `maps` object keyed by expense ID. Always clean up with `map.remove()` before creating new instances to prevent memory leaks (see app.js:300-303, 316-319).

## Important Constraints

### No Build Process
This is a no-build vanilla JavaScript project. Do not introduce:
- npm/package.json
- Bundlers (webpack, vite, etc.)
- Transpilation (TypeScript, Babel)
- CSS preprocessors

### Offline-First
Any changes must work offline after initial load. The Service Worker caches:
- All HTML, CSS, JS files
- External CDN dependencies (Alpine.js, Leaflet)
- The app manifest

Update `sw.js` CACHE_NAME when changing cached resources.

### Data Persistence
All user data lives in localStorage. There is no backend. Consider this when:
- Adding new features that need persistence
- Handling data migrations (must work client-side only)
- Clearing data (use the "Zona de Peligro" reset pattern)

## Common Modifications

### Adding a New Currency
1. Add entry to `supportedCurrencies` object in app.js
2. Include proper Unicode symbol
3. If RTL script, add to RTL checks in `formatSourceAmount()` and `formatTargetAmount()`

### Adding a New Expense Tag Category
Add to the `tagCategories` array (app.js:50-60) with emoji and name.

### Modifying Exchange Rate Logic
Exchange rates are intentionally frozen per expense. To change this behavior, modify:
- `saveExpense()` to not store `exchangeRate`
- Display logic to use current `this.exchangeRate` instead of `expense.exchangeRate`
- Analytics calculations (app.js:454-491)

### Updating Service Worker Cache
When adding/removing cached resources:
1. Update `urlsToCache` array in sw.js
2. Increment `CACHE_NAME` version number
3. Test cache invalidation in DevTools

## File Structure

- `index.html` - Main application page
- `faq.html` - FAQ page (static content)
- `app.js` - All application logic (Alpine.js component)
- `style.css` - All styles (no CSS modules or scoping)
- `sw.js` - Service Worker for offline support
- `manifest.json` - PWA manifest
- `gastorade.jpg` - App icon
- `CNAME` - GitHub Pages custom domain configuration
