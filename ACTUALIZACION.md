# 🔄 Guía de Actualización de Gastorade

## Problema
El navegador móvil tiene cacheada la versión anterior de la aplicación y no se actualiza automáticamente.

## Soluciones

### Opción 1: Usar la página de actualización forzada ⭐ RECOMENDADO

1. En tu móvil, ve a: **`http://localhost:8000/force-update.html`**
   - O en producción: **`https://tu-dominio.com/force-update.html`**

2. Presiona el botón **"3. Limpiar Todo (SW + Cache)"**

3. **Cierra TODAS las pestañas** de Gastorade

4. Vuelve a abrir la aplicación en: **`http://localhost:8000`**

### Opción 2: Desde las DevTools del navegador (Chrome/Safari móvil)

#### Chrome Android:
1. Abre Chrome en el móvil
2. Ve a `chrome://serviceworker-internals/`
3. Busca "gastorade" y presiona "Unregister"
4. Ve a `chrome://settings/clearBrowserData`
5. Selecciona "Cached images and files"
6. Presiona "Clear data"
7. Cierra todas las pestañas y vuelve a abrir

#### Safari iOS:
1. Abre Ajustes > Safari
2. Presiona "Borrar historial y datos de sitios web"
3. Confirma
4. Vuelve a abrir la aplicación

### Opción 3: Modo incógnito (temporal)

1. Abre una ventana de incógnito/privada
2. Ve a `http://localhost:8000`
3. Verás la nueva versión (pero sin datos guardados)

## Cambios implementados para evitar este problema

1. **Service Worker mejorado**:
   - `skipWaiting()`: Fuerza activación inmediata
   - Evento `activate`: Limpia caches antiguos automáticamente
   - `clients.claim()`: Toma control de todas las páginas

2. **Detección automática de actualizaciones**:
   - Chequea actualizaciones cada 60 segundos
   - Muestra mensaje cuando hay nueva versión
   - Recarga automáticamente al detectar cambios

3. **Página de actualización forzada**:
   - `/force-update.html` siempre accesible
   - Botones para limpiar SW y cache manualmente
   - Estado en tiempo real de SW y caches

## Verificación

Para verificar que tienes la versión actualizada:

1. Abre las DevTools del navegador (F12 en escritorio)
2. Ve a la consola y ejecuta:
   ```javascript
   navigator.serviceWorker.getRegistrations().then(r =>
     r.forEach(reg => console.log('SW:', reg.active?.scriptURL))
   )
   ```
3. Verifica que aparezca `/sw.js`

4. Ejecuta en la consola:
   ```javascript
   caches.keys().then(c => console.log('Caches:', c))
   ```
5. Debería aparecer `gastorade-v3` (o superior)

## Versión Actual

- **DB Version**: 1.0
- **Cache Version**: gastorade-v3
- **Última actualización**: 2026-01-31

## Notas

- La actualización automática funciona solo si el navegador puede detectar cambios en `sw.js`
- En algunos casos, es necesario cerrar TODAS las pestañas de la app para que se active el nuevo SW
- La página `/force-update.html` NO está cacheada, siempre se carga fresca desde el servidor
