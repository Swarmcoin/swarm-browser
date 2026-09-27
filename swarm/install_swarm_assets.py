#!/usr/bin/env python3
# Copyright 2026 Swarm.
"""Copy the SWARM binary assets and bundled extensions into a prepared tree.

Called by build.py right after swarm/patches has been applied. It exists
because a unified diff cannot carry binary files (icons) and because copying a
whole extension folder is far less brittle than a diff that adds every file.

It does two things:

1. Branding assets: every file under swarm/brand/icons is written over the
   matching file in chrome/app/theme/chromium. Each destination must already
   exist -- if Chromium renames or drops an icon, this fails loudly instead of
   silently leaving a Chromium icon in a SWARM build.

2. Bundled component extensions: swarm/extensions/wallet and
   swarm/extensions/rewards are copied to
   chrome/browser/resources/swarm_wallet and .../swarm_rewards, the paths that
   swarm/patches/swarm/swarm-component-extensions.patch registers in
   browser_resources.grd and component_extension_resources.grd.

3. Bundled native messaging host: the built swarm-wallet-host.exe, its wallet
   core and its manifest are copied into `swarm/hosts/` in the BUILD OUTPUT
   directory, not into the source tree -- they are shipped files, not sources.
   swarm/patches/swarm/swarm-native-host-lookup.patch makes Chromium look
   there when the registry has no entry for the host, so the packaged browser
   needs no installer and writes nothing to HKCU. package.py puts the same
   three files into the portable zip.

    python swarm/install_swarm_assets.py --source-tree build/src [--dry-run]
    python swarm/install_swarm_assets.py --host-dest build/src/out/Default
"""
import argparse
import json
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
}


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
        print(f'  host: {HOST_RELDIR.as_posix()}/{name}')
        if not dry_run:
            dest.mkdir(parents=True, exist_ok=True)
            if name == HOST_MANIFEST_NAME:
                manifest = json.loads((dist / name).read_text(encoding='utf-8'))
                manifest['path'] = 'swarm-wallet-host.exe'
                out.write_text(json.dumps(manifest, indent=2) + '\n',
                               encoding='utf-8')
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
        print(f'  host: {host_dest} does not exist yet -- '
              'package.py installs the host at packaging time.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
