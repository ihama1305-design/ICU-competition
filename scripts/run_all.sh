#!/usr/bin/env bash
# Rebuild everything from the record drawing + spec/icu_spec.json.
#   scripts/run_all.sh             plan extraction, Blender scene, renders, GLB + viewer, viewer test
#   scripts/run_all.sh --preview   quick low-sample renders
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-.venv/bin/python}"
[ -x "$PY" ] || PY="$(command -v python3)"
SHEET="$("$PY" -I -c 'import json; print(json.load(open("spec/icu_spec.json"))["source"]["sheet"])')"
[ -f "$SHEET" ] || { echo "missing $SHEET (the SSMC drawings are not in git; see README)"; exit 1; }
quiet() { grep -v -E '^(Fra:|Read blend|Info:|[0-9:.]+ +(render|blend|image|cycles|gpu) +\|)' || true; }
echo "== 01 extract plan from the drawing";   "$PY" -I scripts/01_extract_plan.py
echo "== 02 build Blender scene";              "$PY" -I scripts/02_build_scene.py 2>&1 | quiet
[ -s output/icu.blend ] || { echo "scene build failed"; exit 1; }
echo "== 03 Cycles renders";                   "$PY" -I scripts/03_render.py ${1:-} 2>&1 | grep -E '^  renders/|Error|Traceback' || true
echo "== 04 GLB + viewer";                     "$PY" -I scripts/04_export.py 2>&1 | grep -E '^  output/|Error|Traceback' || true
[ -s output/icu.glb ] || { echo "export failed"; exit 1; }
echo "== 05 viewer test (headless Chromium)";  "$PY" -I scripts/05_check_viewer.py
echo "done -> output/icu.blend, output/icu.glb, output/viewer/index.html, renders/"
