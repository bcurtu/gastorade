# Nota opcional por gasto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un campo de texto corto y opcional ("Nota", máx. 24 caracteres) a cada gasto, editable al crear y al modificar, visible en la lista.

**Architecture:** Gastorade es una app sin build, vanilla JS + Alpine.js (`app.js`) sobre `index.html`. No hay framework de tests ni npm. La verificación se hace manualmente sirviendo el sitio con `python -m http.server` y probando en un navegador (se puede usar el Browser tool disponible en esta sesión para automatizar la verificación).

**Tech Stack:** Alpine.js, localStorage, HTML/CSS vanilla. Sin build, sin dependencias nuevas.

---

## Nota sobre testing

Este repo no tiene test runner (ver `CLAUDE.md`: "No Build Process"). En lugar de tests automatizados, cada tarea de lógica incluye un paso de **verificación manual en consola del navegador** (usando `python -m http.server` + DevTools/Browser tool), y la Tarea 5 cubre la verificación end-to-end completa en la UI.

---

### Task 1: Estado inicial y reset del formulario (`app.js`)

**Files:**
- Modify: `app.js:42-48` (estado inicial `newExpense`)
- Modify: `app.js:167-178` (`resetForm()`)

- [ ] **Step 1: Añadir `note: ''` al estado inicial de `newExpense`**

En `app.js`, el bloque actual (líneas 42-48):

```javascript
newExpense: {
    amount: '',
    units: 1,
    date: new Date(),
    location: '',
    coords: null
},
```

Cambiar a:

```javascript
newExpense: {
    amount: '',
    units: 1,
    date: new Date(),
    location: '',
    coords: null,
    note: ''
},
```

- [ ] **Step 2: Añadir `note: ''` a `resetForm()`**

En `app.js`, el bloque actual (líneas 167-178):

```javascript
resetForm() {
    this.newExpense = {
        amount: '',
        units: 1,
        date: new Date(),
        location: '',
        coords: this.currentLocation ? { ...this.currentLocation } : null,
        tag: ''
    };
    this.showNewExpenseTagEditor = false;
    this.convertedAmount = '0.00';
},
```

Cambiar a:

```javascript
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
```

- [ ] **Step 3: Verificación manual**

Servir el sitio:

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000`, abrir la consola del navegador y ejecutar:

```javascript
document.querySelector('[x-data]').__x.$data.newExpense.note
```

Expected: `""` (string vacío, sin error).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Add note field to expense form state"
```

---

### Task 2: Persistir la nota al crear y editar (`app.js`)

**Files:**
- Modify: `app.js:144-158` (`saveExpense()`)
- Modify: `app.js:194-208` (`editExpense()`)
- Modify: `app.js:256-269` (`updateExpense()`)

- [ ] **Step 1: Incluir `note` en el expense creado por `saveExpense()`**

Bloque actual (líneas 144-158):

```javascript
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
        coords: this.newExpense.coords ? { ...this.newExpense.coords } : null,
        showMap: false,
        tag: this.newExpense.tag || ''
    };

    this.expenses.push(expense);
    localStorage.setItem('expenses', JSON.stringify(this.expenses));
    this.resetForm();
    this.groupExpensesByDay();
    this.showCurrencyEditor = false; // Close currency editor if open
},
```

Cambiar a:

```javascript
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
```

- [ ] **Step 2: Cargar `note` en `editExpense()`**

Bloque actual (líneas 194-208):

```javascript
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
            timeInput: date.toTimeString().slice(0, 5)
        };
        this.updateConversion();
```

Cambiar a:

```javascript
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
```

- [ ] **Step 3: Incluir `note` en `updateExpense()`**

Bloque actual (líneas 256-269):

```javascript
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
            coords: this.newExpense.coords
        };

        localStorage.setItem('expenses', JSON.stringify(this.expenses));
        this.editingExpenseId = null;
        this.resetForm();
        this.groupExpensesByDay();
    }
},
```

Cambiar a:

```javascript
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
```

- [ ] **Step 4: Verificación manual en consola**

Con el servidor local corriendo, en la consola del navegador:

```javascript
const app = document.querySelector('[x-data]').__x.$data;
app.newExpense.amount = '10';
app.newExpense.note = 'Taxi aeropuerto';
app.saveExpense();
app.expenses[app.expenses.length - 1].note
```

Expected: `"Taxi aeropuerto"`.

Luego probar el truncado:

```javascript
app.newExpense.amount = '5';
app.newExpense.note = 'x'.repeat(40);
app.saveExpense();
app.expenses[app.expenses.length - 1].note.length
```

Expected: `24`.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Persist optional note on expense create/edit"
```

---

### Task 3: Input de nota en el formulario de nuevo gasto (`index.html`)

**Files:**
- Modify: `index.html:132` (tras el `input-group` de importe/unidades, antes de `.total`)

- [ ] **Step 1: Añadir el input-group de la nota**

Bloque actual (líneas 126-133):

```html
                    <div class="units-control">
                        <button @click="decrementUnits()">-</button>
                        <span x-text="newExpense.units"></span>
                        <button @click="incrementUnits()">+</button>
                    </div>
                </div>
            </div>

            <div class="total">
```

Cambiar a:

```html
                    <div class="units-control">
                        <button @click="decrementUnits()">-</button>
                        <span x-text="newExpense.units"></span>
                        <button @click="incrementUnits()">+</button>
                    </div>
                </div>
            </div>

            <div class="input-group">
                <label>Nota (opcional)</label>
                <input type="text" maxlength="24" x-model="newExpense.note" placeholder="Nota (opcional)">
            </div>

            <div class="total">
