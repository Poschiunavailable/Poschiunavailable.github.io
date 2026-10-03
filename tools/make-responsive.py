#!/usr/bin/env python3
"""480w and 960w WebP variants of every raster image projects.json uses.

Dev-only; outputs are committed. Needs Pillow.
    python3 tools/make-responsive.py

Convention (read by modules/images.js): assets/foo.webp gets
assets/foo-480.webp and assets/foo-960.webp. The original stays as the
`src` fallback. SVGs need no variants. Re-run after adding an image; the
site walk fails if a variant is missing.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WIDTHS = (480, 960)
RASTER = {'.webp', '.jpg', '.jpeg', '.png'}

def images(projects):
    for p in projects:
        for k in ('image', 'poster'):
            if p.get(k): yield p[k]
        for t in p.get('workTopics', []):
            if t.get('image'): yield t['image']

projects = json.loads((ROOT / 'projects.json').read_text())
for rel in sorted(set(images(projects))):
    src = ROOT / rel
    if src.suffix.lower() not in RASTER:
        continue
    im = Image.open(src).convert('RGB')
    for w in WIDTHS:
        out = src.with_name(f'{src.stem}-{w}.webp')
        h = round(im.height * w / im.width)
        # Never upscale: a variant wider than its source is just the source.
        (im if im.width <= w else im.resize((w, h), Image.LANCZOS)).save(out, 'WEBP', quality=80, method=6)
        print(f'{out.relative_to(ROOT)}  {out.stat().st_size // 1024} KiB')
