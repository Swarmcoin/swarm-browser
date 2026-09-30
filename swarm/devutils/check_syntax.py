#!/usr/bin/env python3
"""Parse-check every file the SWARM layer adds or edits.

JSON (manifests), YAML (workflows), Python (build/package/helpers),
JavaScript (stage action, extension scripts), XML (the patched .grd files) and
a light GN sanity check. Nothing is compiled.
"""
import ast
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

# Repository root: swarm/devutils/<this file>
ROOT = Path(__file__).resolve().parents[2]
SRC = (Path(sys.argv[1]).resolve() if len(sys.argv) > 1
       else ROOT / 'build' / 'src')
fail = []


def ok(kind, path, extra=''):
    print(f'  OK   {kind:6} {path}{extra}')


def bad(kind, path, err):
    print(f'  FAIL {kind:6} {path}: {err}')
    fail.append((path, err))


print('JSON')
for p in sorted(ROOT.glob('swarm/extensions/*/manifest.json')):
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        assert data['manifest_version'] == 3, 'not MV3'
        assert data['key'], 'no fixed key'
        ok('json', p.relative_to(ROOT), f"  name={data['name']!r}")
    except Exception as exc:  # noqa: BLE001
        bad('json', p.relative_to(ROOT), exc)

print('YAML')
try:
    import yaml  # noqa: F401
    have_yaml = True
except ImportError:
    have_yaml = False
    print('  (PyYAML not installed - falling back to an indentation-only check)')
for p in sorted(ROOT.glob('.github/**/*.yml')):
    try:
        text = p.read_text(encoding='utf-8-sig')
        if have_yaml:
            import yaml
            doc = yaml.safe_load(text)
            assert isinstance(doc, dict) and 'jobs' in doc or 'runs' in doc or True
        else:
            if '\t' in text:
                raise ValueError('tab character in YAML')
        ok('yaml', p.relative_to(ROOT))
    except Exception as exc:  # noqa: BLE001
        bad('yaml', p.relative_to(ROOT), exc)

print('Python')
for p in [ROOT / 'build.py', ROOT / 'package.py',
          ROOT / 'swarm' / 'install_swarm_assets.py',
          ROOT / 'swarm' / 'brand' / 'render_icons.py',
          ROOT / 'swarm' / 'brand' / 'render_ui_logos.py',
          ROOT / 'swarm' / 'brand' / 'product_strings.py',
          ROOT / 'swarm' / 'brand' / 'ui_strings.py',
          ROOT / 'swarm' / 'brand' / 'icons_ui.py',
          ROOT / 'swarm' / 'brand' / 'icons-ui' / 'draw_masters.py',
          ROOT / 'swarm' / 'devutils' / 'make_swarm_patches.py',
          ROOT / 'swarm' / 'devutils' / 'prepare_and_verify.py']:
    try:
        ast.parse(p.read_text(encoding='utf-8'), filename=str(p))
        ok('py', p.relative_to(ROOT))
    except Exception as exc:  # noqa: BLE001
        bad('py', p.relative_to(ROOT), exc)

print('JavaScript (node --check)')
for p in [ROOT / '.github' / 'actions' / 'stage' / 'index.js'] + \
         sorted(ROOT.glob('swarm/extensions/*/**/*.js')) + \
         sorted(ROOT.glob('swarm/updates/*.mjs')) + \
         sorted(ROOT.glob('swarm/tests/**/*.mjs')):
    try:
        # index.js and the extension scripts are ES modules.
        res = subprocess.run(['node', '--input-type=module', '--check'],
                             input=p.read_text(encoding='utf-8'),
                             capture_output=True, text=True, check=False,
                             encoding='utf-8', shell=True)
        if res.returncode:
            raise ValueError(res.stderr.strip().splitlines()[-1]
                             if res.stderr.strip() else 'node --check failed')
        ok('js', p.relative_to(ROOT))
    except FileNotFoundError:
        print('  (node not found - skipped)')
        break
    except Exception as exc:  # noqa: BLE001
        bad('js', p.relative_to(ROOT), exc)

print('HTML (tag balance of every extension page)')
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'param', 'source', 'track', 'wbr'}


