#!/usr/bin/env python3
# Copyright 2026 Swarm.
"""Re-cut the SWARM mark into the logos Chromium draws INSIDE its UI.

render_icons.py covers the app icons (chrome/app/theme/chromium). The owner's
2026-09-30 screenshot of chrome://settings showed what that misses: the
Settings header, the About item, the tab favicon of every chrome:// page and
the extensions/history/downloads toolbars draw the product logo from other
resources. This script writes SWARM versions of every one of those files into
swarm/brand/tree/, a folder that mirrors the Chromium source tree:
install_swarm_assets.py copies each file over the same path in build/src and
fails if the destination does not exist (a Chromium rename is caught, not
silently skipped).

    tree path (relative to build/src)                          size        from
    chrome/app/theme/default_100_percent/chromium/
        product_logo_16.png  16x16    product_logo_32.png  32x32   app icon
        product_logo_name_22.png 97x22 (+ _white)                  lockup
    chrome/app/theme/default_200_percent/chromium/
        product_logo_16.png  32x32    product_logo_32.png  64x64   app icon
        product_logo_name_22.png 194x44 (+ _white)                 lockup
    components/resources/default_100_percent/chromium/
        product_logo.png 171x32 (+ _white)   favicon_product.png 16x16
    components/resources/default_200_percent/chromium/
        product_logo.png 342x64 (+ _white)   favicon_product.png 32x32
    chrome/app/theme/chromium/product_logo.svg,
        product_logo_animation.svg                                 app icon svg
    ui/webui/resources/images/chrome_logo_dark.svg                 mark, amber
    chrome/installer/mini_installer/mini_installer.ico,
        chrome/installer/setup/setup.ico                           app icon ico

IDR_PRODUCT_LOGO_32 is what chrome://theme/current-channel-logo serves
(webui::CurrentChannelLogoResourceId), the image in the Settings, Extensions,
History and Downloads headers and on the About page; chrome_logo_dark.svg is
the same header in dark mode. The About item's glyph is an inline icon
(cr:chrome-product), which swarm-ui-logos.patch changes.

It also writes the SWARM Start extension's own icons
(swarm/extensions/start/icons/start-{16,32,48,128}.png): the mark alone, in
amber on transparency, so the Navigator's toolbar button is not mistaken for
the wallet's dark tile.

SVGs are rendered by headless Chromium through the brand kit's own
render helper conventions (Playwright), never in a window.

    python swarm/brand/render_ui_logos.py [--brand D:/privacy/brand/swarm-mark]
"""
import argparse
import os
import shutil
import tempfile
from pathlib import Path

from PIL import Image

import render_icons

HERE = Path(__file__).resolve().parent
TREE = HERE / 'tree'
START_ICONS = HERE.parent / 'extensions' / 'start' / 'icons'
DEFAULT_BRAND = Path('D:/privacy/brand/swarm-mark')

T100 = 'chrome/app/theme/default_100_percent/chromium'
T200 = 'chrome/app/theme/default_200_percent/chromium'
C100 = 'components/resources/default_100_percent/chromium'
C200 = 'components/resources/default_200_percent/chromium'

# (tree path, pixel size) cut from the app icon, like the app icons themselves.
TILE_PNGS = (
    (f'{T100}/product_logo_16.png', 16),
    (f'{T100}/product_logo_32.png', 32),
    (f'{T200}/product_logo_16.png', 32),
    (f'{T200}/product_logo_32.png', 64),
    (f'{C100}/favicon_product.png', 16),
    (f'{C200}/favicon_product.png', 32),
)

