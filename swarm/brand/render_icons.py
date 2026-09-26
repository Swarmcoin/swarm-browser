#!/usr/bin/env python3
# Copyright 2026 Swarm.
"""Re-cut the SWARM mark into the exact icon files Chromium 153 ships.

Source of truth: D:/privacy/brand/swarm-mark (build_icons.py there renders the
hive-bee mark -- Hive Orange #FF8A1F on Hive Black #0A0908, no face, no
gradients). This script never redraws the mark; it only re-cuts the approved
renders into the file names and pixel sizes that
chrome/app/theme/chromium expects, verified against the unpacked
chromium-153.0.8010.52 tree:

    product_logo_16.png   16x16      product_logo_64.png    64x64
    product_logo_24.png   24x24      product_logo_128.png   128x128
    product_logo_48.png   48x48      product_logo_256.png   256x256
    product_logo_22_mono.png  22x22, monochrome silhouette
    win/chromium.ico      16/32/48/256   win/app_list.ico    16/32/48/256
    win/chromium_doc.ico  16/32/48/256   win/chromium_pdf.ico 16/32/48/256
    win/tiles/Logo.png    600x600        win/tiles/SmallLogo.png 176x176

There is no product_logo_32.png upstream; the 32px cut only appears inside the
.ico files. win/incognito.ico is deliberately left upstream: it is a UI glyph,
not branding.

    python swarm/brand/render_icons.py [--source DIR]
"""
import argparse
import shutil
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / 'icons'
DEFAULT_SOURCE = Path('D:/privacy/brand/swarm-mark/dist/icons')

PNG_SIZES = (16, 24, 48, 64, 128, 256)
ICO_SIZES = (16, 32, 48, 256)
ICO_NAMES = ('chromium.ico', 'chromium_doc.ico', 'chromium_pdf.ico', 'app_list.ico')
TILES = (('Logo.png', 600), ('SmallLogo.png', 176))
EXT_ICON_SIZES = (16, 32, 48, 128)


def load_frames(ico_path):
    """Every embedded frame of the brand .ico, keyed by pixel size."""
    frames = {}
    with Image.open(ico_path) as ico:
        for size in sorted(ico.info.get('sizes', [])):
            ico.size = size
            frames[size[0]] = ico.convert('RGBA').copy()
    return frames


def cut(frames, master, size):
    """The best available render at `size`.

    The brand .ico carries the optical size ramp (a heavier cut below 48px), so
    an exact embedded frame always wins; otherwise downscale the next larger
    frame, or the 1024px master.
    """
    if size in frames:
        return frames[size].copy()
    larger = [s for s in frames if s > size]
    src = frames[min(larger)] if larger else master
    return src.resize((size, size), Image.LANCZOS)


def monochrome(img):
    """White silhouette on transparency, for product_logo_22_mono.png."""
    out = Image.new('RGBA', img.size, (255, 255, 255, 0))
    out.putalpha(img.getchannel('A'))
    white = Image.new('RGBA', img.size, (255, 255, 255, 255))
    white.putalpha(img.getchannel('A'))
    return white


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE,
                        help='brand/swarm-mark/dist/icons directory')
    args = parser.parse_args()

    ico_path = args.source / 'desktop' / 'swarm.ico'
    big_path = args.source / 'desktop' / 'icon-1024.png'
    if not ico_path.is_file() or not big_path.is_file():
        raise SystemExit(f'brand renders not found under {args.source}')

    (OUT / 'win' / 'tiles').mkdir(parents=True, exist_ok=True)

    frames = load_frames(ico_path)
    with Image.open(big_path) as opened:
        master = opened.convert('RGBA')

        for size in PNG_SIZES:
            cut(frames, master, size).save(
                OUT / f'product_logo_{size}.png', 'PNG', optimize=True)
            print('wrote', OUT / f'product_logo_{size}.png')

        mono = monochrome(cut(frames, master, 22))
        mono.save(OUT / 'product_logo_22_mono.png', 'PNG', optimize=True)
        print('wrote', OUT / 'product_logo_22_mono.png')

        # One .ico body, written under each of the four upstream names. The
        # document icons reuse the plain mark for now; a proper document
        # treatment is a later design task (noted in swarm/README.md).
        ico_frames = [cut(frames, master, s) for s in ICO_SIZES]
        for name in ICO_NAMES:
            ico_frames[-1].save(OUT / 'win' / name, 'ICO',
                                sizes=[(s, s) for s in ICO_SIZES])
            print('wrote', OUT / 'win' / name)

        for name, size in TILES:
            cut(frames, master, size).save(
                OUT / 'win' / 'tiles' / name, 'PNG', optimize=True)
            print('wrote', OUT / 'win' / 'tiles' / name)

        # Action icons for the two bundled extensions.
        for folder, stem in (('wallet', 'wallet'), ('rewards', 'rewards')):
            dest = HERE.parent / 'extensions' / folder / 'icons'
            dest.mkdir(parents=True, exist_ok=True)
            for size in EXT_ICON_SIZES:
                cut(frames, master, size).save(
                    dest / f'{stem}-{size}.png', 'PNG', optimize=True)
            print('wrote', dest)


if __name__ == '__main__':
    main()
