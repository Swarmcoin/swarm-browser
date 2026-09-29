# The bundled wallet host, built from pinned inputs

`swarm/hosts/` in the browser package holds three files (see the layer README,
"The bundled wallet host"). Until 2026-09-29 they existed only where someone
had built them by hand, so every CI package shipped without the wallet host.
This folder lets any machine build them:

```
swarm/host/
  source/browser/host/src/      the host's JavaScript (7 files)
  source/browser/host/sea/      build-sea.js and entry.js (the single-executable build)
  tools/package.json, package-lock.json   esbuild 0.28.2 and postject 1.0.0-alpha.6, exact
  native.lock                   which wallet core ships, with both hashes
  build_host.py                 the one command
```

## Where the sources come from

| | |
| --- | --- |
| Repository | the SWARM wallet repository, branch `codex/browser-wallet-host` |
| Commit | `79c0c0391d21776714fabae863afcb10ca989b46` |
| Copied | `browser/host/src/*` and `browser/host/sea/{build-sea.js,entry.js}`, byte for byte, same relative paths under `source/` |
| Left behind | `test/`, `bin/`, `native.path`, `package.json` (the host has no runtime dependencies) |

The folder keeps LF line endings on every checkout (`.gitattributes`), so the
bundle is built from the same bytes on a Windows runner as here. The host is
developed and tested in the wallet repository; re-copy after a change there and
record the new commit in this table.

## The wallet core

`native.node` is the desktop wallet's Rust core. It is not in this repository.
`native.lock` names the public SWARM Wallet release asset that carries it, the
SHA-256 of that zip and the SHA-256 of `native.node` inside it; `build_host.py`
refuses to continue when either hash differs. The locked core is the one in
SWARM Wallet 0.1.0-mainnet.9; the host's 42 unit tests and its mainnet
end-to-end check passed against it on 2026-09-29.

## Building

```
python swarm/host/build_host.py                       # CI: download by lock, build into build/host-dist
python swarm/host/build_host.py --native-node <file>  # local: use a core you already have
```

Needs Node 22 or newer on PATH (the running `node.exe` becomes the host's
runtime) and npm for the two tools. `build.py` calls it on CI when no host is
present; on a machine that already has a host-dist the existing files win.

Nothing here signs anything. `host-provenance.json` next to the three files
records the Node version, the wallet release and the hashes.