# (tree path, width, height, lockup svg). "_white" is for dark backgrounds.
LOCKUPS = (
    (f'{T100}/product_logo_name_22.png', 97, 22, 'swarm-lockup-palette.svg'),
    (f'{T100}/product_logo_name_22_white.png', 97, 22, 'swarm-lockup-dark.svg'),
    (f'{T200}/product_logo_name_22.png', 194, 44, 'swarm-lockup-palette.svg'),
    (f'{T200}/product_logo_name_22_white.png', 194, 44, 'swarm-lockup-dark.svg'),
    (f'{C100}/product_logo.png', 171, 32, 'swarm-lockup-palette.svg'),
    (f'{C100}/product_logo_white.png', 171, 32, 'swarm-lockup-dark.svg'),
    (f'{C200}/product_logo.png', 342, 64, 'swarm-lockup-palette.svg'),
    (f'{C200}/product_logo_white.png', 342, 64, 'swarm-lockup-dark.svg'),
)

SVG_COPIES = (
    ('chrome/app/theme/chromium/product_logo.svg', 'swarm-app-icon.svg'),
    ('chrome/app/theme/chromium/product_logo_animation.svg', 'swarm-app-icon.svg'),
)

ICO_COPIES = (
    'chrome/installer/mini_installer/mini_installer.ico',
    'chrome/installer/setup/setup.ico',
)

# The dark-mode header glyph: 24x24 like the file it replaces, the mark in
# honey and amber on transparency, centred.
DARK_LOGO_PATH = 'ui/webui/resources/images/chrome_logo_dark.svg'


def dark_logo_svg(brand_dist):
    src = (brand_dist / 'swarm-mark-palette.svg').read_text(encoding='utf-8')
    body = src[src.index('>', src.index('<svg')) + 1:src.rindex('</svg>')]
    body = '\n'.join(l for l in body.splitlines() if '<title' not in l)
    # viewBox 1000 x 467.95 centred in a square 1000 x 1000 box.
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" '
            'viewBox="0 -266 1000 1000">' + body.strip() + '</svg>\n')


def render_svgs(jobs):
    """jobs: (svg path, out path, w, h). Headless Chromium, object-fit contain."""
    from playwright.sync_api import sync_playwright
    work = Path(tempfile.mkdtemp(prefix='swarm-render-'))
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--force-color-profile=srgb', '--disable-lcd-text'])
            page = browser.new_page(viewport={'width': 16, 'height': 16})
            for svg, out, w, h in jobs:
                html = work / 'r.html'
                html.write_text(
                    '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;'
                    f'background:transparent}}img{{display:block;width:{w}px;height:{h}px;'
                    f'object-fit:contain}}</style><img src="{Path(svg).resolve().as_uri()}">',
                    encoding='utf-8')
                page.set_viewport_size({'width': w, 'height': h})
                page.goto(html.resolve().as_uri())
                page.wait_for_timeout(120)
                Path(out).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(out), omit_background=True)
                print('wrote', out)
            browser.close()
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--brand', type=Path, default=DEFAULT_BRAND)
    a = ap.parse_args()
    dist = a.brand / 'dist'
    icons = dist / 'icons'

    frames = render_icons.load_frames(icons / 'desktop' / 'swarm.ico')
    with Image.open(icons / 'desktop' / 'icon-1024.png') as opened:
        master = opened.convert('RGBA')
    for rel, size in TILE_PNGS:
        out = TREE / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        render_icons.cut(frames, master, size).save(out, 'PNG', optimize=True)
        print('wrote', out)

    for rel, src in SVG_COPIES:
        out = TREE / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(dist / src, out)
        print('wrote', out)

    out = TREE / DARK_LOGO_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(dark_logo_svg(dist), encoding='utf-8', newline='\n')
    print('wrote', out)

    for rel in ICO_COPIES:
        out = TREE / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HERE / 'icons' / 'win' / 'chromium.ico', out)
        print('wrote', out)

    jobs = [(dist / svg, TREE / rel, w, h) for rel, w, h, svg in LOCKUPS]
    # SWARM Start: the mark alone (the optical small cut below 48 px).
    START_ICONS.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        svg = 'swarm-mark-small.svg' if size < 48 else 'swarm-mark-palette.svg'
        jobs.append((dist / svg, START_ICONS / f'start-{size}.png', size, size))
    render_svgs(jobs)


if __name__ == '__main__':
    main()
