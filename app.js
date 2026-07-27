document.addEventListener('alpine:init', () => {
    Alpine.data('expenseCalculator', () => ({
        // Database version
        DB_VERSION: '2.0',

        // Estado
        supportedCurrencies: {
            EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
            GBP: { code: 'GBP', symbol: '£', name: 'British Pound' },
            USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
            THB: { code: 'THB', symbol: '฿', name: 'Thai Baht' },
            IDR: { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
            MAD: { code: 'MAD', symbol: 'د.م.', name: 'Moroccan Dirham' },
            AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
            JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
            CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
            TRY: { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
            MYR: { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
            SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
            XOF: { code: 'XOF', symbol: 'CFA', name: 'West African CFA (Senegal)' },
            HRK: { code: 'HRK', symbol: 'kn', name: 'Croatian Kuna' },
            QAR: { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
            INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
            MXN: { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
            COP: { code: 'COP', symbol: '$', name: 'Colombian Peso' },
            PLN: { code: 'PLN', symbol: 'zł', name: 'Polish Złoty' },
            CRC: { code: 'CRC', symbol: '₡', name: 'Costa Rican Colón' },
            MUR: { code: 'MUR', symbol: '₨', name: 'Mauritian Rupee' },
            CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' }
        },
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
        showTagEditor: null,
        showNewExpenseTagEditor: false,
        tagCategories: [
            { emoji: '🍽️', name: 'Comida' },
            { emoji: '🍺', name: 'Bebidas' },
            { emoji: '🍭', name: 'Snacks' },
            { emoji: '🎁', name: 'Regalos' },
            { emoji: '🏛️', name: 'Museo' },
            { emoji: '🛶', name: 'Actividades' },
            { emoji: '🚕', name: 'Transporte' },
            { emoji: '👕', name: 'Ropa' },
            { emoji: '💊', name: 'Farmacia' }
        ],
        tagInput: '',
        editingExpenseId: null,
        maps: {},
        summaryMarkerCluster: null,
        currentLocation: null,
        expandedDays: new Set(),
        sheets: [],
        activeSheetId: null,
        showSheetSelector: false,

        // Inicialización
        init() {
            this.migrateToSheets();
            this.sheets = JSON.parse(localStorage.getItem('sheets') || '[]');
            this.activeSheetId = localStorage.getItem('activeSheetId');
            this.loadActiveSheetIntoState();
            this.resetForm();

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    this.currentLocation = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };
                    this.newExpense.coords = { ...this.currentLocation };
                });
            }

            // Ensure currency symbols are correct on init
            this.updateCurrencySymbol('source');
            this.updateCurrencySymbol('target');

            this.groupExpensesByDay();
            
            // Add click outside handler for tag editor
            document.addEventListener('click', (e) => {
                if (this.showTagEditor !== null) {
                    // Find the specific tag editor that's open
                    const clickedInsideTagEditor = e.target.closest('.tag-editor');
                    const clickedOnTagButton = e.target.closest('.expense-tag');
                    
                    // If we clicked outside both the tag editor and tag buttons, close it
                    if (!clickedInsideTagEditor && !clickedOnTagButton) {
                        this.showTagEditor = null;
                    }
                }
            });
            
            if (this.lastRateUpdate) {
                const lastUpdate = new Date(this.lastRateUpdate);
                const now = new Date();
                const daysSinceUpdate = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
                
                if (daysSinceUpdate > 7) {
                    this.checkExchangeRate();
                }
            } else {
                this.checkExchangeRate();
            }

            // Set today as expanded by default
            const today = new Date().toISOString().split('T')[0];
            this.expandedDays.add(today);

            // Check if we need to update the exchange rate
            this.checkExchangeRate();
        },

        // Métodos
        updateConversion() {
            const amount = parseFloat(this.newExpense.amount) || 0;
            const rate = this.editingExpenseId ? this.newExpense.exchangeRate : this.exchangeRate;
            this.convertedAmount = (amount * rate).toFixed(2);
        },

        incrementUnits() {
            this.newExpense.units++;
            this.updateConversion();
        },

        decrementUnits() {
            if (this.newExpense.units > 1) {
                this.newExpense.units--;
                this.updateConversion();
            }
        },

        saveExchangeRate() {
            this.saveActiveSheet();
        },

        saveExpense() {
            const amount = parseFloat(this.newExpense.amount);
            if (!amount || amount <= 0) return;

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

            this.expenses.push(expense);
            this.saveActiveSheet();
            this.resetForm();
            this.groupExpensesByDay();
            this.showCurrencyEditor = false; // Close currency editor if open
        },

        resetForm() {
            this.newExpense = {
                amount: '',
                units: 1,
                date: new Date(),
                location: '',
                coords: this.currentLocation ? { ...this.currentLocation } : null,
                tag: '',
                note: '',
                currency: { ...this.currencies.source },
                exchangeRate: this.exchangeRate
            };
            this.showNewExpenseTagEditor = false;
            this.convertedAmount = '0.00';
        },

        toggleTagEditor(id) {
            this.showTagEditor = this.showTagEditor === id ? null : id;
        },

        saveTag(id, category) {
            const index = this.expenses.findIndex(e => e.id === id);
            if (index !== -1) {
                this.expenses[index].tag = category.emoji;
                this.saveActiveSheet();
                this.showTagEditor = null;
                this.groupExpensesByDay();
            }
        },

        editExpense(id) {
            const expense = this.expenses.find(e => e.id === id);
            if (expense) {
                const date = new Date(expense.date);
                this.editingExpenseId = id;
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
                this.updateConversion();

                // Scroll to form and add flash effect
                setTimeout(() => {
                    const form = document.querySelector('.expense-calculator[x-show="editingExpenseId"]');
                    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    form.classList.add('highlight-flash');

                    // Initialize map
                    if (!this.maps[id]) {
                        this.maps[id] = L.map(this.$refs.editMap);
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '© OpenStreetMap contributors'
                        }).addTo(this.maps[id]);
                    }

                    // Update map with expense location or current location
                    if (this.newExpense.coords) {
                        if (this.marker) {
                            this.marker.setLatLng(this.newExpense.coords);
                        } else {
                            this.marker = L.marker(this.newExpense.coords).addTo(this.maps[id]);
                        }
                        this.maps[id].setView(this.newExpense.coords, 15);
                    }

                    // Remove class after animation ends
                    setTimeout(() => form.classList.remove('highlight-flash'), 1000);
                }, 0);
            }
        },

        updateLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    this.newExpense.coords = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };

                    if (this.maps[this.editingExpenseId] && this.marker) {
                        this.marker.setLatLng(this.newExpense.coords);
                        this.maps[this.editingExpenseId].setView(this.newExpense.coords, 15);
                    }
                });
            }
        },

        updateExpense() {
            const index = this.expenses.findIndex(e => e.id === this.editingExpenseId);
            if (index !== -1) {
                // Create date from inputs
                const dateTime = new Date(this.newExpense.dateInput + 'T' + this.newExpense.timeInput);

                this.expenses[index] = {
                    ...this.expenses[index],
                    amount: parseFloat(this.newExpense.amount),
                    units: this.newExpense.units,
                    date: dateTime.toISOString(),
                    location: this.newExpense.location,
                    coords: this.newExpense.coords,
                    note: (this.newExpense.note || '').slice(0, 24)
                };

                this.saveActiveSheet();
                this.editingExpenseId = null;
                this.resetForm();
                this.groupExpensesByDay();
            }
        },

        cancelEdit() {
            this.editingExpenseId = null;
            this.resetForm();
        },

        deleteExpense(id) {
            if (confirm('¿Seguro que quieres eliminar este gasto?')) {
                this.expenses = this.expenses.filter(e => e.id !== id);
                this.saveActiveSheet();
                this.groupExpensesByDay();
            }
        },

        showExpenseLocation(expense) {
            if (!expense.coords) return;

            // Toggle map visibility
            expense.showMap = !expense.showMap;

            if (expense.showMap) {
                // Initialize map after a short delay to ensure the container is visible
                setTimeout(() => {
                    const mapId = 'map-' + expense.id;

                    // Clean up existing map if it exists
                    if (this.maps[expense.id]) {
                        this.maps[expense.id].remove();
                        delete this.maps[expense.id];
                    }

                    // Create new map
                    this.maps[expense.id] = L.map(mapId);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap contributors'
                    }).addTo(this.maps[expense.id]);

                    L.marker(expense.coords).addTo(this.maps[expense.id]);
                    this.maps[expense.id].setView(expense.coords, 15);
                }, 100);
            } else {
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
            this.marker = null;
        },

        initSummaryMap() {
            // Never re-created once set — no .remove() here on purpose, unlike showExpenseLocation()
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

            // x-show on the section may still be mid-flush (e.g. just went from 0 to
            // 1 located expense) — wait for Alpine's DOM update so the container is
            // actually visible before Leaflet measures it, otherwise invalidateSize()
            // below re-caches a stale 0x0 size.
            this.$nextTick(() => {
                this.maps.summary.invalidateSize();

                this.summaryMarkerCluster.clearLayers();

                const located = this.expenses.filter(e => e.coords);
                located.forEach(expense => {
                    const amountLabel = this.formatCurrencyAmount(
                        expense.amount * expense.units,
                        this.escapeHtml(expense.currency.symbol)
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
            });
        },

        toggleDayExpansion(dateKey) {
            if (this.expandedDays.has(dateKey)) {
                this.expandedDays.delete(dateKey);
            } else {
                this.expandedDays.add(dateKey);
            }
        },

        isDayExpanded(dateKey) {
            return this.expandedDays.has(dateKey);
        },

        // Métodos para gestión de monedas
        updateCurrencySymbol(type) {
            const currency = this.supportedCurrencies[this.currencies[type].code];
            if (currency) {
                this.currencies[type].symbol = currency.symbol;
            }
        },

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

        saveCurrencies() {
            // Update symbols before saving
            this.updateCurrencySymbol('source');
            this.updateCurrencySymbol('target');

            this.saveActiveSheet();
            this.showCurrencyEditor = false;

            // Update exchange rate with new currencies
            this.updateExchangeRate();
        },
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

        formatSourceAmount(amount) {
            return this.formatCurrencyAmount(amount, this.currencies.source.symbol);
        },

        formatTargetAmount(amount) {
            return this.formatCurrencyAmount(amount, this.currencies.target.symbol);
        },

        formatCurrencyBreakdown(totalsByCurrency) {
            return Object.values(totalsByCurrency)
                .map(({ symbol, total }) => this.formatCurrencyAmount(total, symbol))
                .join(' + ');
        },

        formatThb(amount) {
            return amount.toLocaleString('th-TH');
        },

        formatEur(amount) {
            return amount.toFixed(2);
        },

        formatTime(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        },

        formatDate(dateStr) {
            const date = new Date(dateStr);
            const today = new Date();

            if (date.toDateString() === today.toDateString()) {
                return 'HOY';
            } else if (date.toDateString() === new Date(today - 86400000).toDateString()) {
                return 'AYER';
            } else {
                return date.toLocaleDateString();
            }
        },

        formatExchangeRate(rate) {
            // For very low rates (< 0.01), show more decimals
            if (rate < 0.01) return rate.toFixed(6);
            if (rate < 0.1) return rate.toFixed(5);
            return rate.toFixed(4);
        },

        // Agrupación de gastos por día
        groupedExpenses: [],

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

            this.renderSummaryMap();
        },

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

        get analytics() {
            return this.calculateAnalytics();
        },

        resetData() {
            if (confirm('¿Estás seguro de que quieres borrar todos los gastos? Esta acción no se puede deshacer.')) {
                this.expenses = [];
                this.saveActiveSheet();
                this.groupExpensesByDay();
            }
        },

        async checkExchangeRate() {
            const today = new Date().toISOString().split('T')[0];

            // Update if we don't have a rate or if it's from a previous day
            if (!this.lastRateUpdate || this.lastRateUpdate !== today) {
                await this.updateExchangeRate();
            }
        },

        async updateExchangeRate() {
            try {
                const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${this.currencies.source.code}`);
                const data = await response.json();

                if (data.rates && data.rates[this.currencies.target.code]) {
                    this.exchangeRate = data.rates[this.currencies.target.code];
                    this.lastRateUpdate = new Date().toISOString().split('T')[0];

                    // Save to localStorage
                    this.saveActiveSheet();

                    // Show success message
                    alert(`Tipo de cambio actualizado: 1 ${this.currencies.source.code} = ${this.exchangeRate} ${this.currencies.target.code}`);
                }
            } catch (error) {
                console.error('Error updating exchange rate:', error);
                alert('No se pudo actualizar el tipo de cambio. Por favor, inténtalo más tarde.');
            }
        },

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

            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gastorade-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

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
                        this.backfillExpenseCurrency(this.expenses, this.currencies.source);

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
    }));
});
