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

    python swarm/install_swarm_assets.py --source-tree build/src [--dry-run]
"""
import argparse
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ICONS = HERE / 'brand' / 'icons'
EXTENSIONS = HERE / 'extensions'

THEME_RELDIR = Path('chrome/app/theme/chromium')
RESOURCES_RELDIR = Path('chrome/browser/resources')

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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-tree', type=Path, required=True,
                        help='the prepared Chromium tree (build/src)')
    parser.add_argument('--dry-run', action='store_true',
                        help='report what would be copied and copy nothing')
    args = parser.parse_args()

    source_tree = args.source_tree.resolve()
    print(f'Installing SWARM assets into {source_tree}')
    icons = install_branding(source_tree, args.dry_run)
    exts = install_extensions(source_tree, args.dry_run)
    print(f'SWARM assets installed: {icons} icon files, {exts} extensions')
    return 0


if __name__ == '__main__':
    sys.exit(main())
