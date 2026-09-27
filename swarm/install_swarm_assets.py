#!/usr/bin/env python3
# Copyright 2026 Swarm.
"""Copy the SWARM binary assets and bundled extensions into a prepared tree.

Called by build.py right after swarm/patches has been applied. It exists
because a unified diff cannot carry binary files (icons) and because copying a
whole extension folder is far less brittle than a diff that adds every file.

It does three things:

1. Branding assets: every file under swarm/brand/icons is written over the
   matching file in chrome/app/theme/chromium. Each destination must already
   exist -- if Chromium renames or drops an icon, this fails loudly instead of
   silently leaving a Chromium icon in a SWARM build.

2. Bundled component extensions: swarm/extensions/wallet,
   swarm/extensions/rewards and swarm/extensions/update are copied to
   chrome/browser/resources/swarm_wallet, .../swarm_rewards and
   .../swarm_update, the paths that
   swarm/patches/swarm/swarm-component-extensions.patch registers in
   browser_resources.grd and component_extension_resources.grd.
   The one file changed on the way is swarm_update/version.json: the
   committed copy is the development placeholder
   {"chromium":"0.0.0.0","swarm":"0","channel":"dev"}, and the tree gets the
   real Chromium version (ungoogled-chromium/chromium_version.txt), the SWARM
   revision (swarm/revision.txt) and channel "release", which is what SWARM
   Update compares the signed update feed against.

3. Bundled native messaging host: the built swarm-wallet-host.exe, its wallet
   core and its manifest are copied into `swarm/hosts/` in the BUILD OUTPUT
   directory, not into the source tree -- they are shipped files, not sources.
   build.py does this before ninja, because the mini_installer target packs
   the files chrome.release lists at ninja time (swarm-installer-host.patch
   adds swarm/hosts there); package.py does it again for the portable zip.
   swarm/patches/swarm/swarm-native-host-lookup.patch makes Chromium look
   there -- next to chrome.dll, then next to chrome.exe -- when the registry
   has no entry for the host, so the browser needs no separate host install
   and writes nothing to HKCU.

    python swarm/install_swarm_assets.py --source-tree build/src [--dry-run]
    python swarm/install_swarm_assets.py --host-dest build/src/out/Default
"""
import argparse
import filecmp
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ICONS = HERE / 'brand' / 'icons'
EXTENSIONS = HERE / 'extensions'

THEME_RELDIR = Path('chrome/app/theme/chromium')
RESOURCES_RELDIR = Path('chrome/browser/resources')

# SWARM: where the single-file host is built. browser/host/sea/build-sea.js in
# the privacy-wallet-browser repository writes these three files; CI will build
# them into an artifact later. When the folder is absent the browser still
# packages -- it simply ships without a bundled wallet host.
DEFAULT_HOST_DIST = Path('D:/swarm-work/host-dist')
HOST_RELDIR = Path('swarm/hosts')
HOST_MANIFEST_NAME = 'green.swarm.wallet_host.json'
HOST_FILES = (HOST_MANIFEST_NAME, 'swarm-wallet-host.exe', 'native.node')

# Extension folder -> directory name under chrome/browser/resources. The
# directory name is also the root_directory ComponentLoader::Add() is given and
# the resource-path prefix in component_extension_resources.grd, so the three
# must be changed together.
BUNDLED_EXTENSIONS = {
    'wallet': 'swarm_wallet',
    'rewards': 'swarm_rewards',
    'update': 'swarm_update',
}

# SWARM: the update extension learns which build it is part of from its
# version.json, stamped here. Only this copy says channel "release"; the
# committed file says "dev", which is what lets a development copy be pointed
# at another feed address for testing and what a release build refuses.
UPDATE_FOLDER = 'update'
UPDATE_VERSION_FILE = 'version.json'
CHROMIUM_VERSION_FILE = HERE.parent / 'ungoogled-chromium' / 'chromium_version.txt'
SWARM_REVISION_FILE = HERE / 'revision.txt'
UPDATE_FEED_KEY_FILE = EXTENSIONS / 'update' / 'lib' / 'feed-key.js'
_VERSION_PART = r'(?:0|[1-9][0-9]{0,8})'


def release_version():
    """The running build as SWARM Update must see it in a release tree."""
    chromium = CHROMIUM_VERSION_FILE.read_text(encoding='utf-8').strip()
    swarm = SWARM_REVISION_FILE.read_text(encoding='utf-8').strip()
    if not re.fullmatch(rf'{_VERSION_PART}(?:\.{_VERSION_PART}){{3}}', chromium):
        raise SystemExit(f'{CHROMIUM_VERSION_FILE}: "{chromium}" is not a '
                         'four-part Chromium version')
    if not re.fullmatch(_VERSION_PART, swarm):
        raise SystemExit(f'{SWARM_REVISION_FILE}: "{swarm}" is not a plain '
                         'revision number')
    return {'chromium': chromium, 'swarm': swarm, 'channel': 'release'}


def stamp_update_version(extension_dir, dry_run=False):
    """Rewrite <extension_dir>/version.json for a release build."""
    version = release_version()
    target = Path(extension_dir) / UPDATE_VERSION_FILE
    if not target.is_file():
        raise SystemExit(f'{target} is missing -- SWARM Update cannot know '
                         'which build it is part of')
    print(f'  update: {UPDATE_VERSION_FILE} -> chromium {version["chromium"]}, '
          f'swarm {version["swarm"]}, channel release')
    if not dry_run:
        target.write_text(json.dumps(version, separators=(',', ':')) + '\n',
                          encoding='utf-8', newline='\n')
    return version


