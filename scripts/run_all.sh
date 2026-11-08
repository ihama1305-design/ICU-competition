#!/usr/bin/env bash
# Rebuild everything from the record drawing + spec/icu_spec.json.
#   scripts/run_all.sh             plan extraction, Blender scene, renders, GLB + viewer, viewer test, rooms, website, configurator test
#   scripts/run_all.sh --preview   quick low-sample renders
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-.venv/bin/python}"
[ -x "$PY" ] || PY="$(command -v python3)"
SHEET="$("$PY" -I -c 'import json; print(json.load(open("spec/icu_spec.json"))["source"]["sheet"])')"
[ -f "$SHEET" ] || { echo "missing $SHEET (the SSMC drawings are not in git; see README)"; exit 1; }
# Filters never fail a step themselves: with pipefail, a pipeline's status is the python script's
quiet() { grep -v -E '^(Fra:|Read blend|Info:|[0-9:.]+ +(render|blend|image|cycles|gpu) +\|)' || true; }
only() { grep -E "$1" || true; }
echo "== 01 extract plan from the drawing";   "$PY" -I scripts/01_extract_plan.py
echo "== 02 build Blender scene";              "$PY" -I scripts/02_build_scene.py 2>&1 | quiet
[ -s output/icu.blend ] || { echo "scene build failed"; exit 1; }
echo "== 09 fixtures against what's around them"; "$PY" -I scripts/09_check_fixtures.py 2>&1 | quiet
echo "== 10 ventilation plan";                  "$PY" -I scripts/10_vent_plan.py
echo "== 03 Cycles renders";                   "$PY" -I scripts/03_render.py ${1:-} 2>&1 | only '^  renders/|Error|Traceback'
echo "== 04 GLB + viewer";                     "$PY" -I scripts/04_export.py 2>&1 | only '^  output/|Error|Traceback'
[ -s output/icu.glb ] || { echo "export failed"; exit 1; }
echo "== 05 viewer test (headless Chromium)";  "$PY" -I scripts/05_check_viewer.py
echo "== 07 configurator rooms";               "$PY" -I scripts/07_export_room.py 2>&1 | only '^  assets/|^07:|Error|Traceback'
echo "== 06 website";                           "$PY" -I scripts/06_build_site.py
echo "== 08 configurator test (headless Chromium)"; "$PY" -I scripts/08_check_configurator.py
echo "done -> output/icu.blend, output/icu.glb, output/viewer/index.html, renders/, website (index.html, viewer/, assets/, downloads/)"
