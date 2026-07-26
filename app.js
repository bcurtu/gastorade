document.addEventListener('alpine:init', () => {
    Alpine.data('expenseCalculator', () => ({
        // Database version
        DB_VERSION: '1.1',

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
            note: ''
        },
        convertedAmount: '0.00',
        expenses: JSON.parse(localStorage.getItem('expenses') || '[]'),
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
        currentLocation: null,
        expandedDays: new Set(),

        // Inicialización
        init() {
            this.migrateExpenseCurrencies();

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
            this.convertedAmount = (amount * this.exchangeRate).toFixed(2);
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
            localStorage.setItem('exchangeRate', this.exchangeRate);
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
            localStorage.setItem('expenses', JSON.stringify(this.expenses));
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
                note: ''
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
                localStorage.setItem('expenses', JSON.stringify(this.expenses));
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
                    note: expense.note || ''
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

                localStorage.setItem('expenses', JSON.stringify(this.expenses));
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
                localStorage.setItem('expenses', JSON.stringify(this.expenses));
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

        get analytics() {
            return this.calculateAnalytics();
        },

        resetData() {
            if (confirm('¿Estás seguro de que quieres borrar todos los gastos? Esta acción no se puede deshacer.')) {
                this.expenses = [];
                localStorage.removeItem('expenses');
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
                    localStorage.setItem('exchangeRate', this.exchangeRate);
                    localStorage.setItem('lastRateUpdate', this.lastRateUpdate);

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
