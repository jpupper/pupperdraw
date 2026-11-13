#!/usr/bin/env python3
"""Empaqueta los GLSL de public/js/engine/glsl en public/js/engine/shaders.js.

La clave de cada shader es el nombre del archivo sin extension:
base.vert -> "base", display_img_refr.frag -> "display_img_refr".
Si se agrega un .frag nuevo a la carpeta, entra solo: no hay que tocar el script.
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
G = ROOT / "public" / "js" / "engine" / "glsl"

sh = {}
for f in sorted(G.iterdir()):
    if f.suffix not in (".frag", ".vert"):
        continue
    sh[f.stem] = f.read_text(encoding="utf-8")

out = ROOT / "public" / "js" / "engine" / "shaders.js"
out.write_text("window.SHADERS = " + json.dumps(sh, ensure_ascii=False) + ";\n", encoding="utf-8")
print("OK", out, len(out.read_text(encoding="utf-8")), "bytes,", len(sh), "shaders")
print("claves:", ", ".join(sorted(sh)))
