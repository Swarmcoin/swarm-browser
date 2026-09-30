#!/usr/bin/env python3
# Copyright 2026 Swarm.
"""SWARM names in the rest of the browser's UI strings (build 5, "G2").

product_strings.py renames the product in chrome/app/chromium_strings.grd.
The owner's 2026-09-30 look at chrome://settings showed what that leaves:
"You and Google" as the first section, "Google services", "Chrome Panels",
"Chromium is made possible by ..." on the About page, "Official Build,
ungoogled-chromium" on the version line. Those live in the other string
bundles. This file applies three kinds of rule, at asset-install time like
product_strings.py (no hunk to rebase, message names and the generated IDS_*
headers never change, translations fall back to English for changed text):

1. EXPLICIT: a handful of messages set by name, where the meaning changes and
   a word swap would be wrong ("You and Google" is a page about the browser
   profile here, not about Google).
2. CHROMIUM: whole-word "Chromium" -> "SWARM Browser" in every message text
   of the Windows string bundles, except where Chromium is named as the
   upstream project in a true statement ("Chromium Authors", "Based on
   Chromium", "the Chromium open source project", the link text of that
   project, ChromiumOS / Chromium OS).
3. CHROME: the word "Chrome" where it means the browser ("Chrome is ...",
   "Customize Chrome", "Chrome's") -> "SWARM Browser". Never when it is part
   of the name of something else: Chrome Web Store, ChromeOS / Chrome OS,
   Chromebook, Chrome Enterprise, Chrome Remote Desktop, Chrome Sync,
   Chrome for Testing, Chrome Root Store, Chrome browser cloud management,
   Google Chrome (the other product), or a chrome:// address.

"Google" is NOT replaced by a rule. Where it remains it names Google or one
of its products as a third party (Google Translate, Google Wallet, "Captions
are sent to Google for translation"), mostly in features ungoogled-chromium
already disables. The report lists every file and count, and the remaining
uses, so each one is a decision on paper.

Only lines carrying message text change; `<message ... desc="...">` lines,
comments and translator notes are left alone.

    python swarm/brand/ui_strings.py --source-tree build/src [--dry-run] [--report FILE]
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

PRODUCT = 'SWARM Browser'

# The Windows string bundles, each with its <part file> includes.
BUNDLES = (
    'chrome/app/generated_resources.grd',
    'chrome/app/chromium_strings.grd',
    'components/components_strings.grd',
    'components/components_chromium_strings.grd',
    'ui/strings/ui_strings.grd',
    'ui/strings/app_locale_settings.grd',
)
# Parts that are never built into the Windows browser (ChromeOS, Android) or
# whose text is matched, not shown (omnibox pedal synonyms).
SKIP_PARTS = re.compile(r'(^|/)(os_settings|chromeos|android|ash|omnibox_pedal|nearby|'
                        r'os_settings_search_tag|glic)[^/]*\.grdp$')

# 1. Messages set by name: (file relative to the tree, message name, text).
EXPLICIT = (
    ('chrome/app/settings_strings.grdp', 'IDS_SETTINGS_PEOPLE', 'You and your browser'),
    ('chrome/app/settings_strings.grdp', 'IDS_SETTINGS_GOOGLE_SERVICES_PAGE_TITLE', 'Other services'),
    ('components/version_ui_strings.grdp', 'IDS_VERSION_UI_OFFICIAL', 'Official Build'),
    ('components/version_ui_strings.grdp', 'IDS_VERSION_UI_UNOFFICIAL', 'Developer Build'),
    ('chrome/app/settings_strings.grdp', 'IDS_SETTINGS_SIDE_PANEL_ALIGNMENT_CHROME_PANELS', 'Browser panels'),
)

# 2. Chromium: phrases that name the upstream project truthfully stay.
CHROMIUM_WORD = re.compile(r'\bChromium\b(?!OS| OS)')
CHROMIUM_KEEP = (
    'Chromium Authors',
    'Based on Chromium',
    'Chromium open source project',
    '</ph>Chromium<ph name="END_LINK_CHROMIUM">',
    'Chromium project',
    'Chromium developers',
)

# 3. Chrome as the browser. The negative lookaheads/lookbehinds are the
# other things named "Chrome".
CHROME_WORD = re.compile(
    r'(?<!Google )(?<![/\w.-])Chrome(?!OS|book|box|Vox|cast|\w)'
    r'(?! (?:Web Store|OS|Enterprise|Remote Desktop|Sync|for Testing|Root Store|'
    r'browser cloud management|Browser Cloud Management|Education|Beta|Dev|Canary|'
    r'DevTools|Custom Tabs|Frame|Apps? Shelf|[Aa]pps?\b))'
    r'(?!://)')
# A sentence about a Google service (sign-in, sync, Gmail, Safe Browsing ...)
# describes Google's feature, which ungoogled-chromium removes or disables:
# its "Chrome" is left as it is rather than turned into a claim about SWARM.
CHROME_SKIP_LINE = re.compile(r'Google|Gmail|Safe Browsing|\bsign(?:ed)?[ -]in\b|\bsync', re.I)


def _skip_line(line):
    if 'desc="' in line or '<message ' in line or '<!--' in line or '-->' in line:
        return True
    stripped = line.strip()
    return stripped.startswith('<') and not stripped.startswith('<ph')


def _mask(line, phrases):
    masks = {}
    for i, phrase in enumerate(phrases):
        if phrase in line:
            token = f'\x00{i}\x00'
            masks[token] = phrase
            line = line.replace(phrase, token)
    return line, masks


def _unmask(line, masks):
    for token, phrase in masks.items():
        line = line.replace(token, phrase)
    return line


def rewrite_line(line):
    """-> (new line, Counter of replacements by kind)."""
    counts = Counter()
    if _skip_line(line):
        return line, counts
    masked, masks = _mask(line, CHROMIUM_KEEP)
    masked, n = CHROMIUM_WORD.subn(PRODUCT, masked)
    if n:
        counts['Chromium'] += n
    if not CHROME_SKIP_LINE.search(masked):
        masked, n = CHROME_WORD.subn(PRODUCT, masked)
        if n:
            counts['Chrome'] += n
    return _unmask(masked, masks), counts


def set_message(text, name, new_text):
    """Set the text of every <message name="name"> block whose text is one line."""
    pattern = re.compile(r'(<message\b[^>]*\bname="%s"[^>]*>\s*\n)([ \t]*)([^\n<]*)(\n\s*</message>)'
                         % re.escape(name))
    found = pattern.findall(text)
    if not found:
        raise SystemExit(f'message {name} not found (or not one line) -- upstream changed')
    return pattern.sub(lambda m: m.group(1) + m.group(2) + new_text + m.group(4), text), len(found)


def bundle_files(tree, grd_rel):
    grd = tree / grd_rel
    if not grd.is_file():
        raise SystemExit(f'{grd_rel} not found')
    files = [grd]
    for part in re.findall(r'<part file="([^"]+)"', grd.read_text(encoding='utf-8')):
        p = (grd.parent / part).resolve()
        rel = p.relative_to(tree.resolve()).as_posix()
        if SKIP_PARTS.search(rel):
            continue
        files.append(p)
    return files


WORDS = re.compile(r'\b(Chromium|Chrome|Google|ungoogled)\b', re.I)
MSG = re.compile(r'<message\b[^>]*name="([^"]+)"[^>]*>(.*?)</message>', re.S)


def remaining(text):
    """Visible words left, by message: {name: [words]} (placeholders removed)."""
    out = {}
    for m in MSG.finditer(text):
        body = re.sub(r'<ph\b.*?</ph>', '', m.group(2), flags=re.S)
        words = WORDS.findall(body)
        if words:
            out[m.group(1)] = sorted(set(w for w in words))
    return out


def rewrite(tree, dry_run=False):
    tree = Path(tree)
    report = {'files': {}, 'explicit': [], 'totals': Counter(), 'remaining': {}}
    seen = set()
    for grd_rel in BUNDLES:
        for path in bundle_files(tree, grd_rel):
            if path in seen:
                continue
            seen.add(path)
            rel = path.resolve().relative_to(tree.resolve()).as_posix()
            text = path.read_text(encoding='utf-8')
            new = text
            for f, name, value in EXPLICIT:
                if f == rel:
                    new, n = set_message(new, name, value)
                    report['explicit'].append({'file': rel, 'message': name, 'text': value, 'blocks': n})
            counts = Counter()
            lines = []
            for line in new.splitlines(keepends=True):
                line, c = rewrite_line(line)
                counts.update(c)
                lines.append(line)
            new = ''.join(lines)
            if counts:
                report['files'][rel] = dict(counts)
                report['totals'].update(counts)
            left = remaining(new)
            if left:
                report['remaining'][rel] = left
            if new != text and not dry_run:
                path.write_text(new, encoding='utf-8', newline='\n')
    report['totals'] = dict(report['totals'])
    return report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--source-tree', type=Path, required=True)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--report', type=Path, help='write the full report as JSON')
    a = ap.parse_args()
    report = rewrite(a.source_tree, a.dry_run)
    for rel, c in sorted(report['files'].items()):
        print(f'  ui strings: {rel}: ' + ', '.join(f'{v} x {k}' for k, v in sorted(c.items())))
    print(f'  ui strings: {len(report["explicit"])} messages set by name; totals {report["totals"]}')
    if a.report:
        a.report.write_text(json.dumps(report, indent=1, sort_keys=True), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
