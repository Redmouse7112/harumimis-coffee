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
│   └── logo-harumimis-original.jpeg
├── src/
│   ├── data/
│   │   └── defaultMenu.js     # menú por defecto
│   ├── scripts/
│   │   ├── state.js           # estado, state.version, migrateState, utils compartidos
│   │   ├── pedido.js          # tab Pedido (grid de menú, recibo, nombre de cliente)
│   │   ├── historial.js       # tab Historial (eventos = sesión + pedidos + cierre)
│   │   ├── menu.js            # tab Menú (alta/edición/baja de productos)
│   │   ├── report.js          # genera y descarga el resumen .docx del cierre
│   │   ├── cierre.js          # tab Cierre (fondo inicial, arqueo, cerrar caja)
│   │   ├── install.js         # botón "Instalar app" (beforeinstallprompt / aviso iOS)
│   │   └── splash.js          # splash screen + bootstrap final (loadState)
│   ├── styles/
│   │   └── main.css
│   └── vendor/
│       ├── docx.min.js        # librería docx (MIT), para generar el .docx
│       └── LICENSES.md        # licencias de terceros
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
    └── icon-*.png
```

## Cómo se arma el bundle

`template.html` + `src/` + `public/` son los **fuentes** (para editar). Nunca
se editan a mano los archivos de `dist/`.

```bash
python build.py
```

Esto genera `dist/index.html`: un único archivo HTML con el CSS, todo el JS
(concatenado en orden de dependencia) y el logo (base64) embebidos. Es el
mismo archivo que ya funcionaba como v1 — se puede abrir directo desde el
celular, sin instalar nada, sin conexión. Además copia `manifest.json`,
`sw.js` y los íconos a `dist/`, todos con rutas relativas planas, para que
funcione como PWA instalable.

Para modificar la app: **editar los archivos de `src/`** (o `template.html`
para markup), correr `python build.py` de nuevo, y probar `dist/index.html`.

## Modelo de datos y migraciones

El estado guarda `state.version` (arranca en `1`). Al cargar, `migrateState()`
(en `src/scripts/state.js`) detecta datos guardados por versiones anteriores
(sin el campo `version`) y les completa los campos nuevos que falten —por
ejemplo, `order.customerName` en pedidos cargados por la v1— sin perder nada
de lo ya guardado.

Para un futuro cambio de modelo: agregar un paso `if (merged.version < N) {...}`
dentro de `migrateState()`, sin tocar el resto de la app.

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
