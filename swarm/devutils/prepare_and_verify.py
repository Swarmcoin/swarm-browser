#!/usr/bin/env python3
"""Clean-room proof that all three patch series apply to a fresh tree.

Reproduces what build.py --tarball does up to (and including) the SWARM layer,
from an empty build/src, and records every line of patch output:

  unpack tarball -> unpack patched Windows downloads -> prune -> ungoogled
  series -> windows series -> SWARM series -> install SWARM assets

apply_patches() runs GNU patch with check=True, and GNU patch exits non-zero if
ANY hunk fails, so reaching the end is proof every hunk of every patch applied.
Nothing is compiled.
"""
import shutil
import sys
from pathlib import Path

# Repository root: swarm/devutils/<this file>
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'ungoogled-chromium' / 'utils'))
import downloads  # noqa: E402
import prune_binaries  # noqa: E402
import patches  # noqa: E402
from _common import ENCODING, ExtractorEnum, get_logger  # noqa: E402

import logging
import subprocess
logging.basicConfig(level=logging.INFO)

SRC = ROOT / 'build' / 'src'
CACHE = ROOT / 'build' / 'download_cache'
PATCH_BIN = Path('C:/Program Files/Git/usr/bin/patch.exe')
SEVENZIP = 'C:/Program Files/7-Zip/7z.exe'
EXTRACTORS = {ExtractorEnum.SEVENZIP: SEVENZIP, ExtractorEnum.WINRAR: ''}

# Only the Windows downloads a patch in patches/series actually touches. The
# rest are multi-GB build toolchains (LLVM, Rust, Go, Node) that no patch
# modifies, so they are not needed to prove the series applies.
PATCHED_WIN_DOWNLOADS = {'typescript'}


def step(msg):
    print(f'\n=========== {msg} ===========', flush=True)


step('wipe build/src')
if SRC.exists():
    shutil.rmtree(SRC)
SRC.mkdir(parents=True)

step('unpack chromium tarball (7-Zip)')
info = downloads.DownloadInfo([ROOT / 'ungoogled-chromium' / 'downloads.ini'])
downloads.retrieve_downloads(info, CACHE, None, True, False)
downloads.check_downloads(info, CACHE, None)
downloads.unpack_downloads(info, CACHE, None, SRC, EXTRACTORS)

step('unpack patched Windows downloads')
win = downloads.DownloadInfo([ROOT / 'downloads.ini'])
for name in [n for n, _ in win.properties_iter()]:
    if name not in PATCHED_WIN_DOWNLOADS:
        del win._data[name]  # noqa: SLF001
downloads.retrieve_downloads(win, CACHE, None, True, False)
downloads.check_downloads(win, CACHE, None)
downloads.unpack_downloads(win, CACHE, None, SRC, EXTRACTORS)

step('prune binaries')
pruning_list = ROOT / 'ungoogled-chromium' / 'pruning.list'
unremovable = prune_binaries.prune_files(
    SRC, pruning_list.read_text(encoding=ENCODING).splitlines())
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
