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
        exchangeRate: 0,
        lastRateUpdate: null,
        newExpense: {
            amount: '',
            units: 1,
            date: new Date(),
            location: '',
            coords: null,
            tag: '',
            note: '',
            currency: { code: 'THB', symbol: '฿' },
            exchangeRate: 0
        },
        expenses: [],
        tagCategories: [
            { emoji: '🍽️', name: 'Comida' },
            { emoji: '🍦', name: 'Snacks' },
            { emoji: '🛍️', name: 'Compras' },
            { emoji: '🎟️', name: 'Entradas' },
            { emoji: '🎢', name: 'Experiencias' },
            { emoji: '🎁', name: 'Regalos' },
            { emoji: '🚕', name: 'Transporte' },
            { emoji: '🏨', name: 'Alojamiento' },
            { emoji: '🏷️', name: 'Otros' }
        ],
        editingExpenseId: null,
        maps: {},
        marker: null,
        summaryMarkerCluster: null,
        currentLocation: null,
        sheets: [],
        activeSheetId: null,

        // Estado de UI (rediseño "Capturar primero")
        activeTab: 'add',
        showDataScreen: false,
        sheetsSheetOpen: false,
        settingsSheetOpen: false,
        currencySheetOpen: false,
        tagPickerOpen: false,
        onboardingActive: false,
        onboardingCancelable: false,
        onboardingForm: { name: '', source: 'THB', target: 'EUR' },
        onboardingRate: null,
        saveLocation: true,
        tagFilter: null,
        swipedExpenseId: null,
        currencyQuery: '',
        currencyCandidate: null,
        ratesTable: null,
        editMapVisible: false,
        settingsName: '',
        settingsTarget: 'EUR',

        // Inicialización
        init() {
            this.migrateToSheets();
            this.sheets = JSON.parse(localStorage.getItem('sheets') || '[]');
            this.migrateTagCategories();
            this.activeSheetId = localStorage.getItem('activeSheetId');
            if (!this.sheets.find(s => s.id === this.activeSheetId)) {
                this.activeSheetId = this.sheets.length ? this.sheets[0].id : null;
            }
            this.ratesTable = JSON.parse(localStorage.getItem('ratesTable') || 'null');

            if (!this.activeSheetId) {
                this.startOnboarding(false);
            } else {
                this.loadActiveSheetIntoState();
                this.updateCurrencySymbol('source');
                this.updateCurrencySymbol('target');
                this.checkExchangeRate();
            }

            this.resetForm();
            this.groupExpensesByDay();

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    this.currentLocation = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };
                    this.newExpense.coords = { ...this.currentLocation };
                });
            }

            // Cerrar la fila deslizada al tocar fuera
            document.addEventListener('click', (e) => {
                if (this.swipedExpenseId && !e.target.closest('.expense-row-wrap')) {
                    this.swipedExpenseId = null;
                }
            });

            // Botón "atrás" del sistema (Android/gestos): cerrar hojas y volver
            // a la pestaña Añadir por niveles en vez de salir de la app.
            // Mantenemos una entrada centinela en el historial; cada "atrás" la
            // consume, cerramos un nivel y la volvemos a poner. Si no queda
            // nada que cerrar, dejamos que el "atrás" salga de verdad.
            history.pushState({ gastorade: true }, '');
            window.addEventListener('popstate', () => {
                if (this.handleSystemBack()) {
                    history.pushState({ gastorade: true }, '');
                } else {
                    history.back();
                }
            });
        },

        // Cierra el nivel de UI superior. Devuelve false si ya estamos en la
        // pantalla base (Añadir, sin hojas abiertas): ahí "atrás" sale de la app.
        handleSystemBack() {
            if (this.tagPickerOpen) { this.tagPickerOpen = false; return true; }
            if (this.editingExpenseId) { this.cancelEdit(); return true; }
            if (this.currencySheetOpen) { this.currencySheetOpen = false; return true; }
            if (this.settingsSheetOpen) { this.settingsSheetOpen = false; return true; }
            if (this.sheetsSheetOpen) { this.sheetsSheetOpen = false; return true; }
            if (this.onboardingActive && this.onboardingCancelable) { this.onboardingActive = false; return true; }
            if (this.showDataScreen) { this.showDataScreen = false; return true; }
            if (this.activeTab !== 'add' && !this.onboardingActive) { this.switchTab('add'); return true; }
            return false;
        },

        // ------------------------------------------------------------
        // Utilidades numéricas y de formato (es-ES)
        // ------------------------------------------------------------
        parseAmount(value) {
            const s = String(value ?? '').trim();
            if (!s) return 0;
            if (s.includes(',')) {
                return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
            }
            return parseFloat(s) || 0;
        },

        formatNumber(n, decimals = 2) {
            return (n || 0).toLocaleString('es-ES', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        },

        formatCurrencyAmount(amount, symbol, decimals = 2) {
            const formatted = this.formatNumber(amount, decimals);
            const isRTL = ['د.م.', 'د.إ', 'ر.ق'].includes(symbol);
            const isGBP = symbol === '£';

            if (isRTL) {
                return `${formatted} <span class="rtl-text">${symbol}</span>`;
            } else if (isGBP) {
                return `${symbol}${formatted}`;
            } else {
                return `${formatted} ${symbol}`;
            }
        },

        formatTargetAmount(amount) {
            return this.formatCurrencyAmount(amount, this.currencies.target.symbol, 2);
        },

        formatSourceAmount(amount, symbol) {
            const sym = symbol || this.currencies.source.symbol;
            const decimals = Math.abs(amount % 1) > 0.000001 ? 2 : 0;
            return this.formatCurrencyAmount(amount, sym, decimals);
        },

        formatCurrencyBreakdown(totalsByCurrency) {
            return Object.values(totalsByCurrency)
                .map(({ symbol, total }) => this.formatSourceAmount(total, symbol))
                .join(' + ');
        },

        escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        rateLabelFor(rate, sourceSymbol, targetSymbol) {
            // rate: 1 unidad origen → destino. Se muestra invertido: "1 € = 162,40 ¥"
            if (!rate) return '';
            return `1 ${targetSymbol} = ${this.formatNumber(1 / rate, 2)} ${sourceSymbol}`;
        },

        get rateLabel() {
            return this.rateLabelFor(this.exchangeRate, this.currencies.source.symbol, this.currencies.target.symbol);
        },

        formatTime(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        },

        formatDayLabel(dateKey) {
            const date = new Date(dateKey + 'T12:00:00');
            const today = new Date();
            const yesterday = new Date(Date.now() - 86400000);
            const options = { day: 'numeric', month: 'long' };
            if (date.getFullYear() !== today.getFullYear()) options.year = 'numeric';
            const label = date.toLocaleDateString('es-ES', options);

            if (date.toDateString() === today.toDateString()) return 'Hoy · ' + label;
            if (date.toDateString() === yesterday.toDateString()) return 'Ayer · ' + label;
            return label;
        },

        tagName(emoji) {
            return this.tagCategories.find(c => c.emoji === emoji)?.name || '';
        },

        expenseTitle(expense) {
            return expense.note || this.tagName(expense.tag) || 'Gasto';
        },

        expenseMeta(expense) {
            const parts = [];
            if (expense.units > 1) {
                parts.push(`${expense.units} × ${this.formatSourceAmount(expense.amount, expense.currency.symbol).replace(/<[^>]*>/g, '')}`);
            }
            parts.push(this.formatTime(expense.date));
            return parts.join(' · ');
        },

        // ------------------------------------------------------------
        // Teclado numérico (pestaña Añadir)
        // ------------------------------------------------------------
        keypadDigit(digit) {
            let amount = String(this.newExpense.amount);
            const [intPart, fracPart] = amount.split(',');
            if (fracPart !== undefined && fracPart.length >= 2) return;
            if (fracPart === undefined && intPart.length >= 9) return;
            if (amount === '0') amount = '';
            this.newExpense.amount = amount + digit;
        },

        keypadComma() {
            const amount = String(this.newExpense.amount);
            if (!amount) {
                this.newExpense.amount = '0,';
            } else if (!amount.includes(',')) {
                this.newExpense.amount = amount + ',';
            }
        },

        keypadBackspace() {
            this.newExpense.amount = String(this.newExpense.amount).slice(0, -1);
        },

        get amountValue() {
            return this.parseAmount(this.newExpense.amount);
        },

        get amountDisplay() {
            const amount = String(this.newExpense.amount);
            if (!amount) return '0';
            const [intPart, fracPart] = amount.split(',');
            const grouped = (parseInt(intPart || '0', 10)).toLocaleString('es-ES');
            return fracPart !== undefined ? `${grouped},${fracPart}` : grouped;
        },

        get convertedValue() {
            return this.amountValue * this.newExpense.units * this.exchangeRate;
        },

        incrementUnits() {
            this.newExpense.units++;
        },

        decrementUnits() {
            if (this.newExpense.units > 1) {
                this.newExpense.units--;
            }
        },

        toggleSaveLocation() {
            this.saveLocation = !this.saveLocation;
            if (this.saveLocation && !this.currentLocation && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    this.currentLocation = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };
                    this.newExpense.coords = { ...this.currentLocation };
                });
            }
        },

        get quickTags() {
            const base = this.tagCategories.slice(0, 5);
            const selected = this.newExpense.tag;
            if (selected && !base.some(c => c.emoji === selected)) {
                const extra = this.tagCategories.find(c => c.emoji === selected);
                if (extra) base[base.length - 1] = extra;
            }
            return base;
        },

        toggleQuickTag(emoji) {
            this.newExpense.tag = this.newExpense.tag === emoji ? '' : emoji;
        },

        pickTag(emoji) {
            this.newExpense.tag = emoji;
            this.tagPickerOpen = false;
        },

        // ------------------------------------------------------------
        // Navegación
        // ------------------------------------------------------------
        switchTab(tab) {
            this.activeTab = tab;
            this.showDataScreen = false;
            this.swipedExpenseId = null;
            if (tab === 'summary') {
                this.$nextTick(() => {
                    this.initSummaryMap();
                    this.renderSummaryMap();
                });
            }
        },

        closeAllSheets() {
            this.sheetsSheetOpen = false;
            this.settingsSheetOpen = false;
            this.currencySheetOpen = false;
            this.tagPickerOpen = false;
            if (this.editingExpenseId) this.cancelEdit();
        },

        openDataScreen() {
            this.sheetsSheetOpen = false;
            this.showDataScreen = true;
        },

        // ------------------------------------------------------------
        // Gastos: guardar, editar, borrar
        // ------------------------------------------------------------
        saveExpense() {
            const amount = this.amountValue;
            if (!amount || amount <= 0) return;

            const expense = {
                id: Date.now().toString(),
                amount: amount,
                units: this.newExpense.units,
                currency: { code: this.currencies.source.code, symbol: this.currencies.source.symbol },
                exchangeRate: this.exchangeRate,
                date: new Date().toISOString(),
                location: '',
                coords: this.saveLocation && this.newExpense.coords ? { ...this.newExpense.coords } : null,
                showMap: false,
                tag: this.newExpense.tag || '',
                note: (this.newExpense.note || '').slice(0, 24)
            };

            this.expenses.push(expense);
            this.saveActiveSheet();
            this.resetForm();
            this.groupExpensesByDay();
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
        },

        editExpense(id) {
            const expense = this.expenses.find(e => e.id === id);
            if (!expense) return;

            const date = new Date(expense.date);
            this.editingExpenseId = id;
            this.editMapVisible = false;
            this.swipedExpenseId = null;
            this.newExpense = {
                amount: String(expense.amount).replace('.', ','),
                units: expense.units,
                date: expense.date,
                location: expense.location,
                coords: expense.coords ? { ...expense.coords } : null,
                dateInput: date.toISOString().split('T')[0],
                timeInput: date.toTimeString().slice(0, 5),
                tag: expense.tag || '',
                note: expense.note || '',
                currency: { ...expense.currency },
                exchangeRate: expense.exchangeRate
            };
        },

        get editConvertedUnit() {
            return this.parseAmount(this.newExpense.amount) * (this.newExpense.exchangeRate || 0);
        },

        get editConvertedTotal() {
            return this.editConvertedUnit * this.newExpense.units;
        },

        toggleEditMap() {
            this.editMapVisible = !this.editMapVisible;
            if (this.editMapVisible) {
                this.$nextTick(() => this.initEditMap());
            } else {
                this.cleanupEditMap();
            }
        },

        initEditMap() {
            if (!this.newExpense.coords) return;

            if (!this.maps.editSheet) {
                const container = document.getElementById('edit-sheet-map');
                if (!container) return;
                this.maps.editSheet = L.map(container);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(this.maps.editSheet);
            }

            this.maps.editSheet.invalidateSize();
            if (this.marker) {
                this.marker.setLatLng(this.newExpense.coords);
            } else {
                this.marker = L.marker(this.newExpense.coords).addTo(this.maps.editSheet);
            }
            this.maps.editSheet.setView(this.newExpense.coords, 15);
        },

        cleanupEditMap() {
            if (this.maps.editSheet) {
                this.maps.editSheet.remove();
                delete this.maps.editSheet;
            }
            this.marker = null;
            this.editMapVisible = false;
        },

        updateLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    this.newExpense.coords = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };

                    if (this.maps.editSheet && this.marker) {
                        this.marker.setLatLng(this.newExpense.coords);
                        this.maps.editSheet.setView(this.newExpense.coords, 15);
                    }
                });
            }
        },

        updateExpense() {
            const index = this.expenses.findIndex(e => e.id === this.editingExpenseId);
            if (index !== -1) {
                const dateTime = new Date(this.newExpense.dateInput + 'T' + this.newExpense.timeInput);

                this.expenses[index] = {
                    ...this.expenses[index],
                    amount: this.parseAmount(this.newExpense.amount),
                    units: this.newExpense.units,
                    date: dateTime.toISOString(),
                    location: this.newExpense.location,
                    coords: this.newExpense.coords,
                    tag: this.newExpense.tag || '',
                    note: (this.newExpense.note || '').slice(0, 24)
                };

                this.saveActiveSheet();
                this.cleanupEditMap();
                this.editingExpenseId = null;
                this.resetForm();
                this.groupExpensesByDay();
            }
        },

        cancelEdit() {
            this.cleanupEditMap();
            this.editingExpenseId = null;
            this.resetForm();
        },

        deleteExpense(id) {
            if (confirm('¿Seguro que quieres eliminar este gasto?')) {
                this.expenses = this.expenses.filter(e => e.id !== id);
                if (this.editingExpenseId === id) this.cancelEdit();
                this.swipedExpenseId = null;
                this.saveActiveSheet();
                this.groupExpensesByDay();
            }
        },

        // Deslizar filas (editar / borrar)
        rowTouchStart(event, id) {
            this._touchX = event.touches[0].clientX;
            this._touchY = event.touches[0].clientY;
        },

        rowTouchMove(event, id) {
            const dx = event.touches[0].clientX - this._touchX;
            const dy = event.touches[0].clientY - this._touchY;
            if (Math.abs(dx) < 20 || Math.abs(dx) < Math.abs(dy)) return;
            if (dx < 0) {
                this.swipedExpenseId = id;
            } else if (this.swipedExpenseId === id) {
                this.swipedExpenseId = null;
            }
        },

        rowClick(id) {
            if (this.swipedExpenseId) {
                this.swipedExpenseId = null;
                return;
            }
            this.editExpense(id);
        },

        // ------------------------------------------------------------
        // Mapas
        // ------------------------------------------------------------
        cleanupMaps() {
            Object.values(this.maps).forEach(map => map.remove());
            this.maps = {};
            this.summaryMarkerCluster = null;
            this.marker = null;
            this.editMapVisible = false;
        },

        initSummaryMap() {
            if (this.maps.summary) return;

            const container = document.getElementById('summary-map');
            if (!container) return;

            this.maps.summary = L.map(container);
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

            // Esperar al flush de Alpine para que el contenedor tenga tamaño real
            this.$nextTick(() => {
                this.maps.summary.invalidateSize();

                this.summaryMarkerCluster.clearLayers();

                const located = this.expenses.filter(e => e.coords);
                located.forEach(expense => {
                    const amountLabel = this.formatSourceAmount(
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

        get locatedCount() {
            return this.expenses.filter(e => e.coords).length;
        },

        // ------------------------------------------------------------
        // Monedas
        // ------------------------------------------------------------
        updateCurrencySymbol(type) {
            const currency = this.supportedCurrencies[this.currencies[type].code];
            if (currency) {
                this.currencies[type].symbol = currency.symbol;
            }
        },

        openCurrencySheet() {
            this.currencyCandidate = this.currencies.source.code;
            this.currencyQuery = '';
            this.currencySheetOpen = true;
            this.fetchRatesTable();
        },

        async fetchRatesTable() {
            const base = this.currencies.target.code;
            const today = new Date().toISOString().split('T')[0];

            if (this.ratesTable && this.ratesTable.base === base && this.ratesTable.date === today) return;

            try {
                const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`);
                const data = await response.json();
                if (data.rates) {
                    this.ratesTable = { base, date: today, rates: data.rates };
                    localStorage.setItem('ratesTable', JSON.stringify(this.ratesTable));
                }
            } catch (error) {
                console.error('Error fetching rates table:', error);
                if (this.ratesTable && this.ratesTable.base !== base) this.ratesTable = null;
            }
        },

        currencySubtitle(code) {
            const rate = this.ratesTable?.base === this.currencies.target.code
                ? this.ratesTable?.rates?.[code]
                : null;
            if (!rate) return '';
            const symbol = this.supportedCurrencies[code]?.symbol || code;
            return `1 ${this.currencies.target.symbol} = ${this.formatNumber(rate, 2)} ${symbol}`;
        },

        get filteredCurrencies() {
            const query = this.currencyQuery.trim().toLowerCase();
            return Object.values(this.supportedCurrencies).filter(c =>
                !query || c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query)
            );
        },

        get currencyCtaLabel() {
            const candidate = this.supportedCurrencies[this.currencyCandidate];
            if (!candidate) return 'Cerrar';
            if (this.currencyCandidate === this.currencies.source.code) {
                return `Seguir en ${candidate.name.toLowerCase()}`;
            }
            return `Cambiar a ${candidate.code}`;
        },

        applyCurrencyChange() {
            if (this.currencyCandidate && this.currencyCandidate !== this.currencies.source.code) {
                this.currencies.source.code = this.currencyCandidate;
                this.updateCurrencySymbol('source');

                // Si tenemos la tabla de cambios de hoy, sembrar el tipo al instante
                const tableRate = this.ratesTable?.base === this.currencies.target.code
                    ? this.ratesTable?.rates?.[this.currencyCandidate]
                    : null;
                if (tableRate) {
                    this.exchangeRate = 1 / tableRate;
                    this.lastRateUpdate = new Date().toISOString().split('T')[0];
                    this.saveActiveSheet();
                } else {
                    this.saveActiveSheet();
                    this.updateExchangeRate();
                }
                this.newExpense.currency = { ...this.currencies.source };
            }
            this.currencySheetOpen = false;
        },

        async checkExchangeRate() {
            const today = new Date().toISOString().split('T')[0];
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
                    this.saveActiveSheet();
                }
            } catch (error) {
                console.error('Error updating exchange rate:', error);
            }
        },

        // ------------------------------------------------------------
        // Hojas
        // ------------------------------------------------------------
        get activeSheet() {
            return this.sheets.find(s => s.id === this.activeSheetId) || null;
        },

        get activeSheetName() {
            return this.activeSheet?.name || '';
        },

        sheetTotal(sheet) {
            return sheet.expenses.reduce((sum, e) => sum + e.amount * e.units * e.exchangeRate, 0);
        },

        sheetMeta(sheet) {
            const count = sheet.expenses.length;
            return `${sheet.currencies.source.code} → ${sheet.currencies.target.code} · ${count} ${count === 1 ? 'gasto' : 'gastos'}`;
        },

        sheetTargetSymbol(sheet) {
            return sheet.currencies.target.symbol;
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

        // Remapear etiquetas de categorías retiradas a las unificadas
        // (Bebidas→Comida, Ropa/Farmacia→Compras, y cambios de icono)
        migrateTagCategories() {
            const map = { '🍺': '🍽️', '🍭': '🍦', '👕': '🛍️', '💊': '🛍️', '🏛️': '🎟️', '🛶': '🎢' };
            let changed = false;
            this.sheets.forEach(sheet => {
                sheet.expenses.forEach(expense => {
                    if (expense.tag && map[expense.tag]) {
                        expense.tag = map[expense.tag];
                        changed = true;
                    }
                });
            });
            if (changed) localStorage.setItem('sheets', JSON.stringify(this.sheets));
        },

        migrateToSheets() {
            if (localStorage.getItem('sheets')) return;

            const legacyExpenses = JSON.parse(localStorage.getItem('expenses') || 'null');
            const hasLegacyData = legacyExpenses !== null || localStorage.getItem('sourceCurrency') !== null;
            if (!hasLegacyData) return; // instalación nueva → onboarding

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

        selectSheet(id) {
            if (!this.sheets.find(s => s.id === id)) return;

            this.cancelEdit();
            this.cleanupMaps();

            this.activeSheetId = id;
            localStorage.setItem('activeSheetId', id);
            this.loadActiveSheetIntoState();

            this.resetForm();
            this.tagFilter = null;
            this.swipedExpenseId = null;
            this.sheetsSheetOpen = false;

            // cleanupMaps() borró el mapa del resumen: recrearlo si esa pestaña está a la vista
            if (this.activeTab === 'summary') {
                this.$nextTick(() => this.initSummaryMap());
            }

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
                this.showDataScreen = false;
                if (this.sheets.length === 0) {
                    this.activeSheetId = null;
                    localStorage.removeItem('activeSheetId');
                    this.expenses = [];
                    this.groupedExpenses = [];
                    this.startOnboarding(false);
                } else {
                    this.selectSheet(this.sheets[0].id);
                }
            }
        },

        // Ajustes de la hoja activa
        openSettingsSheet() {
            this.settingsName = this.activeSheetName;
            this.settingsTarget = this.currencies.target.code;
            this.sheetsSheetOpen = false;
            this.settingsSheetOpen = true;
        },

        saveSettings() {
            this.renameSheet(this.activeSheetId, this.settingsName);

            if (this.expenses.length === 0 && this.settingsTarget !== this.currencies.target.code) {
                this.currencies.target.code = this.settingsTarget;
                this.updateCurrencySymbol('target');
                this.saveActiveSheet();
                this.updateExchangeRate();
            }
            this.settingsSheetOpen = false;
        },

        // ------------------------------------------------------------
        // Onboarding — crear hoja
        // ------------------------------------------------------------
        startOnboarding(cancelable) {
            this.onboardingCancelable = cancelable;
            this.onboardingForm = {
                name: '',
                source: 'THB',
                target: this.currencies?.target?.code || 'EUR'
            };
            this.onboardingRate = null;
            this.sheetsSheetOpen = false;
            this.onboardingActive = true;
            this.fetchOnboardingRate();
        },

        async fetchOnboardingRate() {
            const { source, target } = this.onboardingForm;
            this.onboardingRate = null;
            try {
                const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${source}`);
                const data = await response.json();
                // Ignorar la respuesta si el usuario ya cambió de moneda
                if (this.onboardingForm.source === source && data.rates?.[this.onboardingForm.target]) {
                    this.onboardingRate = data.rates[this.onboardingForm.target];
                }
            } catch (error) {
                console.error('Error fetching onboarding rate:', error);
            }
        },

        get onboardingRateLabel() {
            const source = this.supportedCurrencies[this.onboardingForm.source];
            const target = this.supportedCurrencies[this.onboardingForm.target];
            if (!this.onboardingRate || !source || !target) return '';
            return this.rateLabelFor(this.onboardingRate, source.symbol, target.symbol);
        },

        createSheetFromOnboarding() {
            const { name, source, target } = this.onboardingForm;
            const sourceCurrency = this.supportedCurrencies[source];
            const targetCurrency = this.supportedCurrencies[target];
            if (!sourceCurrency || !targetCurrency) return;

            const sheet = {
                id: Date.now().toString(),
                name: name.trim(),
                isCustomName: !!name.trim(),
                createdAt: new Date().toISOString(),
                expenses: [],
                currencies: {
                    source: { code: sourceCurrency.code, symbol: sourceCurrency.symbol },
                    target: { code: targetCurrency.code, symbol: targetCurrency.symbol }
                },
                exchangeRate: this.onboardingRate || 0,
                lastRateUpdate: this.onboardingRate ? new Date().toISOString().split('T')[0] : null
            };
            if (!sheet.name) sheet.name = this.computeSheetName(sheet);

            this.sheets.push(sheet);
            localStorage.setItem('sheets', JSON.stringify(this.sheets));

            this.onboardingActive = false;
            this.selectSheet(sheet.id);
            this.activeTab = 'add';
        },

        // ------------------------------------------------------------
        // Agrupación y analítica
        // ------------------------------------------------------------
        groupedExpenses: [],

        groupExpensesByDay() {
            const sortedExpenses = [...this.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

            const groups = {};
            sortedExpenses.forEach(expense => {
                const date = new Date(expense.date);
                const dateKey = date.toISOString().split('T')[0];

                if (!groups[dateKey]) {
                    groups[dateKey] = {
                        date: this.formatDayLabel(dateKey),
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

            this.groupedExpenses = Object.values(groups);

            this.renderSummaryMap();
        },

        get tagChips() {
            const counts = {};
            this.expenses.forEach(e => {
                const tag = e.tag || '🏷️';
                counts[tag] = (counts[tag] || 0) + 1;
            });
            return Object.entries(counts)
                .map(([emoji, count]) => ({ emoji, count }))
                .sort((a, b) => b.count - a.count);
        },

        get visibleGroups() {
            if (!this.tagFilter) return this.groupedExpenses;
            return this.groupedExpenses
                .map(group => {
                    const expenses = group.expenses.filter(e => (e.tag || '🏷️') === this.tagFilter);
                    const totalTarget = expenses.reduce((sum, e) => sum + e.amount * e.units * e.exchangeRate, 0);
                    return { ...group, expenses, totalTarget };
                })
                .filter(group => group.expenses.length > 0);
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
                        name: this.tagCategories.find(c => c.emoji === tag)?.name || 'Otros'
                    };
                }
                if (!analytics.byTag[tag].totalsByCurrency[code]) {
                    analytics.byTag[tag].totalsByCurrency[code] = { symbol: expense.currency.symbol, total: 0 };
                }
                analytics.byTag[tag].totalsByCurrency[code].total += amount;
                analytics.byTag[tag].totalTarget += targetAmount;
                analytics.byTag[tag].count++;
            });

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

        get summaryMeta() {
            const stats = this.summaryStats;
            if (!stats.count) return 'Todavía no hay gastos en esta hoja';
            const parts = [stats.breakdown];
            if (stats.days) {
                parts.push(`${this.formatTargetAmount(stats.perDay)} al día`);
                parts.push(`${stats.days} ${stats.days === 1 ? 'día' : 'días'}`);
            }
            return parts.join(' · ');
        },

        get summaryStats() {
            const analytics = this.analytics;
            const days = this.groupedExpenses.length;
            return {
                total: analytics.totalTarget,
                count: this.expenses.length,
                days: days,
                perDay: days ? analytics.totalTarget / days : 0,
                breakdown: this.formatCurrencyBreakdown(analytics.totalsByCurrency)
            };
        },

        tagBarColor(index) {
            const palette = [
                'var(--sq-green-500)',
                'var(--sq-black)',
                'var(--sq-gray-400)',
                'var(--sq-gray-300)',
                'var(--sq-gray-200)'
            ];
            return index < palette.length ? palette[index] : 'var(--sq-gray-200)';
        },

        tagPercent(tag) {
            const total = this.analytics.totalTarget;
            return total ? (tag.totalTarget / total) * 100 : 0;
        },

        // ------------------------------------------------------------
        // Datos: exportar, importar, borrar
        // ------------------------------------------------------------
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

                        if (!importedData.version) {
                            alert('El archivo no tiene un formato válido (falta versión).');
                            return;
                        }

                        if (importedData.version !== this.DB_VERSION) {
                            if (!confirm(`El archivo es de una versión diferente (${importedData.version} vs ${this.DB_VERSION}). ¿Quieres intentar importarlo de todas formas?`)) {
                                return;
                            }
                        }

                        if (!confirm('Se añadirá como una hoja nueva, sin tocar las hojas existentes. ¿Continuar?')) {
                            return;
                        }

                        const data = importedData.data;
                        const expenses = data.expenses || [];
                        const sourceCurrency = {
                            code: data.sourceCurrency || 'THB',
                            symbol: data.sourceCurrencySymbol || '฿'
                        };

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
                        this.showDataScreen = false;
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
    }));
});