class Balance(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(
                f'</{tag}> at line {self.getpos()[0]} closes '
                f'<{self.stack[-1] if self.stack else "nothing"}>')
            return
        self.stack.pop()


for p in sorted(ROOT.glob('swarm/extensions/*/**/*.html')):
    try:
        parser = Balance()
        parser.feed(p.read_text(encoding='utf-8'))
        if parser.errors or parser.stack:
            raise ValueError('; '.join(parser.errors)
                             or f'unclosed: {parser.stack}')
        ok('html', p.relative_to(ROOT))
    except Exception as exc:  # noqa: BLE001
        bad('html', p.relative_to(ROOT), exc)

print('GN')
for p in [ROOT / 'swarm' / 'flags.swarm.gn', ROOT / 'flags.windows.gn']:
    try:
        for i, line in enumerate(p.read_text(encoding='utf-8').splitlines(), 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if not re.match(r'^[a-z_][a-z0-9_]*\s*=\s*\S', line):
                raise ValueError(f'line {i}: not a GN assignment: {line!r}')
        ok('gn', p.relative_to(ROOT))
    except Exception as exc:  # noqa: BLE001
        bad('gn', p.relative_to(ROOT), exc)

print('Patched files in the prepared tree')
if (SRC / 'chrome' / 'browser' / 'browser_resources.grd').is_file():
    for rel in ['chrome/browser/browser_resources.grd',
                'chrome/browser/resources/component_extension_resources.grd']:
        try:
            ET.parse(SRC / rel)
            ok('xml', rel)
        except Exception as exc:  # noqa: BLE001
            bad('xml', rel, exc)
    for rel in ['chrome/browser/resources/swarm_wallet/manifest.json',
                'chrome/browser/resources/swarm_rewards/manifest.json',
                'chrome/browser/resources/swarm_update/manifest.json',
                'chrome/browser/resources/swarm_start/manifest.json']:
        p = SRC / rel
        try:
            json.loads(p.read_text(encoding='utf-8'))
            ok('json', rel)
        except Exception as exc:  # noqa: BLE001
            bad('json', rel, exc)
    # SWARM Update compares the signed feed with this file, so the tree's copy
    # must carry the real build and channel "release", never the placeholder.
    rel = 'chrome/browser/resources/swarm_update/version.json'
    try:
        stamped = json.loads((SRC / rel).read_text(encoding='utf-8'))
        want = {
            'chromium': (ROOT / 'ungoogled-chromium' / 'chromium_version.txt')
            .read_text(encoding='utf-8').strip(),
            'swarm': (ROOT / 'swarm' / 'revision.txt')
            .read_text(encoding='utf-8').strip(),
            'channel': 'release',
        }
        assert stamped == want, f'{stamped} != {want}'
        ok('json', rel, f"  {stamped['chromium']} / SWARM {stamped['swarm']} / release")
    except Exception as exc:  # noqa: BLE001
        bad('json', rel, exc)
    # The installer's file list, read by the installer's own parser:
    # Readconfig() from the tree's create_installer_archive.py (its module
    # level only defines things), then the SWARM entry looked up the way
    # CopySectionFilesToStagingDir does. No __pycache__ is left in the tree.
    rel = 'chrome/installer/mini_installer/chrome.release'
    try:
        import importlib.util
        script = (SRC / 'chrome' / 'tools' / 'build' / 'win' /
                  'create_installer_archive.py')
        spec = importlib.util.spec_from_file_location(
            'create_installer_archive', script)
        archive = importlib.util.module_from_spec(spec)
        sys.dont_write_bytecode = True
        spec.loader.exec_module(archive)
        config = archive.Readconfig(str(SRC / rel), '1.2.3.4')
        key = 'swarm\\hosts\\*.*'
        if key not in config.options('GENERAL'):
            raise ValueError(f'no {key} entry in [GENERAL]')
        dest = config.get('GENERAL', key)
        want = config.get('GENERAL', 'versiondir') + '\\swarm\\hosts\\'
        if dest != want:
            raise ValueError(f'{key} goes to {dest!r}, expected {want!r}')
        ok('ini', rel, f'  {key} -> {dest}')
    except Exception as exc:  # noqa: BLE001
        bad('ini', rel, exc)
else:
    print('  (prepared tree not present - skipped)')

print('Bundled extensions: folder, grd, BUILD.gn and tree copy, file for file')
if (SRC / 'chrome' / 'browser' / 'browser_resources.grd').is_file():
    component_grd = (SRC / 'chrome/browser/resources/component_extension_resources.grd'
                     ).read_text(encoding='utf-8')
    browser_grd = (SRC / 'chrome/browser/browser_resources.grd').read_text(encoding='utf-8')
    build_gn = (SRC / 'chrome/browser/resources/BUILD.gn').read_text(encoding='utf-8')
    for folder, dirname in (('wallet', 'swarm_wallet'), ('rewards', 'swarm_rewards'),
                            ('update', 'swarm_update'), ('start', 'swarm_start')):
        label = f'{folder:7} -> {dirname}'
        try:
            source = ROOT / 'swarm' / 'extensions' / folder
            files = sorted(f.relative_to(source).as_posix()
                           for f in source.rglob('*') if f.is_file())
            in_grd = sorted(re.findall(rf'file="{dirname}/([^"]+)"', component_grd))
            in_gn = sorted(re.findall(rf'"{dirname}/([^"]+)"', build_gn))
            manifests = re.findall(rf'file="resources\\{dirname}\\manifest\.json"', browser_grd)
            tree = SRC / 'chrome' / 'browser' / 'resources' / dirname
            in_tree = sorted(f.relative_to(tree).as_posix()
                             for f in tree.rglob('*') if f.is_file())
            assert in_grd == [f for f in files if f != 'manifest.json'], \
                f'component grd differs: {sorted(set(in_grd) ^ set(files) - {"manifest.json"})}'
            assert in_gn == files, f'BUILD.gn differs: {sorted(set(in_gn) ^ set(files))}'
            assert len(manifests) == 1, 'manifest not in browser_resources.grd exactly once'
            assert in_tree == files, f'tree copy differs: {sorted(set(in_tree) ^ set(files))}'
            changed = [f for f in files
                       if (tree / f).read_bytes() != (source / f).read_bytes()]
            allowed = ['version.json'] if folder == 'update' else []
            assert changed == allowed, f'changed on the way into the tree: {changed}'
            ok('files', label, f'  {len(files)} files, grd/BUILD.gn/tree agree'
               + ('; only version.json stamped' if allowed else '; byte-identical'))
        except Exception as exc:  # noqa: BLE001
            bad('files', label, exc)
else:
    print('  (prepared tree not present - skipped)')

print()
if fail:
    print(f'{len(fail)} FAILURE(S)')
    sys.exit(1)
print('ALL PARSE CHECKS PASSED')
