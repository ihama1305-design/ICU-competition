"""Publish the configurator alone: scripts/site/configurator -> configurator/, without the Blender outputs 06 needs.

06_build_site.py publishes the whole site and captures the home page's pictures, which takes a full pipeline run. This does
only its configurator step, the same three things in the same order: copy the modules, fill main.js's SITE constants from
the spec, and write the page from its template. Nothing else on the site is touched: not the home page, the pictures or
the room models.

Usage: publish_configurator.py [--check]
  --check   change nothing; exit 1 if the published copy differs from what this would write
"""
import json, os, re, shutil, sys, tempfile, filecmp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "site")
spec = json.load(open(os.path.join(ROOT, "spec", "icu_spec.json")))
SITE_DIR = os.path.normpath(os.path.join(ROOT, spec["site"]["dir"]))


def build(cfg_dir):
    shutil.rmtree(cfg_dir, ignore_errors=True)
    shutil.copytree(os.path.join(SRC, "configurator"), cfg_dir)
    cfg_page = open(os.path.join(SRC, "configurator.template.html")).read()
    main_js = os.path.join(cfg_dir, "main.js")
    main_src = open(main_js).read()
    site = json.dumps({k: v for k, v in spec["lighting"]["site"].items() if not k.startswith("_")})
    filled, n = re.subn(r"/\*SITE_JSON\*/\{.*?\}", site, main_src, count=1)
    if n != 1:
        raise SystemExit("main.js has no /*SITE_JSON*/ constant to fill")
    open(main_js, "w").write(filled)
    left = re.findall(r"\{\{\w+\}\}", cfg_page)
    if left:
        raise SystemExit(f"unfilled placeholders in the configurator: {left}")
    open(os.path.join(cfg_dir, "index.html"), "w").write(cfg_page)


def differences(a, b):
    c = filecmp.dircmp(a, b)
    return sorted(c.left_only + c.right_only + [f for f in c.common_files if not filecmp.cmp(os.path.join(a, f), os.path.join(b, f), shallow=False)])


published = os.path.join(SITE_DIR, "configurator")
if "--check" in sys.argv[1:]:
    with tempfile.TemporaryDirectory() as tmp:
        build(os.path.join(tmp, "configurator"))
        diff = differences(os.path.join(tmp, "configurator"), published)
    if diff:
        raise SystemExit(f"the published configurator is out of step with its sources: {diff}")
    print("the published configurator matches its sources")
else:
    build(published)
    print(f"published {len(os.listdir(published))} files to {os.path.relpath(published, ROOT)}/")
