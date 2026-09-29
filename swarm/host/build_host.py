#!/usr/bin/env python3
"""Build the bundled SWARM Wallet host: three files, from pinned inputs.

    swarm-wallet-host.exe          the host and the Node runtime (single executable)
    native.node                    the wallet core
    green.swarm.wallet_host.json   the native messaging manifest

The host's JavaScript is vendored under swarm/host/source (copied from the
wallet repository, see README.md). The wallet core is NOT in this repository:
it is taken from the public SWARM Wallet release named in native.lock, and
both the zip and the extracted file are checked against the hashes there.
esbuild and postject come from swarm/host/tools (exact versions, lockfile).

Used by build.py on CI, where no host has been built on the machine. On a
developer machine an existing host-dist wins and this script is not called.

    python swarm/host/build_host.py [--out build/host-dist] [--work build/host-build]
                                    [--cache build/download_cache] [--native-node <file>]
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BUILD_SEA = HERE / 'source' / 'browser' / 'host' / 'sea' / 'build-sea.js'
TOOLS = HERE / 'tools'
LOCK = HERE / 'native.lock'
HOST_FILES = ('green.swarm.wallet_host.json', 'swarm-wallet-host.exe', 'native.node')
MIN_NODE_MAJOR = 22


def sha256_of(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def say(text):
    print(f'  host-build: {text}', flush=True)


def node_version(node):
    out = subprocess.run([node, '--version'], check=True, capture_output=True, text=True).stdout.strip()
    major = int(out.lstrip('v').split('.')[0])
    if major < MIN_NODE_MAJOR:
        raise SystemExit(f'Node {out} is too old: the single-executable host needs Node {MIN_NODE_MAJOR} or newer')
    return out


def obtain_native(lock, cache, work, override):
    if override:
        native = Path(override)
        if not native.is_file():
            raise SystemExit(f'--native-node {native} does not exist')
        digest = sha256_of(native)
        note = 'matches native.lock' if digest == lock['native_sha256'] else 'DIFFERS from native.lock (local override)'
        say(f'wallet core {native} sha256 {digest} ({note})')
        return native
    cache.mkdir(parents=True, exist_ok=True)
    zip_path = cache / lock['zip_name']
    if not (zip_path.is_file() and sha256_of(zip_path) == lock['zip_sha256']):
        say(f'downloading {lock["zip_url"]}')
        with urllib.request.urlopen(lock['zip_url']) as res, open(zip_path, 'wb') as out:
            shutil.copyfileobj(res, out, 1 << 20)
    digest = sha256_of(zip_path)
    if digest != lock['zip_sha256']:
        raise SystemExit(f'{zip_path}: sha256 {digest} is not the {lock["zip_sha256"]} native.lock names')
    say(f'wallet release zip verified: {lock["zip_name"]} sha256 {digest}')
    native = work / 'native.node'
    with zipfile.ZipFile(zip_path) as z, z.open(lock['member']) as src, open(native, 'wb') as dst:
        shutil.copyfileobj(src, dst, 1 << 20)
    digest = sha256_of(native)
    if digest != lock['native_sha256']:
        raise SystemExit(f'{lock["member"]}: sha256 {digest} is not the {lock["native_sha256"]} native.lock names')
    say(f'wallet core extracted and verified: sha256 {digest}')
    return native


def ensure_tools(work):
    for name in ('package.json', 'package-lock.json'):
        shutil.copyfile(TOOLS / name, work / name)
    if (work / 'node_modules' / 'esbuild').is_dir() and (work / 'node_modules' / 'postject').is_dir():
        say('esbuild and postject already installed')
        return
    say('npm ci (esbuild, postject; exact versions from swarm/host/tools)')
    subprocess.run('npm ci --no-audit --no-fund', cwd=work, shell=True, check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', type=Path, default=ROOT / 'build' / 'host-dist')
    ap.add_argument('--work', type=Path, default=ROOT / 'build' / 'host-build')
    ap.add_argument('--cache', type=Path, default=ROOT / 'build' / 'download_cache')
    ap.add_argument('--native-node', default='', help='use this wallet core instead of the one native.lock names')
    ap.add_argument('--node', default='node')
    a = ap.parse_args()

    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    version = node_version(a.node)
    say(f'Node {version}')
    a.work.mkdir(parents=True, exist_ok=True)
    a.out.mkdir(parents=True, exist_ok=True)
    native = obtain_native(lock, a.cache, a.work, a.native_node)
    ensure_tools(a.work)
    subprocess.run([a.node, str(BUILD_SEA), '--native', str(native), '--out', str(a.out), '--work', str(a.work)], check=True)
    missing = [n for n in HOST_FILES if not (a.out / n).is_file()]
    if missing:
        raise SystemExit(f'{a.out} lacks {missing} after the build')
    sums = {n: sha256_of(a.out / n) for n in HOST_FILES}
    provenance = {
        'node': version,
        'wallet_release': lock['wallet_release'],
        'native_override': bool(a.native_node),
        'tools': json.loads((TOOLS / 'package.json').read_text(encoding='utf-8'))['dependencies'],
        'sha256': sums,
    }
    (a.out / 'host-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    for n, h in sums.items():
        say(f'{h}  {n}')
    say(f'built in {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
