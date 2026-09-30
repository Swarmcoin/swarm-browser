#!/usr/bin/env python3
# Copyright 2026 Swarm.
"""SWARM UI icons (build 5, "G5"): from the SVG masters to Chromium's formats.

The masters are swarm/brand/icons-ui/*.svg (32-unit grid, 2.4 stroke, round
caps, a .42 "lit inner face"; drawn by icons-ui/draw_masters.py). This script
turns them into what each surface of the browser reads:

* Views surfaces (toolbar, app menu) draw Skia vector icons, `.icon` files
  compiled into the browser. For every entry of TARGETS below it writes
  swarm/brand/tree/<tree path>.icon, which install_swarm_assets.py copies over
  the upstream file of the same path (and fails if that file is gone).
* The Settings sidebar draws SVG iconsets (settings/icons.html.ts);
  make_swarm_patches.py reads SETTINGS_ICONS and the masters through
  settings_iconset_g() and writes swarm-ui-icons.patch.

Conversion: every path becomes absolute MOVE_TO / LINE_TO / CUBIC_TO /
QUADRATIC_TO / ARC_TO / CLOSE; <circle> -> CIRCLE, <rect rx> -> ROUND_RECT;
a stroked element gets STROKE (Skia's vector icons already use round caps;
joins are Skia's default miter, the one difference from the site's SVGs);
opacity .42 -> PATH_COLOR_ALPHA 0x6B; fills use FILL_RULE_NONZERO. The icon
is drawn on a 32-unit canvas and scaled by Chromium to the size each surface
asks for (16 in menus, 20 in the toolbar).

    python swarm/brand/icons_ui.py            # write the .icon files
    python swarm/brand/icons_ui.py --check    # also re-parse every output
"""
import argparse
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
MASTERS = HERE / 'icons-ui'
TREE = HERE / 'tree'
NS = '{http://www.w3.org/2000/svg}'

