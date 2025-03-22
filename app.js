document.addEventListener('alpine:init', () => {
    Alpine.data('expenseCalculator', () => ({
        // Estado
        exchangeRate: parseFloat(localStorage.getItem('exchangeRate')) || 0.026,
        showRateEditor: false,
        newExpense: {
            amount: '',
            units: 1,
            date: new Date(),
            location: ''
        },
        convertedAmount: '0.00',
        expenses: JSON.parse(localStorage.getItem('expenses') || '[]'),
        showTagEditor: null,
        tagInput: '',
        editingExpenseId: null,
        
        // Inicialización
        init() {
            // Obtener ubicación si está disponible
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    this.newExpense.location = 'Mi ubicación';
                });
            }
            
            this.groupExpensesByDay();
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
                exchangeRate: this.exchangeRate,
                date: new Date(),
                location: this.newExpense.location,
                tag: ''
            };
            
            this.expenses.push(expense);
            localStorage.setItem('expenses', JSON.stringify(this.expenses));
            this.resetForm();
            this.groupExpensesByDay();
        },
        
        resetForm() {
            this.newExpense = {
                amount: '',
                units: 1,
                date: new Date(),
                location: this.newExpense.location
            };
            this.convertedAmount = '0.00';
        },
        
        toggleTagEditor(id) {
            this.showTagEditor = this.showTagEditor === id ? null : id;
            this.tagInput = '';
            
            // Si estamos abriendo el editor, buscamos el tag actual para editarlo
            if (this.showTagEditor === id) {
                const expense = this.expenses.find(e => e.id === id);
                if (expense) {
                    this.tagInput = expense.tag;
                }
            }
        },
        
        saveTag(id) {
            const index = this.expenses.findIndex(e => e.id === id);
            if (index !== -1) {
                this.expenses[index].tag = this.tagInput;
                localStorage.setItem('expenses', JSON.stringify(this.expenses));
                this.showTagEditor = null;
                this.groupExpensesByDay();
            }
        },
        
        editExpense(id) {
            const expense = this.expenses.find(e => e.id === id);
            if (expense) {
                this.editingExpenseId = id;
                this.newExpense = {
                    amount: expense.amount,
                    units: expense.units,
                    date: new Date(expense.date),
                    location: expense.location
                };
                this.updateConversion();
            }
        },
        
        updateExpense() {
            const index = this.expenses.findIndex(e => e.id === this.editingExpenseId);
            if (index !== -1) {
                this.expenses[index].amount = parseFloat(this.newExpense.amount);
                this.expenses[index].units = this.newExpense.units;
                
                localStorage.setItem('expenses', JSON.stringify(this.expenses));
                this.cancelEdit();
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
        
        // Formateadores y utilidades
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
        
        // Agrupación de gastos por día
        groupedExpenses: [],
        
        groupExpensesByDay() {
            const groups = {};
            
            this.expenses.forEach(expense => {
                const date = new Date(expense.date);
                const dateStr = date.toDateString();
                
                if (!groups[dateStr]) {
                    groups[dateStr] = {
                        date: this.formatDate(date),
                        expenses: [],
                        totalThb: 0,
                        totalEur: 0
                    };
                }
                
                groups[dateStr].expenses.push(expense);
                groups[dateStr].totalThb += expense.amount * expense.units;
                groups[dateStr].totalEur += expense.amount * expense.units * expense.exchangeRate;
            });
            
            this.groupedExpenses = Object.values(groups).sort((a, b) => {
                return new Date(b.expenses[0].date) - new Date(a.expenses[0].date);
            });
        }
    }));
});
