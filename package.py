#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Copyright (c) 2018 The ungoogled-chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.
"""
ungoogled-chromium packaging script for Microsoft Windows
"""

import sys
if sys.version_info.major < 3:
    raise RuntimeError('Python 3 is required for this script.')

import argparse
import itertools
import os
import platform
from pathlib import Path
import shutil

sys.path.insert(0, str(Path(__file__).resolve().parent / 'ungoogled-chromium' / 'utils'))
import filescfg
from _common import ENCODING, get_chromium_version
sys.path.pop(0)

# SWARM: the bundled native messaging host (swarm/hosts/) is installed into the
# build output and then packaged, so the browser ships with the wallet host and
# needs no separate install step.
sys.path.insert(0, str(Path(__file__).resolve().parent / 'swarm'))
from install_swarm_assets import install_bundled_host
sys.path.pop(0)

def _get_release_revision():
    revision_path = Path(__file__).resolve().parent / 'ungoogled-chromium' / 'revision.txt'
    return revision_path.read_text(encoding=ENCODING).strip()

def _get_packaging_revision():
    revision_path = Path(__file__).resolve().parent / 'revision.txt'
    return revision_path.read_text(encoding=ENCODING).strip()

# SWARM: the SWARM layer's own build number, bumped when the SWARM layer
# changes without a Chromium version change. The upstream provenance
# (ungoogled-chromium revision + Windows packaging revision) is recorded in
# swarm/README.md and the release notes rather than in the file name.
def _get_swarm_revision():
    revision_path = Path(__file__).resolve().parent / 'swarm' / 'revision.txt'
    return revision_path.read_text(encoding=ENCODING).strip()

_cached_target_cpu = None

def _get_target_cpu(build_outputs):
    global _cached_target_cpu
    if not _cached_target_cpu:
        with open(build_outputs / 'args.gn', 'r') as f:
            args_gn_text = f.read()
            for cpu in ('x64', 'x86', 'arm64'):
                if f'target_cpu="{cpu}"' in args_gn_text:
                    _cached_target_cpu = cpu
                    break
    assert _cached_target_cpu
    return _cached_target_cpu

def main():
    """Entrypoint"""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--cpu-arch',
        metavar='ARCH',
        default=platform.architecture()[0],
        choices=('64bit', '32bit', 'arm'),
        help=('Filter build outputs by a target CPU. '
              'This is the same as the "arch" key in FILES.cfg. '
              'Default (from platform.architecture()): %(default)s'))
    args = parser.parse_args()

    build_outputs = Path('build/src/out/Default')

    # SWARM: put swarm/hosts/{green.swarm.wallet_host.json,
    # swarm-wallet-host.exe, native.node} next to chrome.exe in the build
    # output, before anything is packaged. Skipped with a message when the host
    # has not been built. build.py already did this before ninja, because the
    # mini_installer packs what chrome/installer/mini_installer/chrome.release
    # lists at ninja time; here it leaves up-to-date files alone, covers a tree
    # built before that hook existed, and returns the paths for the zip below.
    host_files = install_bundled_host(build_outputs)

    # SWARM: installer named SWARM-Browser-<chromium version>-<swarm build>-win-<arch>.exe
    shutil.copyfile('build/src/out/Default/mini_installer.exe',
        'build/SWARM-Browser-{}-{}-win-{}.exe'.format(
            get_chromium_version(), _get_swarm_revision(),
            _get_target_cpu(build_outputs)))

    timestamp = None
    try:
        with open('build/src/build/util/LASTCHANGE.committime', 'r') as ct:
            timestamp = int(ct.read())
    except FileNotFoundError:
        pass

    # SWARM: portable zip named SWARM-Browser-<chromium version>-<swarm build>-win-<arch>.zip
    output = Path('build/SWARM-Browser-{}-{}-win-{}.zip'.format(
        get_chromium_version(), _get_swarm_revision(),
        _get_target_cpu(build_outputs)))

    excluded_files = set([
        Path('mini_installer.exe'),
        Path('mini_installer_exe_version.rc'),
        Path('setup.exe'),
        Path('chrome.packed.7z'),
    ])
    files_generator = filescfg.filescfg_generator(
        Path('build/src/chrome/tools/build/win/FILES.cfg'),
        build_outputs, args.cpu_arch, excluded_files)
    # SWARM: FILES.cfg is upstream's and knows nothing about swarm/hosts, so
    # the host files are appended to the same iterator of build-output-relative
    # paths rather than by editing a Chromium file.
    filescfg.create_archive(
        itertools.chain(files_generator, host_files),
        tuple(), build_outputs, output, timestamp)

if __name__ == '__main__':
    main()
