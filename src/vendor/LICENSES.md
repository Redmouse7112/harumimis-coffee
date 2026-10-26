# Componentes de terceros

`docx.min.js` es la librería [docx](https://github.com/dolanmiu/docx) v9.7.1
(IIFE `index.iife.js` de jsDelivr, minificada con terser, que elimina los
comentarios de licencia originales). Se incluye en el bundle para generar el
reporte de cierre en `.docx` sin conexión.

| Componente | Licencia | Titular |
|---|---|---|
| docx | MIT | Dolan Miu |
| JSZip (incluido dentro de docx) | MIT o GPLv3 (a elección) | Stuart Knightley y colaboradores |
| Otras dependencias empaquetadas dentro de docx (xml-js, nanoid, hash.js, etc.) | MIT / ISC / BSD, según cada una | Sus respectivos autores |

## Fuentes (`src/fonts/`)

Subconjunto latin en WOFF2, descargadas de Google Fonts y servidas desde el
propio origen (sin pedir nada a Google en tiempo de ejecución). Todas están
bajo la [SIL Open Font License 1.1](https://openfontlicense.org).

| Fuente | Autoría (según Google Fonts) |
|---|---|
| Baloo 2 | Ek Type |
| Lobster | Impallari Type |
| Nunito | Vernon Adams, Cyreal y colaboradores |
| Space Mono | Colophon Foundry |

Estos componentes se rigen por sus propias licencias, no por el `LICENSE` de
este repositorio. Los textos completos están en los repositorios de cada
proyecto.
