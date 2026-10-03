#!/usr/bin/env python3
"""Favicon set from Patrick's "PT" brush logo (assets/brand/pt-logo-512.png).

Dev-only; outputs are committed. Needs Pillow (`pip install pillow`).
    python3 tools/make-icons.py

The logo is a raster brush mark, so there is no SVG icon: a traced version
would not be the same mark.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NAVY = (33, 40, 54, 255)          # --background-color
src = Image.open(ROOT / 'assets/brand/pt-logo-512.png').convert('RGBA')
out = ROOT / 'assets/icons'
out.mkdir(exist_ok=True)

def palette(im):
    # 256 colours with alpha: plenty for an icon, a third of the bytes.
    return im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)

def on_navy(size, mark_size):
    bg = Image.new('RGBA', (size, size), NAVY)
    off = (size - mark_size) // 2
    bg.alpha_composite(src.resize((mark_size, mark_size), Image.LANCZOS), (off, off))
    return bg

# Browser tabs: transparent, three sizes in one file.
src.save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
# Manifest icons (Android, installs).
for n in (192, 512):
    palette(src.resize((n, n), Image.LANCZOS)).save(out / f'icon-{n}.png', optimize=True)
# Maskable: Android crops to a circle/squircle, so the mark stays inside the
# central 80% safe zone, on navy.
palette(on_navy(512, 368)).save(out / 'icon-maskable-512.png', optimize=True)
# iOS paints transparency black, so the home-screen icon gets the navy too.
on_navy(180, 144).convert('RGB').save(out / 'apple-touch-icon.png', optimize=True)

for f in [ROOT / 'favicon.ico', *sorted(out.iterdir())]:
    print(f'{f.relative_to(ROOT)}  {f.stat().st_size // 1024} KiB')
