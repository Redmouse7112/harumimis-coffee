# Harumimi's Coffee — Panel de caja

App de caja para Harumimi's Coffee (eventos/expos de anime). Pensada para una
sola persona operando desde el celular, sin computadora y sin internet
garantizado. Registra pedidos, separa efectivo de transferencia, y ayuda a
que el arqueo de cierre cuadre con la caja física.

## Estructura del proyecto

```
harumimis-coffee/
├── harumimis-coffee-v1.html   # versión anterior, validada por los clientes (referencia, no se toca)
├── template.html              # markup fuente (referencia archivos sueltos de src/ y public/)
├── build.py                   # arma dist/index.html: un único HTML con todo embebido
├── assets/
│   ├── logo-harumimis-original.jpeg  # splash (307×300, se muestra a 150 px)
│   └── logo-face.png                 # header (120×120, se muestra a 60 px)
├── src/
│   ├── data/
│   │   └── defaultMenu.js     # menú por defecto
│   ├── scripts/
│   │   ├── logic.js           # lógica pura sin DOM (migraciones, totales, arqueo, nombre de evento); también se carga en Node
│   │   ├── state.js           # estado global, persistencia, utils compartidos
│   │   ├── pedido.js          # tab Pedido (grid de menú, recibo, nombre de cliente)
│   │   ├── historial.js       # tab Historial (eventos = sesión + pedidos + cierre)
│   │   ├── menu.js            # tab Menú (alta/edición/baja de productos)
│   │   ├── report.js          # genera y descarga el resumen .docx del cierre
│   │   ├── cierre.js          # tab Cierre (fondo inicial, arqueo, cerrar caja)
│   │   ├── backup.js          # exportar/importar copia de seguridad (JSON) y aviso de backup
│   │   ├── install.js         # botón "Instalar app" (beforeinstallprompt / aviso iOS)
│   │   └── splash.js          # splash screen + bootstrap final (loadState)
│   ├── fonts/                 # Baloo 2, Lobster, Nunito, Space Mono (WOFF2 latin, OFL), precacheadas por el SW
│   ├── styles/
│   │   └── main.css
│   └── vendor/
│       ├── docx.min.js        # librería docx (MIT), para generar el .docx
│       └── LICENSES.md        # licencias de terceros
├── tests/
│   └── logic.test.js          # tests de logic.js con node --test (sin dependencias)
├── public/
│   ├── manifest.json          # PWA: nombre, colores, íconos
│   ├── sw.js                  # service worker (cache-first; build.py inyecta el hash de caché)
│   └── icons/                 # íconos generados a partir del logo
├── .github/workflows/
│   └── deploy.yml             # build + deploy a Pages en cada push a main
├── LICENSE
└── dist/                      # generado por build.py (no se versiona) — lo que publica el workflow
    ├── index.html
    ├── manifest.json
    ├── sw.js
    ├── fonts/
    └── icon-*.png
```

## Cómo se arma el bundle

`template.html` + `src/` + `public/` son los **fuentes** (para editar). Nunca
se editan a mano los archivos de `dist/`.

```bash
python build.py
```

Esto genera `dist/index.html`: un único archivo HTML con el CSS, todo el JS
(concatenado en orden de dependencia) y los logos (base64) embebidos. Pesa
unos 0,56 MB, casi todo la librería `docx`; si se agregan imágenes, redimensionarlas
al doble de su tamaño en pantalla antes de ponerlas en `assets/`. Es el
mismo archivo que ya funcionaba como v1 — se puede abrir directo desde el
celular, sin instalar nada, sin conexión. Además copia `manifest.json`,
`sw.js`, los íconos y las fuentes (`dist/fonts/`) a `dist/`, todos con rutas relativas planas, para que
funcione como PWA instalable.

Para modificar la app: **editar los archivos de `src/`** (o `template.html`
para markup), correr `python build.py` de nuevo, y probar `dist/index.html`.

## Modelo de datos y migraciones

