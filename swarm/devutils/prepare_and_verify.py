#!/usr/bin/env python3
"""Clean-room proof, second run: fresh tree, all three series, nothing renamed.

The first clean-room run was interrupted by Windows Defender holding a handle
on the freshly written chrome/ directory while ungoogled's extractor tried to
rename it up one level. That rename exists only to strip the tarball's leading
chromium-<version>/ directory, and nothing needs it: every patch is applied
with -d <tree>. So this run drives 7-Zip directly and treats the extracted
chromium-<version>/ directory as the tree.

Steps: verify the cached tarball -> extract -> unpack the one patched Windows
download -> prune -> ungoogled series -> windows series -> SWARM series ->
install SWARM assets. Nothing is compiled.
"""
import shutil
import subprocess
import sys
from pathlib import Path

# Repository root: swarm/devutils/<this file>
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'ungoogled-chromium' / 'utils'))
import downloads  # noqa: E402
import prune_binaries  # noqa: E402
import patches  # noqa: E402
from _common import ENCODING, ExtractorEnum, get_logger  # noqa: E402

import logging  # noqa: E402
logging.basicConfig(level=logging.INFO)

CACHE = ROOT / 'build' / 'download_cache'
OUT = ROOT / 'build' / 'verify'
VERSION = (ROOT / 'ungoogled-chromium' / 'chromium_version.txt').read_text(
    encoding=ENCODING).strip()
SRC = OUT / f'chromium-{VERSION}'
PATCH_BIN = Path('C:/Program Files/Git/usr/bin/patch.exe')
SEVENZIP = 'C:/Program Files/7-Zip/7z.exe'
EXTRACTORS = {ExtractorEnum.SEVENZIP: SEVENZIP, ExtractorEnum.WINRAR: ''}


def step(msg):
    print(chr(10) + '=========== ' + msg + ' ===========', flush=True)


step(f'fresh output directory {OUT}')
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)

step('verify the cached chromium tarball')
info = downloads.DownloadInfo([ROOT / 'ungoogled-chromium' / 'downloads.ini'])
downloads.retrieve_downloads(info, CACHE, None, True, False)
downloads.check_downloads(info, CACHE, None)
tarball = next(CACHE.glob('chromium-*.tar.xz'))
print(f'  {tarball}', flush=True)

step('extract with 7-Zip (no rename step)')
one = subprocess.Popen([SEVENZIP, 'x', str(tarball), '-so'],
                       stdout=subprocess.PIPE)
two = subprocess.Popen([SEVENZIP, 'x', '-si', '-ttar', f'-o{OUT}', '-y'],
                       stdin=one.stdout, stdout=subprocess.DEVNULL)
one.stdout.close()
if two.wait() or one.wait():
    raise SystemExit('7-Zip extraction failed')
if not SRC.is_dir():
    raise SystemExit(f'expected {SRC} after extraction')
print(f'  tree at {SRC}', flush=True)

step('unpack the one patched Windows download a patch touches')
win = downloads.DownloadInfo([ROOT / 'downloads.ini'])
for name in [n for n, _ in win.properties_iter()]:
    if name != 'typescript':
        del win._data[name]  # noqa: SLF001
downloads.retrieve_downloads(win, CACHE, None, True, False)
downloads.check_downloads(win, CACHE, None)
downloads.unpack_downloads(win, CACHE, None, SRC, EXTRACTORS)

step('prune binaries')
unremovable = prune_binaries.prune_files(
    SRC, (ROOT / 'ungoogled-chromium' / 'pruning.list').read_text(
        encoding=ENCODING).splitlines())
if unremovable:
    get_logger().error('Files could not be pruned: %s', unremovable)
    sys.exit(1)

for label, patches_dir in (
        ('ungoogled-chromium series', ROOT / 'ungoogled-chromium' / 'patches'),
        ('windows series', ROOT / 'patches'),
        ('SWARM series', ROOT / 'swarm' / 'patches')):
    step(f'apply {label}')
    patches.apply_patches(
        patches.generate_patches_from_series(patches_dir, resolve=True),
        SRC, patch_bin_path=PATCH_BIN)

step('install SWARM assets')
subprocess.run([sys.executable, str(ROOT / 'swarm' / 'install_swarm_assets.py'),
                '--source-tree', str(SRC)], check=True)

step('ALL SERIES APPLIED CLEANLY')
print(f'tree: {SRC}', flush=True)
