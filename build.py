#!/usr/bin/env python3
"""
Genera dist/index.html: un unico archivo HTML con CSS, JS, datos y logo
embebidos (base64), listo para abrir offline en un celular o servir como PWA
junto a manifest.json / sw.js / iconos (tambien copiados a dist/).

Corre igual en Windows y Linux (CI): rutas con pathlib, salida siempre con
saltos de linea "\\n" y tipos MIME fijos, asi el hash de cada build es el
mismo sin importar donde se genere.
"""
import base64
import hashlib
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMPLATE = ROOT / "template.html"
SRC = ROOT / "src"
PUBLIC = ROOT / "public"
ASSETS = ROOT / "assets"
DIST = ROOT / "dist"

# (archivo, mime) -- fijos para no depender de la base de datos MIME del SO
LOGO_FILE = (ASSETS / "logo-harumimis-original.jpeg", "image/jpeg")
LOGO_FACE_FILE = (ASSETS / "logo-face.png", "image/png")

# Orden de dependencia: la libreria docx (vendorizada) primero ya que
# report.js depende del global `docx` que expone, luego datos, estado/utils
# compartidos, cada modulo de vista, install antes de splash, y splash al
# final (dispara loadState()).
JS_FILES = [
    SRC / "vendor" / "docx.min.js",
    SRC / "data" / "defaultMenu.js",
    SRC / "scripts" / "logic.js",
    SRC / "scripts" / "state.js",
    SRC / "scripts" / "pedido.js",
    SRC / "scripts" / "historial.js",
    SRC / "scripts" / "menu.js",
    SRC / "scripts" / "report.js",
    SRC / "scripts" / "cierre.js",
    SRC / "scripts" / "backup.js",
    SRC / "scripts" / "install.js",
    SRC / "scripts" / "splash.js",
]

FONTS_DIR = SRC / "fonts"
ICONS = ["icon-192.png", "icon-512.png", "icon-512-maskable.png", "apple-touch-icon.png"]


def read(path):
    # read_text normaliza \r\n -> \n, asi un checkout en Windows no cambia el hash
    return path.read_text(encoding="utf-8")


def write(path, text):
    # newline="\n": en Windows write_text() convertiria a \r\n
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def data_uri(file_and_mime):
    path, mime = file_and_mime
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build_html():
    html = read(TEMPLATE)

    # 1) CSS inline
    # (repl es una funcion: evita que re.sub interprete "\n", "\t", etc.
    # dentro del CSS/JS como escapes de backreferencia)
    css = read(SRC / "styles" / "main.css")
    html = re.sub(
        r'\s*<link rel="stylesheet" href="src/styles/main\.css">',
        lambda m: "\n<style>\n" + css + "\n</style>",
        html,
    )

    # 2) JS inline (concatena todos los modulos en orden de dependencia)
    js = "\n".join(read(f) for f in JS_FILES)
    html = re.sub(
        r'(\s*<script src="src/[^"]+"></script>)+\s*(?=<script>)',
        lambda m: "\n<script>\n" + js + "\n</script>\n",
        html,
    )

    # 3) Logos embebidos en base64 (splash completo + version recortada del header)
    html = html.replace("assets/logo-harumimis-original.jpeg", data_uri(LOGO_FILE))
    html = html.replace("assets/logo-face.png", data_uri(LOGO_FACE_FILE))

    # 3b) fuentes locales: se copian a dist/fonts/ y el CSS apunta ahi
    html = html.replace('url("src/fonts/', 'url("fonts/')

    # 4) manifest / iconos -> rutas planas (copiados junto al html)
    html = html.replace("public/manifest.json", "./manifest.json")
    html = html.replace("public/icons/apple-touch-icon.png", "./apple-touch-icon.png")
    html = html.replace("public/icons/icon-192.png", "./icon-192.png")

    # 5) Guarda: ninguna referencia a archivos fuente puede quedar sin resolver
    # (es lo que dejaba el logo del header roto cuando se agrego un asset nuevo)
    leftovers = re.findall(r'(?:src|href)="((?:assets|public|src)/[^"]*)"', html)
    leftovers += re.findall(r"""url\(["']?((?:assets|public|src)/[^)"']*)""", html)
    if leftovers:
        raise SystemExit("Rutas sin resolver en index.html: " + ", ".join(leftovers))

    return html


def build_manifest():
    manifest = read(PUBLIC / "manifest.json")
    manifest = manifest.replace("./icons/", "./")
    return manifest


def build_id(*parts):
    """Hash corto del contenido final del bundle: cambia si y solo si cambia algo."""
    h = hashlib.sha256()
    for part in parts:
        h.update(part if isinstance(part, bytes) else part.encode("utf-8"))
    return h.hexdigest()[:10]


def main():
    DIST.mkdir(exist_ok=True)

    html = build_html()
    manifest = build_manifest()

    fonts = sorted(FONTS_DIR.glob("*.woff2"))
    bid = build_id(
        html, manifest,
        *[(PUBLIC / "icons" / i).read_bytes() for i in ICONS],
        *[f.read_bytes() for f in fonts],
    )

    sw = read(PUBLIC / "sw.js")
    if "__BUILD_ID__" not in sw:
        raise SystemExit("public/sw.js no tiene el placeholder __BUILD_ID__")
    sw = sw.replace("__BUILD_ID__", bid)

    write(DIST / "index.html", html)
    write(DIST / "manifest.json", manifest)
    write(DIST / "sw.js", sw)
    for icon in ICONS:
        shutil.copyfile(PUBLIC / "icons" / icon, DIST / icon)
    (DIST / "fonts").mkdir(exist_ok=True)
    for f in fonts:
        shutil.copyfile(f, DIST / "fonts" / f.name)

    # Guarda: todo lo que el service worker precachea tiene que existir en dist/
    missing = [u for u in re.findall(r"'\./([^']+)'", sw.split("var PRECACHE")[1].split("];")[0])
               if u and not (DIST / u).exists()]
    if missing:
        raise SystemExit("sw.js precachea archivos que no existen en dist/: " + ", ".join(missing))

    size_kb = (DIST / "index.html").stat().st_size / 1024
    print(f"dist/index.html generado ({size_kb:.0f} KB, todo embebido)")
    print(f"dist/sw.js con cache 'harumimi-coffee-{bid}'")
    print(f"dist/manifest.json, iconos y {len(fonts)} fuentes copiados")


if __name__ == "__main__":
    main()