El estado guarda `state.version`, que hoy es `2` (`STATE_VERSION` en
`src/scripts/logic.js`). Al cargar, `migrateState()` aplica en orden las
migraciones numeradas de `MIGRATIONS` (el paso `n` lleva de la versión `n` a la
`n+1`) y no pierde nada de lo ya guardado. Un estado sin `version` es la v0 (la
app de un solo archivo): sus pedidos no tenían `customerName`.

Para un cambio de modelo: agregar un paso al final de `MIGRATIONS`, subir
`STATE_VERSION` y sumar un test en `tests/logic.test.js`. Ojo: los datos
guardados con `version: 1` incluyen estados de antes y de después de que
existieran `eventNameCustom` y `fondoInicial` (la versión no se incrementó
cuando se sumaron), por eso el paso 1→2 es idempotente.

## Copia de seguridad

Los datos viven solo en `localStorage` del dispositivo, así que en la pestaña
Cierre hay una tarjeta **Copia de seguridad**:

- **Exportar copia** descarga `harumimis-coffee-copia-AAAA-MM-DD.json` con
  `{ app, schemaVersion, exportedAt, state }`.
- **Importar copia** valida el archivo (que sea de esta app, que su
  `schemaVersion` no sea más nuevo que el de la app y que el estado sea
  coherente), lo migra si es de una versión vieja y pide confirmación antes de
  **reemplazar** todo. El estado anterior queda guardado en
  `harumimi-state-before-import` por si fue un error.
- **Aviso**: si hay pedidos o cierres y nunca se exportó, o pasaron más de 7
  días desde la última exportación, la tarjeta se marca en rojo y aparece un
  punto sobre la pestaña Cierre. La fecha de la última exportación se guarda en
  `harumimi-last-export`.

## Tests

Sin dependencias, solo Node (>= 20):

```bash
node --test
```

Cubren las funciones puras de `src/scripts/logic.js`: totales de sesión,
diferencia de arqueo, `migrateState`, el nombre del evento y la validación de
copias de seguridad. Ese archivo no
puede tocar `document`, `localStorage` ni el `state` global.

## Deploy automático (GitHub Pages)

El repo contiene el **fuente**; `dist/` no se versiona. Un push a `main`
dispara el workflow `.github/workflows/deploy.yml`, que corre `python build.py`
y publica `dist/` en GitHub Pages (también se puede lanzar a mano desde la
pestaña *Actions* → *Deploy a GitHub Pages* → *Run workflow*).

Flujo de trabajo: editar `src/` / `template.html` → probar local con
`python build.py` → `git push`. La app publicada queda en
https://redmouse7112.github.io/harumimis-coffee/

- Pages sirve HTTPS, requisito para que el service worker registre y la app sea
  instalable/offline.
- Cada build calcula un hash de su contenido y lo usa como nombre del caché del
  service worker (`harumimi-coffee-<hash>`): un celular con la app instalada
  recibe la versión nueva en su próxima apertura, y los datos guardados
  (`localStorage`) no se tocan.

## CI

- `.github/workflows/test.yml`: en cada pull request hacia `main` y en cada push
  a `nucleo` corre `node --test` y `python build.py`. No despliega nada.
- `deploy.yml` también corre `node --test` antes de construir, así que un push a
  `main` con tests rotos no se publica.

## Reporte de cierre

Al cerrar caja se descarga automáticamente un `.docx` con el detalle del
evento (pedidos con nombre de cliente, totales por método de pago, fondo
inicial y arqueo). No hay integración con Gmail ni backend — el archivo se
genera 100% en el cliente (librería `docx` vendorizada en `src/vendor/`) y
Rudy lo comparte por el medio que prefiera. Los reportes de eventos ya
cerrados también se pueden volver a descargar desde la pestaña Historial.

## Licencia

Todos los derechos reservados — ver [`LICENSE`](LICENSE). Los componentes de
terceros incluidos en `src/vendor/` se rigen por sus propias licencias
([`src/vendor/LICENSES.md`](src/vendor/LICENSES.md)).

---
Desarrollado por RED.
