#!/usr/bin/env python3
"""Give the browser's UI strings the SWARM product name.

`chrome/app/theme/chromium/BRANDING` (swarm-branding.patch) renames the
installer, the app identity and the profile folder, but every sentence the
user reads -- "About Chromium", the window title "<page> - Chromium",
"Chromium is up to date" -- lives in `chrome/app/chromium_strings.grd`
(748 whole-word uses of "Chromium" in Chromium 153). A unified diff of that
many hunks would be brittle at every rebase, so the layer rewrites the file
at asset-install time instead, the way ungoogled-chromium's domain
substitution rewrites sources.

Rules, deliberately narrow:

* Only lines that carry message TEXT are touched. Lines holding a
  `<message ... desc="...">` declaration, XML comments, and the
  `<!-- ... -->` blocks stay as they are, so translator notes still say
  Chromium and the message names never change (the generated IDS_* header
  is byte-identical, which keeps ninja from recompiling the browser).
* The whole word "Chromium" becomes "SWARM Browser". "ChromiumOS" is one
  token and is left alone; "Chromium Authors" is protected, because the
  BSD notice must keep naming them.
* Two messages are set explicitly for the about pages (Chromium branch of
  the `<if expr="_is_chrome_for_testing_branded">` split): the company
  name becomes "Swarm" and the copyright line becomes the same notice the
  BRANDING file carries: "Copyright <year> Swarm. Based on Chromium,
  Copyright <year> The Chromium Authors. All rights reserved."
* The file declares `fallback_to_english="true"`, so the 81 translation
  files are not touched: a changed English message simply falls back to
  the English text in other locales.

Idempotent: a second run changes nothing. Usage:

    python swarm/brand/product_strings.py --source-tree build/src [--dry-run]
"""
import argparse
import re
import sys
from pathlib import Path

GRD_RELPATH = Path('chrome/app/chromium_strings.grd')
PRODUCT = 'SWARM Browser'
COMPANY = 'Swarm'
COPYRIGHT = ('Copyright <ph name="YEAR">{0,date,y}<ex>2016</ex></ph> Swarm. '
             'Based on Chromium, Copyright <ph name="YEAR2">{0,date,y}<ex>2016</ex></ph> '
             'The Chromium Authors. All rights reserved.')
PROTECTED = ('Chromium Authors', 'Based on Chromium')
WORD = re.compile(r'\bChromium\b')


def _skip_line(line):
    stripped = line.strip()
    if 'desc="' in line or '<message ' in line:
        return True
    if stripped.startswith('<!--') or stripped.endswith('-->') or '<!--' in line:
        return True
    return False


def _rewrite_word(line):
    if _skip_line(line):
        return line, 0
    # Protect phrases by masking them before the word replacement.
    masks = {}
    for i, phrase in enumerate(PROTECTED):
        token = f'\x00{i}\x00'
        if phrase in line:
            masks[token] = phrase
            line = line.replace(phrase, token)
    line, n = WORD.subn(PRODUCT, line)
    for token, phrase in masks.items():
        line = line.replace(token, phrase)
    return line, n


def _set_message_text(lines, name, new_text, occurrence):
    """Replace the text line of the `occurrence`-th <message name="..."> block.

    The grd keeps two copies of the about-page messages under an
    <if expr="_is_chrome_for_testing_branded"> split; the Chromium branch is
    the second one. Returns True when a change was made.
    """
    seen = 0
    for i, line in enumerate(lines):
        if f'name="{name}"' in line and '<message ' in line:
            seen += 1
            if seen == occurrence:
                j = i + 1
                if j < len(lines) and lines[j].strip() != new_text:
                    indent = lines[j][: len(lines[j]) - len(lines[j].lstrip())]
                    lines[j] = indent + new_text + '\n'
                    return True
                return False
    raise SystemExit(f'{name} occurrence {occurrence} not found')


def rewrite_strings(grd_path, dry_run=False):
    text = Path(grd_path).read_text(encoding='utf-8')
    if 'IDS_PRODUCT_NAME' not in text:
        raise SystemExit(f'{grd_path}: no IDS_PRODUCT_NAME; wrong file or a Chromium rename')
    lines = text.splitlines(keepends=True)
    explicit = 0
    explicit += _set_message_text(lines, 'IDS_ABOUT_VERSION_COMPANY_NAME', COMPANY, 2)
    explicit += _set_message_text(lines, 'IDS_ABOUT_VERSION_COPYRIGHT', COPYRIGHT, 2)
    replaced = 0
    out = []
    for line in lines:
        new, n = _rewrite_word(line)
        replaced += n
        out.append(new)
    result = ''.join(out)
    counts = {'word_replacements': replaced, 'explicit_messages': explicit,
              'remaining_word_chromium': len(WORD.findall(result))}
    if not dry_run and result != text:
        Path(grd_path).write_text(result, encoding='utf-8')
    return counts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--source-tree', type=Path, required=True)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    grd = a.source_tree / GRD_RELPATH
    counts = rewrite_strings(grd, a.dry_run)
    print(f'  strings: {grd.name}: {counts["word_replacements"]} x Chromium -> {PRODUCT}, '
          f'{counts["explicit_messages"]} about-page messages set, '
          f'{counts["remaining_word_chromium"]} protected/skipped uses kept'
          + (' (dry run)' if a.dry_run else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