def warn_if_dev_feed_key():
    """Say so, on every build, while the update feed key is a test key."""
    labels = re.findall(r'label:\s*"([^"]+)"',
                        UPDATE_FEED_KEY_FILE.read_text(encoding='utf-8'))
    if not labels or any(label.startswith('dev') for label in labels):
        print('  WARNING: SWARM Update trusts a DEVELOPMENT feed key '
              f'({", ".join(labels) or "none"}). Before any public release the '
              'owner makes the production key (swarm/updates/README.md).')


def install_branding(source_tree, dry_run):
    theme = source_tree / THEME_RELDIR
    if not theme.is_dir():
        raise SystemExit(f'not a prepared Chromium tree: {theme} is missing')
    count = 0
    for src in sorted(ICONS.rglob('*')):
        if src.is_dir():
            continue
        dest = theme / src.relative_to(ICONS)
        if not dest.exists():
            raise SystemExit(
                f'upstream icon {dest} does not exist -- Chromium changed its '
                f'theme layout; re-check swarm/brand/render_icons.py')
        print(f'  branding: {dest.relative_to(source_tree)}')
        if not dry_run:
            shutil.copy2(src, dest)
        count += 1
    return count


def install_extensions(source_tree, dry_run):
    resources = source_tree / RESOURCES_RELDIR
    if not resources.is_dir():
        raise SystemExit(f'not a prepared Chromium tree: {resources} is missing')
    count = 0
    for folder, dirname in BUNDLED_EXTENSIONS.items():
        src = EXTENSIONS / folder
        if not (src / 'manifest.json').is_file():
            raise SystemExit(f'{src} has no manifest.json')
        dest = resources / dirname
        print(f'  extension: {dest.relative_to(source_tree)}')
        if not dry_run:
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(src, dest)
        if folder == UPDATE_FOLDER:
            stamp_update_version(src if dry_run else dest, dry_run)
            warn_if_dev_feed_key()
        count += 1
    return count


# SWARM: the bundled native messaging host.
def install_bundled_host(dest_root, host_dist=None, dry_run=False):
    """Copy the built wallet host into <dest_root>/swarm/hosts.

    Returns the list of paths written, relative to dest_root, so package.py can
    hand them straight to filescfg.create_archive. Returns [] -- with a plain
    message and no error -- when the host has not been built, because the
    browser is buildable and shippable without it.

    The manifest's `path` is rewritten to the bare exe name. Chromium resolves
    a relative host path against the manifest's own directory on Windows
    (launch_context.cc, `host_path = manifest_path.DirName().Append(host_path)`),
    which is what makes the folder relocatable -- the copy in build/, the copy
    in the zip and the copy under Program Files are all the same three files.

    Idempotent: build.py calls this before every ninja run and package.py
    again before packaging. A file that is already up to date is left alone,
    so a new timestamp alone never makes ninja pack the installer again
    (create_installer_archive.py lists the packed files in its depfile).
    """
    dist = Path(host_dist or DEFAULT_HOST_DIST)
    missing = [name for name in HOST_FILES if not (dist / name).is_file()]
    if missing:
        print(f'  host: not bundled -- {dist} has no {", ".join(missing)}.')
        print('        Build it with browser/host/sea/build-sea.js in the '
              'privacy-wallet-browser')
        print('        repository, or let CI build it. The browser packages '
              'without it.')
        return []

    dest = Path(dest_root) / HOST_RELDIR
    written = []
    for name in HOST_FILES:
        out = dest / name
        if name == HOST_MANIFEST_NAME:
            manifest = json.loads((dist / name).read_text(encoding='utf-8'))
            manifest['path'] = 'swarm-wallet-host.exe'
            text = json.dumps(manifest, indent=2) + '\n'
            current = out.is_file() and out.read_text(encoding='utf-8') == text
        else:
            current = out.is_file() and filecmp.cmp(dist / name, out,
                                                    shallow=True)
        print(f'  host: {HOST_RELDIR.as_posix()}/{name}'
              + (' (up to date)' if current else ''))
        if not dry_run and not current:
            dest.mkdir(parents=True, exist_ok=True)
            if name == HOST_MANIFEST_NAME:
                out.write_text(text, encoding='utf-8')
            else:
                shutil.copy2(dist / name, out)
        written.append(HOST_RELDIR / name)
    return written


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-tree', type=Path,
                        help='the prepared Chromium tree (build/src)')
    # SWARM: the host is a shipped file, so it goes to the build output.
    parser.add_argument('--host-dest', type=Path,
                        help='build output directory to receive swarm/hosts '
                             '(default: <source-tree>/out/Default)')
    parser.add_argument('--host-dist', type=Path,
                        help=f'where the built host is (default: {DEFAULT_HOST_DIST})')
    parser.add_argument('--dry-run', action='store_true',
                        help='report what would be copied and copy nothing')
    args = parser.parse_args()

    if args.source_tree:
        source_tree = args.source_tree.resolve()
        print(f'Installing SWARM assets into {source_tree}')
        icons = install_branding(source_tree, args.dry_run)
        exts = install_extensions(source_tree, args.dry_run)
        print(f'SWARM assets installed: {icons} icon files, {exts} extensions')
    elif not args.host_dest:
        raise SystemExit('give --source-tree, --host-dest, or both')

    # SWARM: the bundled host, into the build output.
    host_dest = args.host_dest
    if host_dest is None and args.source_tree:
        host_dest = args.source_tree / 'out' / 'Default'
    if host_dest is not None and Path(host_dest).is_dir():
        install_bundled_host(host_dest, args.host_dist, args.dry_run)
    elif host_dest is not None:
        print(f'  host: {host_dest} does not exist yet -- build.py installs '
              'the host there before ninja, package.py again before packaging.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
