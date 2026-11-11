"""Rebuild index.html from scripts/site/index.template.html without the Blender outputs 06_build_site.py needs.

06 fills the home page from output/ and build/, which only a full pipeline run makes. In a checkout where those are missing
or old, running 06 would republish stale downloads and screenshots. This fills the template from what is already published:
the numbers are read back from the published index.html by matching it against the template it was built from, and image
tags are made from the WebP files already in assets/img. It first rebuilds the published page from the published template
and stops unless that comes out byte for byte the same, so it can't quietly drift from 06.

Usage: home_from_published.py [--from origin/main] [KEY=value ...]
  --from       the commit whose index.html and template are the published pair (default origin/main)
  KEY=value    a placeholder the published page didn't have, such as a new picture's CODE_NAME share code

A new picture needs its WebP files in assets/img first (800, 1400 and full width, as 06's optimise() writes them) and its
entry in 06's capture_configurator_shots, so a full pipeline run later makes the same page.
"""
import glob, os, re, shutil, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "img")
TEMPLATE = "scripts/site/index.template.html"
COMMENT = re.compile(r"<!--(IMG|SHOT) (.+?)-->")
args = sys.argv[1:]
ref = args.pop(args.index("--from") + 1) if "--from" in args else "origin/main"
extra = dict(a.split("=", 1) for a in args if a != "--from")


def show(path):
    return subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def values_from(old_t, old_h):
    """The {{KEY}} values the published page was built with."""
    pattern, seen, pos = "", set(), 0
    for m in re.finditer(r"<!--(?:IMG|SHOT) .+?-->|\{\{FULL:\w+\}\}|\{\{(\w+)\}\}", old_t):
        pattern += re.escape(old_t[pos:m.start()])
        key = m.group(1)
        if m.group(0).startswith("<!--"):
            pattern += r"<img [^>]*>"
        elif key is None:
            pattern += r'[^"]+'
        elif key in seen:
            pattern += f"(?P={key})"
        else:
            seen.add(key)
            pattern += f"(?P<{key}>.+?)"
        pos = m.end()
    m = re.fullmatch(pattern + re.escape(old_t[pos:]), old_h, re.S)
    if not m:
        raise SystemExit(f"{ref}: index.html doesn't match the template it should have been built from")
    return m.groupdict()


def files(name):
    got = sorted((int(re.search(r"-(\d+)\.webp$", f).group(1)), os.path.basename(f)) for f in glob.glob(os.path.join(IMG, f"{name}-*.webp"))
                 if re.fullmatch(re.escape(name) + r"-\d+\.webp", os.path.basename(f)))
    if not got:
        raise SystemExit(f"no published image for {name} in assets/img")
    return got


def tag(m):
    name, alt, sizes, *loading = (s.strip() for s in m.group(2).split("|"))
    loading = loading[0] if loading else "lazy"
    got = files(name)
    w, fn = got[-1]
    h = Image.open(os.path.join(IMG, fn)).height
    srcset = ", ".join(f"assets/img/{f} {x}w" for x, f in got)
    prio = ' fetchpriority="high"' if loading == "eager" else ""
    return f'<img src="assets/img/{fn}" srcset="{srcset}" sizes="{sizes}" width="{w}" height="{h}" alt="{alt}" loading="{loading}" decoding="async"{prio}>'


def build(template, values):
    page = COMMENT.sub(tag, template)
    page = re.sub(r"\{\{FULL:(\w+)\}\}", lambda m: f"assets/img/{files(m.group(1))[-1][1]}", page)
    for k, v in values.items():
        page = page.replace("{{" + k + "}}", v)
    left = re.findall(r"\{\{\w+\}\}", page)
    if left:
        raise SystemExit(f"unfilled placeholders: {sorted(set(left))}. Pass them as KEY=value")
    return page


old_t, old_h = show(TEMPLATE), show("index.html")
values = values_from(old_t, old_h)
if build(old_t, values) != old_h:
    raise SystemExit(f"{ref}: rebuilding its own page didn't give its index.html, so this can't be trusted here. Run 06 instead")
values.update(extra)
open(os.path.join(ROOT, "index.html"), "w").write(build(open(os.path.join(ROOT, TEMPLATE)).read(), values))
shutil.copyfile(os.path.join(ROOT, "scripts", "site", "styles.css"), os.path.join(ROOT, "styles.css"))
print(f"index.html and styles.css rebuilt from {ref}'s values: {', '.join(sorted(values))}")