```

- [ ] **Step 2: Verificación manual en navegador**

Servir el sitio (`python -m http.server 8000`), abrir `http://localhost:8000`, y comprobar visualmente que aparece el input "Nota (opcional)" bajo el control de unidades, antes del bloque TOTAL, en el formulario "Nuevo Gasto".

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add note input to new expense form"
```

---

### Task 4: Input de nota en el formulario de edición (`index.html`)

**Files:**
- Modify: `index.html:226` (tras el `input-group` de importe/unidades, antes del `input-group` de fecha/hora, dentro de `.expense-edit-form`)

- [ ] **Step 1: Añadir el input-group de la nota en el formulario de edición**

Bloque actual (líneas 219-230):

```html
                                            <div class="units-control">
                                                <button @click="decrementUnits()">-</button>
                                                <span x-text="newExpense.units"></span>
                                                <button @click="incrementUnits()">+</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="input-group">
                                        <label>Fecha y Hora</label>
                                        <div class="datetime-control">
                                            <input type="date" x-model="newExpense.dateInput">
```

Cambiar a:

```html
                                            <div class="units-control">
                                                <button @click="decrementUnits()">-</button>
                                                <span x-text="newExpense.units"></span>
                                                <button @click="incrementUnits()">+</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="input-group">
                                        <label>Nota (opcional)</label>
                                        <input type="text" maxlength="24" x-model="newExpense.note" placeholder="Nota (opcional)">
                                    </div>

                                    <div class="input-group">
                                        <label>Fecha y Hora</label>
                                        <div class="datetime-control">
                                            <input type="date" x-model="newExpense.dateInput">
```

- [ ] **Step 2: Verificación manual en navegador**

Con el sitio servido, crear un gasto de prueba, pulsar el botón ✏️ (editar) sobre él, y comprobar que aparece el input "Nota (opcional)" entre el importe/unidades y el campo de fecha/hora, y que si el gasto ya tenía nota, aparece precargada.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add note input to expense edit form"
```

---

### Task 5: Mostrar la nota en la lista de gastos (`index.html`)

**Files:**
- Modify: `index.html:193-204` (`.expense-meta`)

- [ ] **Step 1: Añadir el span de la nota en `expense-meta`**

Bloque actual (líneas 193-204):

```html
                                            <div class="expense-meta">
                                                <span x-text="formatTime(expense.date)"></span>
                                                <span x-show="expense.units > 1" x-text="expense.units + ' unidades'"></span>
                                                <button
                                                    x-show="expense.coords"
                                                    @click.stop="showExpenseLocation(expense)"
                                                    class="map-button"
                                                    :class="{ 'active': expense.showMap }"
                                                >
                                                    📍
                                                </button>
                                            </div>
```

Cambiar a:

```html
                                            <div class="expense-meta">
                                                <span x-text="formatTime(expense.date)"></span>
                                                <span x-show="expense.units > 1" x-text="expense.units + ' unidades'"></span>
                                                <span x-show="expense.note" x-text="expense.note"></span>
                                                <button
                                                    x-show="expense.coords"
                                                    @click.stop="showExpenseLocation(expense)"
                                                    class="map-button"
                                                    :class="{ 'active': expense.showMap }"
                                                >
                                                    📍
                                                </button>
                                            </div>
```

- [ ] **Step 2: Verificación manual en navegador**

Con el sitio servido:
1. Crear un gasto con nota "Cena playa" → comprobar que aparece "Cena playa" en `expense-meta`, junto a la hora.
2. Crear un gasto sin nota → comprobar que no aparece ningún espacio/hueco extra en `expense-meta`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Display expense note in the expenses list"
```

---

### Task 6: Verificación end-to-end en navegador

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar el servidor local**

```bash
python -m http.server 8000
```

- [ ] **Step 2: Verificar flujo completo de creación**

Usando el Browser tool (o manualmente):
1. Abrir `http://localhost:8000`.
2. Rellenar importe (p.ej. `15`), escribir en "Nota (opcional)" el texto `Café + croissant` (17 caracteres).
3. Pulsar "Guardar".
4. Comprobar que el gasto aparece en la lista con la nota visible junto a la hora.

Expected: nota visible, sin errores en consola (`read_console_messages`).

- [ ] **Step 3: Verificar límite de 24 caracteres**

1. En el formulario de nuevo gasto, intentar escribir un texto de más de 24 caracteres en el input de nota.
2. Comprobar que el input no permite escribir más de 24 caracteres (por el `maxlength`).

- [ ] **Step 4: Verificar edición**

1. Pulsar ✏️ sobre el gasto creado en el Step 2.
2. Comprobar que el campo "Nota (opcional)" muestra `Café + croissant`.
3. Cambiar la nota a `Solo café` y pulsar "Actualizar".
4. Comprobar que la lista muestra `Solo café`.

- [ ] **Step 5: Verificar gasto sin nota**

1. Crear un segundo gasto sin escribir nada en "Nota (opcional)".
2. Comprobar que se guarda correctamente y no se muestra ningún span vacío ni error en consola.

- [ ] **Step 6: Verificar persistencia tras recarga**

1. Recargar la página (`F5` / `navigate` al mismo URL).
2. Comprobar que ambos gastos siguen mostrando sus notas (o ausencia de nota) correctamente.

- [ ] **Step 7: Limpiar datos de prueba (opcional)**

Si se quiere dejar limpio el localStorage de pruebas, borrar los gastos de prueba usando el botón 🗑️ de cada uno.
