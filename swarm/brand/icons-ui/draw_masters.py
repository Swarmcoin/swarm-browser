#!/usr/bin/env python3
# Copyright 2026 Swarm.
"""The SWARM UI icon masters, in swarm.green's icon language.

32-unit grid, 2.4 stroke, round caps and joins, the main shape at full ink and
a half-opacity (.42) "lit inner face", hexagon / comb motifs where they fit.
Several are swarm.green's own sprite symbols (index.html: i-store, i-layers,
i-shield, i-browser, i-support ...), the rest are drawn here in the same
hand. Running this writes one <name>.svg per icon next to it; those SVGs are
the masters, and icons_ui.py turns them into Chromium's formats.

    python swarm/brand/icons-ui/draw_masters.py
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
FAINT = ' opacity=".42"'
HEX = 'M16 3.6 26.8 9.8v12.4L16 28.4 5.2 22.2V9.8Z'

# name -> inner SVG (stroke by default; fill="currentColor" stroke="none" for solids)
ICONS = {
    # ── toolbar ────────────────────────────────────────────────────────
    'back': '<path d="M14 7.6 5.6 16l8.4 8.4"/><path d="M6.4 16h20"/>',
    'forward': '<path d="M18 7.6 26.4 16 18 24.4"/><path d="M25.6 16h-20"/>',
    'reload': '<path d="M25.4 17.4A9.6 9.6 0 1 1 22.6 9"/><path d="M24 4.4v5.8h-5.8"/>',
    'stop': f'<path d="{HEX}"{FAINT}/><path d="M11.8 11.8l8.4 8.4M20.2 11.8l-8.4 8.4"/>',
    'home': '<path d="M4.8 14.6 16 5.4l11.2 9.2"/><path d="M8.4 12v14.4h15.2V12"/><path d="M13.4 26.4v-6.2h5.2v6.2"' + FAINT + '/>',
    'app-menu': ('<g fill="currentColor" stroke="none">'
                 '<path d="M16 3.8l3 1.7v3.4l-3 1.7-3-1.7V5.5Z"/>'
                 '<path d="M16 12.6l3 1.7v3.4l-3 1.7-3-1.7v-3.4Z"/>'
                 '<path d="M16 21.4l3 1.7v3.4l-3 1.7-3-1.7v-3.4Z"/></g>'),
    'download': '<path d="M16 4.4v13.8"/><path d="M10.2 12.6 16 18.4l5.8-5.8"/><path d="M4.8 20.2v4.2a3 3 0 0 0 3 3h16.4a3 3 0 0 0 3-3v-4.2"' + FAINT + '/>',
    'extensions': ('<path d="M6.4 10.4h5.4a3.2 3.2 0 1 1 6.4 0h5.4v5.4a3.2 3.2 0 1 1 0 6.4v5.4H6.4Z"/>'
                   '<path d="M6.4 18.8h3.2"' + FAINT + '/>'),
    'star': '<path d="M16 4.4l3.5 7.1 7.9 1.2-5.7 5.5 1.3 7.8L16 22.3 8.9 26l1.4-7.8-5.7-5.5 7.9-1.2Z"/>',
    'side-panel': '<rect x="3.8" y="5.4" width="24.4" height="21.2" rx="3.2"/><path d="M19.6 5.4v21.2"' + FAINT + '/><path d="M22.6 11h2.6M22.6 15h2.6"' + FAINT + '/>',
    # ── app menu ───────────────────────────────────────────────────────
    'new-tab': '<path d="M4.4 26.4V9.6a2 2 0 0 1 2-2h7.2l2.8 3.6h9.2a2 2 0 0 1 2 2v13.2Z"' + FAINT + '/><path d="M16 14.6v8.4M11.8 18.8h8.4"/>',
    'new-window': '<rect x="4" y="5.6" width="24" height="20.8" rx="3.2"/><path d="M4 11.2h24"' + FAINT + '/><path d="M16 14.6v8.4M11.8 18.8h8.4"/>',
    'incognito': ('<path d="M5.2 14.2h21.6"/><path d="M9.2 14.2l2.2-7.4h9.2l2.2 7.4"' + FAINT + '/>'
                  '<circle cx="10.8" cy="21.4" r="3.6"/><circle cx="21.2" cy="21.4" r="3.6"/><path d="M14.4 21.4h3.2"/>'),
    'key': '<circle cx="10.4" cy="16" r="5"/><path d="M15.4 16h12.2"/><path d="M23.6 16v4.4M19.6 16v3"' + FAINT + '/>',
    'history': '<path d="M5.4 16a10.6 10.6 0 1 0 3.1-7.5"/><path d="M4.6 5.8v5.2h5.2"/><path d="M16 10.2V16l3.8 2.6"' + FAINT + '/>',
    'bookmarks': '<path d="M9.6 4.4h12.8a1.6 1.6 0 0 1 1.6 1.6v21.6L16 22l-8 5.6V6a1.6 1.6 0 0 1 1.6-1.6Z"/><path d="M12.4 10.8h7.2"' + FAINT + '/>',
    'tab-groups': '<path d="M16 3.8 28.4 10.2 16 16.6 3.6 10.2Z"/><path d="M3.6 15.8 16 22.2l12.4-6.4"' + FAINT + '/><path d="M3.6 21.4 16 27.8l12.4-6.4"' + FAINT + '/>',
    'trash': '<path d="M5.6 9.2h20.8"/><path d="M12.4 9.2V6h7.2v3.2"/><path d="M8.4 9.2l1.4 17.6h12.4l1.4-17.6"/><path d="M14 13.8v8.4M18 13.8v8.4"' + FAINT + '/>',
    'zoom': '<circle cx="14" cy="14" r="8.4"/><path d="M20.2 20.2 27.4 27.4"/><path d="M14 10.4v7.2M10.4 14h7.2"' + FAINT + '/>',
    'print': ('<path d="M9.6 11V4.8h12.8V11"' + FAINT + '/><path d="M8.4 22.8H6a1.6 1.6 0 0 1-1.6-1.6v-8.6A1.6 1.6 0 0 1 6 11h20a1.6 1.6 0 0 1 1.6 1.6v8.6a1.6 1.6 0 0 1-1.6 1.6h-2.4"/>'
              '<rect x="9.6" y="18" width="12.8" height="9.6" rx="1.2"/>'),
    'find': '<circle cx="14" cy="14" r="8.4"/><path d="M20.2 20.2 27.4 27.4"/><path d="M14 9.6a4.4 4.4 0 0 0-4.4 4.4"' + FAINT + '/>',
    'share': '<path d="M16 19.2V4.4"/><path d="M10.8 9.6 16 4.4l5.2 5.2"/><path d="M4.8 18v6.4a3 3 0 0 0 3 3h16.4a3 3 0 0 0 3-3V18"' + FAINT + '/>',
    'tools': '<path d="M20.2 4.8a6.2 6.2 0 0 0-5.6 8.8L5.4 22.8a2.4 2.4 0 0 0 3.4 3.4l9.2-9.2a6.2 6.2 0 0 0 8.8-5.6l-3.8 1.4-3.4-3.4Z"/><circle cx="7.2" cy="24.6" r=".9" fill="currentColor" stroke="none"' + FAINT + '/>',
    'help': f'<path d="{HEX}"/><path d="M12.6 12.8a3.5 3.5 0 1 1 5 3.1c-1 .5-1.6 1.3-1.6 2.4v.7"/><circle cx="16" cy="22.4" r="1.4" fill="currentColor" stroke="none"/>',
    'settings': f'<path d="{HEX}"/><circle cx="16" cy="16" r="4.4"/><path d="M16 3.6v4M16 24.4v4M5.2 9.8l3.4 2M23.4 20.2l3.4 2M26.8 9.8l-3.4 2M8.6 20.2l-3.4 2"' + FAINT + '/>',
    'exit': '<path d="M12.8 5.6H7.2a1.6 1.6 0 0 0-1.6 1.6v17.6a1.6 1.6 0 0 0 1.6 1.6h5.6"' + FAINT + '/><path d="M14 16h13.4"/><path d="M22.4 10.8 27.6 16l-5.2 5.2"/>',
    # ── Settings sidebar ───────────────────────────────────────────────
    'person': '<circle cx="16" cy="10.8" r="5.2"/><path d="M6 27.2c.6-5.6 4.6-8.8 10-8.8s9.4 3.2 10 8.8"/>',
    'shield': '<path d="M16 3.4 27.4 7.6v8.2c0 5.9-4.4 10.2-11.4 12.2C9 26 4.6 21.7 4.6 15.8V7.6Z"/><path d="M16 10.6l3 1.7v3.4l-3 1.7-3-1.7v-3.4Z" fill="currentColor" stroke="none"/><path d="M16 18v3.6"' + FAINT + '/>',
    'speed': '<path d="M5.2 22.4a11.2 11.2 0 1 1 21.6 0"/><path d="M16 19.2l5.2-6.8"/><circle cx="16" cy="19.6" r="1.6" fill="currentColor" stroke="none"/><path d="M8.8 15.2l1.6.8M16 8.4v1.8M23.2 15.2l-1.6.8"' + FAINT + '/>',
    'palette': ('<path d="M16 4.4C9.4 4.4 4.4 9.2 4.4 15.4c0 6.2 5 11.2 11.2 11.2 1.8 0 2.8-1.2 2.4-2.6-.5-1.6.4-3 2.2-3h3c2.6 0 4.4-2 4.4-4.6C27.6 9.8 22.4 4.4 16 4.4Z"/>'
                '<path d="M10 14.4l1.6.9v1.8l-1.6.9-1.6-.9v-1.8Z" fill="currentColor" stroke="none"/>'
                '<path d="M15.2 9.2l1.6.9v1.8l-1.6.9-1.6-.9v-1.8Z" fill="currentColor" stroke="none"' + FAINT + '/>'
                '<path d="M21.2 11.6l1.6.9v1.8l-1.6.9-1.6-.9v-1.8Z" fill="currentColor" stroke="none"/>'),
    'search': '<circle cx="14" cy="14" r="8.4"/><path d="M20.2 20.2 27.4 27.4"/>',
    'default-browser': ('<circle cx="13.6" cy="13.6" r="9.6"/><path d="M4 13.6h19.2M13.6 4c2.6 2.8 3.9 6 3.9 9.6s-1.3 6.8-3.9 9.6C11 20.4 9.7 17.2 9.7 13.6S11 6.8 13.6 4Z"' + FAINT + '/>'
                        '<path d="M22.4 17.2 28.4 19.3v3.9c0 2.9-2.2 5-6 6-3.8-1-6-3.1-6-6v-3.9Z" fill="currentColor" stroke="none"/>'),
    'power': '<path d="M16 4.4v10"/><path d="M9.4 8.2a10.4 10.4 0 1 0 13.2 0"' + FAINT + '/>',
    'translate': '<path d="M4.4 7.2h12.8M10.8 4.4v2.8"/><path d="M14.4 7.2c-1.2 5-4.4 9-9.2 11.2"/><path d="M8.4 11.2c1.6 3 3.8 5.2 6.4 6.6"' + FAINT + '/><path d="M15.6 27.6 21 14.4l5.4 13.2M17.4 23.2h7.2"/>',
    'accessibility': '<circle cx="16" cy="6.8" r="2.6"/><path d="M5.6 11.6c3.4 1 6.8 1.6 10.4 1.6s7-.6 10.4-1.6"/><path d="M16 13.2v6.4l-4 7.6M16 19.6l4 7.6"/>',
    'system': '<rect x="3.4" y="5.4" width="25.2" height="16.8" rx="2.8"/><path d="M3.4 18h25.2"' + FAINT + '/><path d="M16 22.2v4.4M11.4 26.6h9.2"/>',
    'reset': '<path d="M6.6 16a9.4 9.4 0 1 0 2.8-6.6"/><path d="M5.8 4.6v5.6h5.6"/><path d="M16 12.4l3 1.7v3.4l-3 1.7-3-1.7v-3.4Z" fill="currentColor" stroke="none"' + FAINT + '/>',
    'ai': '<path d="M16 4.8l2.4 6.8 6.8 2.4-6.8 2.4L16 23.2l-2.4-6.8L6.8 14l6.8-2.4Z"/><path d="M24.4 21.6l.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9Z"' + FAINT + '/>',
}


def _mark():
    """The SWARM mark (brand kit swarm-mark-mono.svg, absolute M/L/C/Z only),
    scaled into the 32 grid: 28 units wide, centred."""
    import re
    src = Path('D:/privacy/brand/swarm-mark/dist/swarm-mark-mono.svg').read_text(encoding='utf-8')
    s, ox, oy = 0.028, 2.0, 16 - 467.95 * 0.028 / 2
    paths = []
    for d in re.findall(r' d="([^"]+)"', src):
        nums = iter(re.findall(r'-?\d+(?:\.\d+)?', d))
        def pair(m):
            x, y = float(m.group(1)), float(m.group(2))
            return f'{x * s + ox:.2f} {y * s + oy:.2f}'
        d2 = re.sub(r'(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)', pair, d)
        paths.append(f'<path d="{d2}"/>')
    return '<g fill="currentColor" stroke="none">' + ''.join(paths) + '</g>'


ICONS['mark'] = _mark()
# ── address bar: page info ───────────────────────────────────────────
ICONS['tune'] = ('<path d="M5.2 10.4h9.2M22.8 10.4h4M5.2 21.6h4M17.6 21.6h9.2"/>'
                 '<path d="M18.6 7.2l3.2 1.6v3.2l-3.2 1.6-3.2-1.6V8.8Z"/>'
                 '<path d="M13.4 18.4l3.2 1.6v3.2l-3.2 1.6-3.2-1.6V20Z"' + FAINT + '/>')
ICONS['info'] = f'<path d="{HEX}"/><path d="M16 14.8v7"/><circle cx="16" cy="10.4" r="1.4" fill="currentColor" stroke="none"/>'
ICONS['warning'] = ('<path d="M16 4.8 28 26H4Z"/><path d="M16 12.4v6.4"/>'
                    '<circle cx="16" cy="22.2" r="1.4" fill="currentColor" stroke="none"/>')
ICONS['dangerous'] = (f'<path d="{HEX}" fill="currentColor" stroke="none"' + FAINT + '/>'
                      f'<path d="{HEX}"/><path d="M16 9.6v8"/><circle cx="16" cy="21.8" r="1.4" fill="currentColor" stroke="none"/>')
ICONS['star-filled'] = ('<path d="M16 4.4l3.5 7.1 7.9 1.2-5.7 5.5 1.3 7.8L16 22.3 8.9 26l1.4-7.8-5.7-5.5 7.9-1.2Z" '
                        'fill="currentColor"/>')


def svg(inner):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" '
            f'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">{inner}</svg>\n')


def main():
    for name, inner in ICONS.items():
        (HERE / f'{name}.svg').write_text(svg(inner), encoding='utf-8', newline='\n')
    print(f'wrote {len(ICONS)} masters to {HERE}')


if __name__ == '__main__':
    main()