A = 'chrome/app/vector_icons/'
C = 'components/vector_icons/'
O = 'components/omnibox/browser/vector_icons/'
V = 'ui/views/vector_icons/'
# master -> the upstream .icon files it replaces. Chromium 153 draws the
# "...Old" variants unless the RoundedIcons feature is on (it is off by
# default), and the touch variants in touch mode; both are replaced so a
# surface never mixes styles.
TARGETS = {
    # toolbar
    'back': [C + 'back_arrow_chrome_refresh_old.icon', A + 'back_arrow_touch_old.icon'],
    'forward': [C + 'forward_arrow_chrome_refresh_old.icon', A + 'forward_arrow_touch_old.icon'],
    'reload': [C + 'reload_chrome_refresh_old.icon', A + 'reload_touch_old.icon'],
    'stop': [A + 'navigate_stop_chrome_refresh_old.icon', A + 'navigate_stop_touch_old.icon'],
    'home': [A + 'navigate_home_chrome_refresh_old.icon', A + 'navigate_home_touch_old.icon'],
    'app-menu': [A + 'browser_tools_chrome_refresh_old.icon', A + 'browser_tools_touch_old.icon'],
    'download': [A + 'download_toolbar_button_chrome_refresh_old.icon', A + 'download_toolbar_button_touch_old.icon',
                 A + 'download_in_progress_chrome_refresh_old.icon', A + 'download_in_progress_touch_old.icon',
                 A + 'download_menu_old.icon'],
    'extensions': [C + 'extension_chrome_refresh_old.icon'],
    'star': [O + 'star_chrome_refresh_old.icon'],
    'star-filled': [O + 'star_active_chrome_refresh_old.icon'],
    # address bar: the chip of internal pages, and page info
    'mark': [O + 'chrome_product.icon', O + 'product_chrome_refresh_old.icon', O + 'product_old.icon',
             A + 'chrome_product.icon', C + 'chromium/product.icon', C + 'chromium/product_refresh.icon'],
    'tune': [O + 'secure_page_info_chrome_refresh_old.icon'],
    'info': [O + 'http_chrome_refresh_old.icon'],
    'warning': [C + 'not_secure_warning_chrome_refresh_old.icon'],
    'dangerous': [C + 'dangerous_chrome_refresh_old.icon'],
    # app menu
    'new-tab': [A + 'new_tab_refresh_old.icon'],
    'new-window': [A + 'new_window_old.icon'],
    'incognito': [A + 'incognito_refresh_menu_old.icon'],
    'person': [A + 'user_account_avatar_refresh_old.icon', A + 'user_account_avatar_old.icon',
               A + 'account_circle_chrome_refresh_old.icon', C + 'account_circle_chrome_refresh_old.icon'],
    'key': [C + 'password_manager_old.icon'],
    'history': [A + 'history_old.icon'],
    'bookmarks': [A + 'bookmarks_lists_menu_old.icon'],
    'tab-groups': [A + 'saved_tab_group_bar_everything_old.icon'],
    'trash': [A + 'trash_can_refresh_old.icon'],
    'zoom': [A + 'zoom_in_old.icon'],
    'print': [A + 'print_menu_old.icon'],
    'find': [A + 'search_menu_old.icon'],
    'share': [A + 'file_save_chrome_refresh_old.icon'],
    'tools': [A + 'more_tools_menu_old.icon'],
    'help': [A + 'help_menu_old.icon'],
    'settings': [A + 'settings_menu_old.icon'],
    'exit': [A + 'exit_menu_old.icon'],
    # build 6: tab strip
    'add': [C + 'add_old.icon'],
    'close': [A + 'close_tab_chrome_refresh_old.icon', V + 'ic_close_old.icon',
              A + 'close_chrome_refresh_old.icon', C + 'close_chrome_refresh_old.icon'],
    'volume-up': [C + 'volume_up_chrome_refresh_old.icon', C + 'volume_up_old.icon'],
    'volume-off': [C + 'volume_off_chrome_refresh_old.icon'],
    'chevron-down': [A + 'tab_search_tab_strip_old.icon'],
    # build 6: side panel header, address bar
    'pin': [A + 'keep_old.icon'],
    'pin-off': [A + 'keep_off_old.icon'],
    'install': [A + 'install_desktop_chrome_refresh_old.icon', C + 'install_desktop_old.icon'],
    # build 6: app menu submenus (and the profile menu's account rows)
    'account-add': [A + 'account_add_chrome_refresh_old.icon'],
    'account-box': [A + 'account_box_old.icon', V + 'account_box_old.icon'],
    'account-manage': [A + 'account_manage_chrome_refresh_old.icon'],
    'bookmark-all': [A + 'bookmark_all_tabs_chrome_refresh_old.icon'],
    'bookmarks-manager': [A + 'bookmarks_manager_old.icon'],
    'bookmarks-panel': [A + 'bookmarks_side_panel_refresh_old.icon'],
    'app-menu-update': [A + 'browser_tools_update_chrome_refresh_old.icon'],
    'business': [C + 'business_chrome_refresh_old.icon'],
    'cast': [A + 'cast_chrome_refresh_old.icon'],
    'copy': [A + 'copy_menu_old.icon'],
    'credit-card': [A + 'credit_card_chrome_refresh_old.icon'],
    'cut': [A + 'cut_menu_old.icon'],
    'system': [A + 'desktop_windows_chrome_refresh_old.icon'],
    'dev-tools': [A + 'developer_tools_old.icon'],
    'devices': [A + 'devices_chrome_refresh_old.icon'],
    'dock-left': [A + 'dock_to_left_old.icon'],
    'dock-right': [A + 'dock_to_right_old.icon'],
    'shortcut': [A + 'drive_shortcut_chrome_refresh_old.icon'],
    'edit': [A + 'edit_chrome_refresh_old.icon', C + 'edit_chrome_refresh_old.icon'],
    'fullscreen': [A + 'fullscreen_refresh_old.icon'],
    'id-card': [C + 'id_card_old.icon'],
    'link': [A + 'link_chrome_refresh_old.icon'],
    'location': [C + 'location_on_chrome_refresh_old.icon'],
    'book': [A + 'menu_book_chrome_refresh_old.icon'],
    'name-window': [A + 'name_window_old.icon'],
    'paste': [A + 'paste_menu_old.icon'],
    'speed': [A + 'performance_old.icon'],
    'qr': [A + 'qr_code_chrome_refresh_old.icon'],
    'read-later-add': [A + 'read_later_add_old.icon'],
    'read-later': [A + 'reading_list_old.icon'],
    'ai': [A + 'release_alert_old.icon'],
    'flag': [A + 'report_old.icon'],
    'mobile-check': [A + 'request_mobile_site_checked_old.icon'],
    'mobile': [A + 'request_mobile_site_unchecked_old.icon'],
    'science': [C + 'science_old.icon'],
    'search': [C + 'search_chrome_refresh_old.icon'],
    'shield': [A + 'security_old.icon'],
    'screenshot': [A + 'sharing_hub_screenshot_old.icon'],
    'task-manager': [A + 'task_manager_old.icon'],
    'toolbar': [A + 'toolbar_chrome_refresh_old.icon', A + 'toolbar_old.icon'],
    'trip': [C + 'trip_old.icon'],
    'minus': [A + 'zoom_minus_menu_refresh_old.icon'],
    'plus': [A + 'zoom_plus_menu_refresh_old.icon'],
}
# Masters that also cover files already listed under another master are merged
# below (EXTRA), so one master can serve several surfaces.
EXTRA = {
    'incognito': [A + 'incognito_old.icon'],
    'info': [C + 'info_refresh_old.icon'],
    'warning': [C + 'warning_old.icon'],
}
for _m, _t in EXTRA.items():
    TARGETS[_m] = TARGETS[_m] + _t

