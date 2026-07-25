# Nota opcional por gasto — Diseño

## Objetivo
Permitir añadir un comentario/descripción corto y opcional a cada gasto, tanto al crearlo como al editarlo.

## Modelo de datos
- Nuevo campo `note` (string, opcional, máx. 24 caracteres) en cada objeto `expense`.
- Se añade también a `newExpense` (estado del formulario), con valor por defecto `''`.
- Gastos existentes en localStorage no tienen `note`; se tratan como `expense.note || ''` allí donde se lea, sin necesidad de migración.

## UI

### Formulario de creación (`index.html`)
Nuevo `input-group` con:
```html
<label>Nota (opcional)</label>
<input type="text" maxlength="24" x-model="newExpense.note" placeholder="Nota (opcional)">
```
Ubicado como fila propia, entre el `input-group` de importe/unidades y el bloque `.total` (tras la línea 132).

### Formulario de edición (`index.html`)
Mismo input, reutilizando `x-model="newExpense.note"`, ubicado como fila propia entre el importe/unidades y el campo de fecha/hora (tras la línea 226).

### Vista de lista (`index.html`, dentro de `.expense-meta`, línea ~193-204)
```html
<span x-show="expense.note" x-text="expense.note"></span>
```
Junto a la hora y las unidades. No reserva espacio si el gasto no tiene nota.

## Lógica (`app.js`)
- `newExpense` inicial (líneas 42-48): añadir `note: ''`.
- `saveExpense()` (líneas 144-158): incluir `note: (this.newExpense.note || '').slice(0, 24)` en el objeto `expense` guardado.
- `resetForm()` (líneas 167-176): añadir `note: ''`.
- `editExpense()` (líneas 194-208): copiar `note: expense.note || ''` a `newExpense` al cargar el formulario de edición.
- `updateExpense()` (líneas 256-269): incluir `note: (this.newExpense.note || '').slice(0, 24)` al reconstruir el expense actualizado.

El `.slice(0, 24)` actúa como salvaguarda por si el `maxlength` del input se evita (pegado de texto).

## Fuera de alcance
- No se añade el campo a analíticas ni a agrupaciones por día.
- No se modifica el Service Worker (no hay recursos nuevos que cachear).
- No hay migración de datos: los gastos antiguos simplemente no muestran nota.

## Testing
- Crear un gasto con nota → se guarda y se muestra en la lista.
- Crear un gasto sin nota → no se muestra nada en `expense-meta`, sin espacio en blanco.
- Editar un gasto existente (sin nota) → añadir nota → se persiste.
- Editar un gasto con nota → modificarla o borrarla → se persiste el cambio.
- Verificar que el input respeta el límite de 24 caracteres (maxlength + slice de seguridad).
- Recargar la página (o simular localStorage con gastos antiguos sin `note`) → no debe romper la vista ni el formulario de edición.