# Illustrations: copied as they are (fixed colours, not currentColor).
ILLUSTRATIONS = {
    'illustrations/no-downloads.svg': 'chrome/browser/resources/downloads/images/no_downloads.svg',
}
# Settings sidebar: master -> the <g id> it replaces in every iconset of
# chrome/browser/resources/settings/icons.html.ts.
SETTINGS_ICONS = {
    'person': 'person',
    'key': 'password-manager',
    'shield': 'security',
    'speed': 'speed',
    'palette': 'palette',
    'search': 'search',
    'default-browser': 'web-asset',
    'power': 'power-settings-new',
    'translate': 'translate',
    'download': 'download',
    'accessibility': 'accessibility',
    'system': 'build',
    'reset': 'restart-alt',
    'extensions': 'chrome-extension',
    'ai': 'button-magic',
}

ALPHA_FAINT = '0x6B'  # .42 * 255
TOKEN = re.compile(r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?')


def fmt(v):
    s = f'{v:.3f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def path_commands(d):
    """SVG path data -> list of (COMMAND, [args]) with absolute coordinates."""
    toks = TOKEN.findall(d)
    out = []
    i = 0
    cmd = None
    cx = cy = sx = sy = 0.0
    last_c = None  # last cubic control point, for S
    last_q = None

    def num():
        nonlocal i
        v = float(toks[i]); i += 1
        return v

    while i < len(toks):
        if re.fullmatch(r'[A-Za-z]', toks[i]):
            cmd = toks[i]; i += 1
            if cmd in 'Zz':
                out.append(('CLOSE', []))
                cx, cy = sx, sy
                last_c = last_q = None
                continue
        elif cmd is None:
            raise ValueError(f'path starts with a number: {d[:40]}')
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'M':
            x, y = num(), num()
            if rel: x, y = cx + x, cy + y
            out.append(('MOVE_TO', [x, y])); cx, cy = sx, sy = x, y
            cmd = 'l' if rel else 'L'
            last_c = last_q = None
        elif c == 'L':
            x, y = num(), num()
            if rel: x, y = cx + x, cy + y
            out.append(('LINE_TO', [x, y])); cx, cy = x, y; last_c = last_q = None
        elif c == 'H':
            x = num() + (cx if rel else 0)
            out.append(('LINE_TO', [x, cy])); cx = x; last_c = last_q = None
        elif c == 'V':
            y = num() + (cy if rel else 0)
            out.append(('LINE_TO', [cx, y])); cy = y; last_c = last_q = None
        elif c == 'C':
            p = [num() for _ in range(6)]
            if rel: p = [p[k] + (cx if k % 2 == 0 else cy) for k in range(6)]
            out.append(('CUBIC_TO', p)); last_c = (p[2], p[3]); cx, cy = p[4], p[5]; last_q = None
        elif c == 'S':
            p = [num() for _ in range(4)]
            if rel: p = [p[k] + (cx if k % 2 == 0 else cy) for k in range(4)]
            x1, y1 = (2 * cx - last_c[0], 2 * cy - last_c[1]) if last_c else (cx, cy)
            out.append(('CUBIC_TO', [x1, y1] + p)); last_c = (p[0], p[1]); cx, cy = p[2], p[3]; last_q = None
        elif c == 'Q':
            p = [num() for _ in range(4)]
            if rel: p = [p[k] + (cx if k % 2 == 0 else cy) for k in range(4)]
            out.append(('QUADRATIC_TO', p)); last_q = (p[0], p[1]); cx, cy = p[2], p[3]; last_c = None
        elif c == 'T':
            x, y = num(), num()
            if rel: x, y = cx + x, cy + y
            x1, y1 = (2 * cx - last_q[0], 2 * cy - last_q[1]) if last_q else (cx, cy)
            out.append(('QUADRATIC_TO', [x1, y1, x, y])); last_q = (x1, y1); cx, cy = x, y; last_c = None
        elif c == 'A':
            rx, ry, rot, large, sweep, x, y = (num() for _ in range(7))
            if rel: x, y = cx + x, cy + y
            out.append(('ARC_TO', [rx, ry, rot, large, sweep, x, y])); cx, cy = x, y; last_c = last_q = None
        else:
            raise ValueError(f'unsupported path command {cmd}')
    return out


def _style(el, inherited):
    st = dict(inherited)
    for k in ('fill', 'stroke', 'opacity', 'stroke-width'):
        if el.get(k) is not None:
            st[k] = el.get(k)
    return st


def elements(svg_path):
    """Yield (tag, attrs, style) for every drawable element of a master."""
    root = ET.parse(svg_path).getroot()
    base = _style(root, {'fill': 'black', 'stroke': 'none', 'opacity': '1', 'stroke-width': '1'})

    def walk(node, st):
        for el in node:
            tag = el.tag.replace(NS, '')
            s = _style(el, st)
            if tag == 'g':
                yield from walk(el, s)
            elif tag in ('path', 'circle', 'rect'):
                yield tag, el.attrib, s
    yield from walk(root, base)


def to_icon(svg_path):
    lines = ['CANVAS_DIMENSIONS, 32,']
    first = True
    for tag, at, st in elements(svg_path):
        stroked = st['stroke'] not in ('none', None)
        filled = st['fill'] not in ('none', None)
        # An element both filled and stroked becomes two paths: fill, then stroke.
        for paint in (['fill'] if filled else []) + (['stroke'] if stroked else []):
            if not first:
                lines.append('NEW_PATH,')
            first = False
            if paint == 'stroke':
                lines.append(f'STROKE, {fmt(float(st["stroke-width"]))}f,')
            else:
                lines.append('FILL_RULE_NONZERO,')
            if float(st['opacity']) < 0.99:
                lines.append(f'PATH_COLOR_ALPHA, {ALPHA_FAINT},')
            lines.extend(shape(tag, at))
    body = '\n'.join(lines)
    return ('// Copyright 2026 Swarm. SWARM UI icon, generated by swarm/brand/icons_ui.py\n'
            f'// from swarm/brand/icons-ui/{svg_path.name}. Do not edit by hand.\n\n' + body.rstrip(',') + '\n')


def shape(tag, at):
    """The drawing commands of one element."""
    if tag == 'circle':
        return [f'CIRCLE, {fmt(float(at["cx"]))}, {fmt(float(at["cy"]))}, {fmt(float(at["r"]))},']
    if tag == 'rect':
        r = float(at.get('rx', 0))
        return [f'ROUND_RECT, {fmt(float(at["x"]))}, {fmt(float(at["y"]))}, '
                f'{fmt(float(at["width"]))}, {fmt(float(at["height"]))}, {fmt(r)},']
    return [name + (', ' + ', '.join(fmt(a) for a in args) if args else '') + ','
            for name, args in path_commands(at['d'])]



def settings_iconset_g(master, gid):
    """The <g id=gid> element for a cr-iconset, in the master's own drawing."""
    root = ET.parse(MASTERS / f'{master}.svg').getroot()
    inner = ''.join(ET.tostring(el, encoding='unicode').replace(' xmlns:ns0="http://www.w3.org/2000/svg"', '')
                    .replace('ns0:', '').replace(' xmlns="http://www.w3.org/2000/svg"', '') for el in root)
    return (f'<g id="{gid}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" '
            f'stroke-linecap="round" stroke-linejoin="round">{inner}</g>')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    count = 0
    for master, targets in TARGETS.items():
        text = to_icon(MASTERS / f'{master}.svg')
        for rel in targets:
            out = TREE / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text, encoding='utf-8', newline='\n')
            count += 1
    for src, rel in ILLUSTRATIONS.items():
        out = TREE / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes((MASTERS / src).read_bytes())
        count += 1
    for master in SETTINGS_ICONS:
        settings_iconset_g(master, SETTINGS_ICONS[master])
    print(f'wrote {count} .icon files from {len(TARGETS)} masters; {len(SETTINGS_ICONS)} Settings icons ready')
    if a.check:
        for master in TARGETS:
            path_commands  # parse succeeded above
        print('ok')
    return 0


if __name__ == '__main__':
    sys.exit(main())
