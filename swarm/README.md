# The SWARM layer

SWARM Browser is `ungoogled-chromium-windows` plus everything in this folder.
The rule is simple and it is the whole point of the layout:

> **No upstream patch file is ever edited.** Everything SWARM lives under
> `swarm/`, and the only changes outside it are a handful of lines in
> `build.py` and `package.py`, every one of them marked `# SWARM`.

That keeps a rebase onto the next Chromium release a submodule bump plus a
re-check of this layer's own 23 hunks, instead of a merge across ungoogled's
several hundred.

Upstream provenance of this checkout:

| | |
| --- | --- |
| `ungoogled-chromium-windows` tag | `153.0.8010.52-1.1`, commit `4fe389fe08dac85cead3ea77afe59834dbbc9673` |
| `ungoogled-chromium` submodule | tag `153.0.8010.52-1`, commit `a638756eb14c8b6ce64b4b2a067afea5d4207bf4` |
| Chromium | `153.0.8010.52` (`ungoogled-chromium/chromium_version.txt`) |
| SWARM layer build | `swarm/revision.txt` (currently `1`) |

Licences: upstream `LICENSE` files are untouched. The SWARM notices, and the
BSD-3 notices for Chromium and ungoogled-chromium, are in `NOTICE-SWARM.md` at
the root of the repository.

## What is in here

```
swarm/
  patches/series                       third patch series, applied last
  patches/swarm/swarm-branding.patch
  patches/swarm/swarm-native-host-lookup.patch
  patches/swarm/swarm-privacy-defaults.patch
  patches/swarm/swarm-component-extensions.patch
  brand/render_icons.py                re-cuts the SWARM mark into Chromium's icon set
  brand/icons/                         the rendered result (binary, copied in, not patched)
  extensions/wallet/                   bundled SWARM Wallet (copied from its own repo)
  extensions/rewards/                  bundled SWARM Rewards component extension
  devutils/                            regenerate the series, verify it, parse-check it
  install_swarm_assets.py              copies icons + extensions into build/src,
                                       and the built wallet host into the build output
  flags.swarm.gn                       extra GN args, appended last
  revision.txt                         the SWARM layer's build number
```

There is deliberately no `swarm/hosts/` in the source tree: it is a **build
output** directory. See **The bundled wallet host** below.

And the five marked hooks outside it:

| File | `# SWARM` change |
| --- | --- |
| `build.py` | apply `swarm/patches` after the two upstream series |
| `build.py` | run `swarm/install_swarm_assets.py` after patching |
| `build.py` | append `swarm/flags.swarm.gn` to `out/Default/args.gn` |
| `package.py` | call `install_bundled_host()` on `out/Default` before packaging |
| `package.py` | name the outputs `SWARM-Browser-<chromium>-<swarm>-win-<arch>.{exe,zip}` |

## The four patches

### `swarm-branding.patch` (5 files, 9 hunks)

* `chrome/app/theme/chromium/BRANDING` — company `Swarm`, product
  `SWARM Browser`, installer `SWARM Browser Installer`,
  `MAC_BUNDLE_ID=green.swarm.browser`. The copyright line keeps the Chromium
  notice: `Copyright <year> Swarm. Based on Chromium, Copyright <year> The
  Chromium Authors. All rights reserved.`
* `chrome/install_static/chromium_install_modes.h` — `kCompanyPathName` from
  `L""` to `L"Swarm"`, `kProductPathName` from `L"Chromium"` to
  `L"SWARM Browser"`, plus `base_app_name`, `base_app_id`, the HTML and PDF
  ProgIDs, `direct_launch_url_scheme` and `kSafeBrowsingName` — and the whole
  install identity (see below).
* `chrome/elevation_service/elevation_service_idl.idl` and
  `chrome/windows_services/elevated_tracing_service/tracing_service_idl.idl` —
  the two per-flavour interface uuids, kept in sync with the header.
* `chrome/browser/extensions/api/messaging/launch_context_win.cc` — the native
  messaging registry key (see below).

**Verified against the Chromium 153.0.8010.52 tree, correcting the plan's
assumptions:**

* `chrome/install_static/chromium_install_modes.cc` **no longer exists**. Every
  constant now lives in `chromium_install_modes.h` as `inline constexpr`.
* `chrome/browser/extensions/api/messaging/native_process_launcher_win.cc`
  **no longer exists**. The Windows native-messaging launcher is
  `chrome/browser/extensions/api/messaging/launch_context_win.cc`.

**The verified registry key.** `launch_context_win.cc` does *not* derive the
key from `install_static`; under `#if BUILDFLAG(CHROMIUM_BRANDING)` it holds a
hardcoded literal, tried first and falling back to Google Chrome's key:

```cpp
static constexpr wchar_t kChromiumNativeMessagingRegistryKey[] =
    L"SOFTWARE\\Chromium\\NativeMessagingHosts";
```

Patching `kProductPathName` alone would therefore have left the key at
`SOFTWARE\Chromium`. The SWARM patch changes the literal, so the key a SWARM
build reads is:

> **`HKCU\Software\Swarm\SWARM Browser\NativeMessagingHosts\<host name>`**
> (`HKEY_CURRENT_USER` is tried first, then `HKEY_LOCAL_MACHINE`; 32-bit view
> first, then 64-bit — `GetManifestPath` / `GetManifestPathWithFlags`.)

That matches what the installer expects: `chrome/installer/setup/uninstall.cc`
keeps `{L"Extensions", L"NativeMessagingHosts"}` under
`install_static::GetRegistryPath()`, which with the branding patch is
`Software\Swarm\SWARM Browser`.

The profile therefore lives under
`%LOCALAPPDATA%\Swarm\SWARM Browser\User Data`
(`AppendChromeInstallSubDirectory` in `chrome/install_static/install_util.cc`
appends `kCompanyPathName\kProductPathName`).

### The install identity

Stock ungoogled-chromium keeps every one of Chromium's Windows identifiers, so
an ungoogled install and a Chromium install fight over the same Active Setup
key, the same COM servers and the same sandbox profile. SWARM mints its own.
Each of these is something the installer writes to the registry or registers
with COM:

| Field | What would have collided |
| --- | --- |
| `active_setup_guid` | `HKLM\Software\Microsoft\Active Setup\Installed Components\{guid}` |
| `toast_activator_clsid` | the COM server Action Center calls back for toast clicks |
| `elevator_clsid` | the elevation service's COM server |
| `elevator_iid` | `IElevator2Chromium`'s IID, registered as its TypeLib |
| `tracing_service_clsid` | the elevated tracing service's COM server |
| `tracing_service_iid` | `ISystemTraceSessionChromium`'s IID and TypeLib |
| `sandbox_sid_prefix` | the renderer AppContainer profile under `%LOCALAPPDATA%\Packages` |
| `old_tracing_service_iids` | see below |

`base_app_id` (the AppUserModelId, which decides taskbar grouping and jump
lists) and `direct_launch_url_scheme` were already SWARM's in the branding
change above. `app_guid` and `default_channel_name` stay empty: they exist for
Google Update integration, which neither Chromium nor SWARM has.

**The two IIDs are also TypeLib identities compiled into `.idl` files.** The
elevation IDL states in its own comment that each flavour is given a distinct
IID exactly so that the flavours can be installed side by side; the value in
`chromium_install_modes.h` must equal the `uuid()` on `IElevator2Chromium`,
because `install_worker.cc` registers that IID as the interface's TypeLib.
Changing only the header would register a TypeLib describing an interface with
a different IID. The patch therefore changes both, and the same for
`ISystemTraceSessionChromium`. `IElevatorChromium`, the v1 interface the same
COM class implements, is given a SWARM uuid too — nothing registers it, but it
is still a Chromium identity a SWARM build should not claim.

**`old_tracing_service_iids` is emptied, not re-pointed.** Chromium lists there
the tracing IID it retired in 2026-09, and
`chrome/installer/setup/{install_worker,setup_main}.cc` pass that list to the
installer so it can *delete* the stale registration. SWARM has never shipped,
so it has nothing to clean up — and keeping Chromium's entry would mean a SWARM
install or uninstall deleting a Chromium install's COM registration. That is
the same collision seen from the other side.

**`sandbox_sid_prefix`** is not derived from anything; Chromium hands the
string to the sandbox verbatim (`ChromeContentBrowserClient::
GetAppContainerSidForSandboxType` appends a per-process suffix), and Chrome's
channels differ from Chromium's only in the last subauthority. SWARM's is a
fresh `S-1-15-2` value.

The values themselves live in `swarm-branding.patch` and in
`swarm/devutils/make_swarm_patches.py`, which generated them with
`uuid.uuid4()`. They are identifiers, not secrets, but they are SWARM's: do not
copy them into another product.

### `swarm-native-host-lookup.patch` (1 file, 3 hunks)

`chrome/browser/extensions/api/messaging/launch_context_win.cc` again — which
is why the series applies this patch **second, directly after the branding
patch**: both touch that file, and the branding patch is what moves the
registry literal the lookup below falls through from.

The problem it solves: the wallet host is shipped *inside* the browser package,
so at the moment an extension first asks for it nothing has run an installer and
nothing has written `HKCU\Software\Swarm\SWARM Browser\NativeMessagingHosts`.
A portable zip has no install step at all. Upstream Chromium has no concept of a
native messaging host that travels with the browser: `GetManifestPath` looks in
the registry and, failing that, reports *"Native messaging host … is not
registered."*

The patch adds `FindSwarmBundledManifest()` and calls it in exactly that
`if (!found)` branch, so the order is:

1. `HKCU`, then `HKLM`, 32-bit view then 64-bit (unchanged upstream behaviour);
2. only if none of those hold the host, `<directory of chrome.exe>\swarm\hosts\<host name>.json`.

A host the user installed therefore still wins over the bundled one, and a
browser that is merely unzipped finds its wallet with nothing written to the
registry and nothing left behind when the folder is deleted.

**The host name comes from an extension, so it is validated before it becomes a
path.** `FindSwarmBundledManifest` rejects an empty name, any character outside
`[a-z0-9._]` (the set Chromium's own host names use), and any name containing
`..`, before `AppendASCII` is reached. Without that check a host name is a
directory traversal: the name is attacker-chosen relative to the browser, and
this is the one place a string from an extension is turned into a file path.
The function returns an empty `FilePath` unless `base::PathExists` succeeds, so
a missing file falls back to the unchanged "not registered" error.

The two extra includes are `base/files/file_util.h` (for `PathExists`) and
`base/path_service.h` (for `DIR_EXE`).

### `swarm-privacy-defaults.patch` (4 files, 4 hunks)

Two mechanisms, chosen per setting, and the reason for each:

| Setting | Mechanism | Where |
| --- | --- | --- |
| `NoCrossOriginReferrers` | feature default flipped to `FEATURE_ENABLED_BY_DEFAULT` | `services/network/public/cpp/features.cc` |
| `RemoveClientHints`, `ReducedSystemInfo` | same | `third_party/blink/common/features.cc` |
| HTTPS-First mode | pref default `false` -> `true` at registration | `chrome/browser/ui/browser_ui_prefs.cc` (`prefs::kHttpsOnlyModeEnabled`) |
| `--no-pings`, `--webrtc-ip-handling-policy=default_public_interface_only`, `--disable-search-engine-collection` | switches appended at startup unless the user set them | `chrome/app/chrome_main_delegate.cc`, `ChromeMainDelegate::BasicStartupComplete()` |

*Why features get a default flip rather than `--enable-features`:* the three
features are added by ungoogled patches as `FEATURE_DISABLED_BY_DEFAULT`, so
flipping the literal is one token per feature, it keeps `chrome://flags`
honest, and it does not fight a user's own `--enable-features`.

*Why HTTPS-First is a pref default rather than a policy or a switch:* there is
no switch for it, and a pref default leaves the toggle in Settings working —
the user can still turn it off, which a command-line pref store or a policy
would not allow.

*Why the rest are switches:* Chromium has no "switch on by default" mechanism,
and these three are read as switches (the ungoogled search-collection patch
calls `HasSwitch` directly). Appending them at the earliest callback lets
Chromium's own mapping do the work:
`chrome/browser/prefs/chrome_command_line_pref_store.cc` maps `--no-pings` to
`prefs::kEnableHyperlinkAuditing=false` and `--webrtc-ip-handling-policy` to
`prefs::kWebRTCIPHandlingPolicy`. Each is appended only when absent, so an
explicit command line still wins.

**Deliberately left OFF:** canvas / `measureText` / client-rects noise and
`SpoofWebGLInfo`, and `MinimalReferrers` (it strips same-origin referrers too).
They break ordinary sites, and SWARM's users are not expected to be experts.
They stay opt-in flags, for a later "Strict" toggle.

**Still missing, and it must be said plainly:** with Safe Browsing removed by
ungoogled-chromium there is no phishing or malware protection at all, and there
is no ad or tracker blocking. See `docs/BROWSER-PRIVACY-AUDIT-2026-09-26.md`
items 1 and 2.

### `swarm-component-extensions.patch` (6 files, 7 hunks)

Bundles the two extensions the way Chromium bundles its own: manifests as
resources in `chrome/browser/browser_resources.grd`, the rest of the files in
`chrome/browser/resources/component_extension_resources.grd` (whose generated
map `ChromeComponentExtensionResourceManager` uses to serve
`<extension>/<path>` out of the pak, so nothing is written to disk), the grit
inputs in `chrome/browser/resources/BUILD.gn`, an `AddSwarmExtensions()` in
`component_loader.{h,cc}` called from
`AddDefaultComponentExtensionsWithBackgroundPages`, and the two new IDRs in
`component_extensions_allowlist/allowlist.cc` — without which
`IsComponentExtensionAllowlisted(int)` hits `NOTREACHED()`.

The folder name under `chrome/browser/resources` (`swarm_wallet`,
`swarm_rewards`) is the `root_directory` passed to `ComponentLoader::Add()`
*and* the resource-path prefix in the grd. Change one and you must change all
three; `swarm/install_swarm_assets.py` holds the mapping.

The per-file lists in the grd and in `BUILD.gn` are **generated from the
folders on disk** by `swarm/devutils/make_swarm_patches.py`, not typed out.
The wallet is maintained in its own repository and copied in, so a hand-written
list would go stale the first time it gained a file.

## The bundled wallet host (`swarm/hosts/`)

`swarm/hosts/` never appears in this repository, and that is the point: its
three files are **build outputs**, not sources. `install_swarm_assets.py`
copies them into the build output directory, next to `chrome.exe`, and
`package.py` calls it before anything is archived.

| | |
| --- | --- |
| Source of the files | `D:/swarm-work/host-dist` (`DEFAULT_HOST_DIST`, overridable with `--host-dist`) |
| Destination | `<build output>/swarm/hosts/` — i.e. `build/src/out/Default/swarm/hosts/` |
| Files | `green.swarm.wallet_host.json`, `swarm-wallet-host.exe`, `native.node` |
| Built by | `browser/host/sea/build-sea.js` in the `privacy-wallet-browser` repository (Node 22 single executable application) |

The exe is a Node 22 SEA holding the host's JavaScript; `native.node` is the
wallet core it loads **from its own directory** — no registry key, no
environment variable and no pointer file, so the three files move together.

`install_bundled_host()` rewrites one field on the way through: the manifest's
`path` becomes the bare name `swarm-wallet-host.exe`. On Windows Chromium
resolves a relative host path against the manifest's own directory
(`launch_context.cc`: `host_path = manifest_path.DirName().Append(host_path)`),
which is what makes the folder relocatable — the copy in `build/`, the copy in
the portable zip and a copy under `Program Files` are the same three files with
no absolute path baked in.

**It is skipped, not failed, when the host has not been built.** A missing
`host-dist` prints where to build it and returns `[]`; the browser packages
without a bundled wallet host. This is the opposite of the icon rule above,
deliberately: an icon that vanished means Chromium renamed something and the
build would silently ship a Chromium icon, while a host that was not built is
the ordinary state of a tree on a machine that only builds the browser.

**What reaches which artifact.** `package.py` hands the returned paths to
`filescfg.create_archive`, so the three files are in the **portable zip**
today. The `mini_installer` takes its file list from
`chrome/installer/mini_installer/chrome.release`, which is *not* patched yet —
until it is, the **installer does not carry the host**, and an installed SWARM
Browser falls back to the registry path (i.e. it needs the wallet's own
installer). That gap is real and is the next packaging task.

Locally built at the time of writing (`D:/swarm-work/host-dist/SHA256SUMS.txt`):

```
692b798bc05f6ec43b4678a93daeb5477b73db410aa4505e99e4b41fe7192ec7  swarm-wallet-host.exe
2dcd84bb378c127723f9eae3862d2d4fbe67e3333d2ceac6fd0b7d0c806bb912  native.node
ccb707f2fb22dd7444d469dd284299fddb79b6dab7efd53a18a3df96e7b05887  green.swarm.wallet_host.json
```

Those are one machine's outputs, not a release: CI has never built the host,
and nothing here is signed.

## Where the wallet comes from

`swarm/extensions/wallet` is not written here. It is a copy of
`browser/extension` from the wallet repository:

| | |
| --- | --- |
| Repository | `privacy-wallet-browser` (`D:/swarm-work/privacy-wallet-browser` locally) |
| Branch | `codex/browser-wallet-host` |
| Commit | `a1bc7d605a0f6e0c2faf1f832d216a8f092f1b84` |
| Copied | 21 files; `test/`, `package.json` and `node_modules` left behind |

`test/` and `package.json` exist only so the QR encoder can be run under
`node --test` outside a browser; shipping them would put dead files in the pak.

Re-copying after the wallet changes upstream is: copy the folder, drop those
three, re-run `make_swarm_patches.py` (which picks up any new files by itself)
and `install_swarm_assets.py`. **The `key` in `manifest.json` must survive the
copy**, and it does: the wallet repository and this one hold the same public
key, so the id is `gmmgmodmgnigcgboccjelpgedejejfap` on both sides and the
native messaging host's `allowed_origins`
(`browser/install/green.swarm.wallet_host.json` there) already names it.

## Extension ids

Fixed by the `key` field (base64 DER SubjectPublicKeyInfo) in each
`manifest.json`. The id is the first 16 bytes of `SHA256(DER public key)` with
each hex nibble mapped `0-f` to `a-p` (Chromium `crx_file/id_util.cc`).

| Extension | Folder | Id |
| --- | --- | --- |
| SWARM Wallet | `swarm/extensions/wallet` -> `swarm_wallet` | `gmmgmodmgnigcgboccjelpgedejejfap` |
| SWARM Rewards | `swarm/extensions/rewards` -> `swarm_rewards` | `gjmgdanakkpkgpmecnecoliifonlapnb` |

The wallet id is what the native messaging host manifest must list in
`allowed_origins` as `chrome-extension://gmmgmodmgnigcgboccjelpgedejejfap/`.

**The matching private keys are not in this repository.** They were generated
locally and left outside the tree; only the public key is needed to build, and
a component extension is never signed into a `.crx`. If the owner ever wants to
publish either extension to a store, generate the store key there and expect a
different id.

The folder path, the `key` and therefore the id must not change when the wallet
is re-copied from its own repository.

## Icons

`swarm/brand/render_icons.py` re-cuts the approved SWARM mark from
`D:/privacy/brand/swarm-mark/dist/icons` (built by `build_icons.py` there) into
exactly the files Chromium 153 ships, verified against the unpacked tree:
`product_logo_{16,24,48,64,128,256}.png`, `product_logo_22_mono.png`,
`win/{chromium,chromium_doc,chromium_pdf,app_list}.ico` at 16/32/48/256, and
`win/tiles/{Logo,SmallLogo}.png` at 600 and 176. There is no
`product_logo_32.png` upstream. `win/incognito.ico` is left alone: it is a UI
glyph, not branding.

`install_swarm_assets.py` copies them over the upstream files after the patches
and **fails** if a destination is missing, so a Chromium icon rename is caught
instead of silently shipping a Chromium icon.

Open design item: the document icons (`chromium_doc.ico`, `chromium_pdf.ico`)
currently reuse the plain mark and lose the "this is a document" affordance.

## CI

The staged design is upstream's, unchanged: `swarm-reusable-build` chains
`build-1` ... `build-16` on `windows-2022`, each stage running `build.py --ci`
under a 3.5-hour ninja timeout and handing the tree to the next as an artifact.
Changes are the names, `C:\swarm-browser` in place of
`C:\ungoogled-chromium-windows`, and the `SWARM-Browser*` package glob in
`.github/actions/stage/index.js`.

`swarm-publish-release` keeps upstream's tag resolution and artifact hand-off
and drops upstream's `publish-winget` and `update-binaries` jobs, which push to
third-party repositories with upstream's PAT. `.github/scripts/gen.py` (which
hashes upstream's release assets) was removed for the same reason.
`swarm-build-x86` and `swarm-build-arm` are manual-dispatch only: x64 is the
only SWARM release target for now.

**Nothing here has been run.** Creating the GitHub repository is owner decision
D2 in `docs/SWARM-BROWSER-PLAN.md`.

## Building

Locally (needs Visual Studio 2026 with the C++ workload and ~100 GB free):

```
python build.py
```

Without a compiler you can still prove the layer is sound, which is all that
was possible for this commit:

```
python swarm/devutils/prepare_and_verify.py   # download, prune, apply, copy
python swarm/devutils/check_syntax.py         # parse everything we add
```

`prepare_and_verify.py` reproduces `build.py --tarball` up to (and including)
the asset copy and stops before any compilation. It builds its tree in
`build/verify/chromium-<version>/`, leaving `build/src` alone, and fetches only
the one Windows download a patch actually touches (`typescript`), not the
multi-GB toolchains. `apply_patches()` runs GNU patch with `check=True`, and
GNU patch exits non-zero if any hunk fails, so reaching the end is the proof.

Pass that tree to `check_syntax.py` as an argument and it will parse the
patched `.grd` files and the installed manifests too:

```
python swarm/devutils/check_syntax.py build/verify/chromium-153.0.8010.52
```

`prepare_and_verify.py` drives 7-Zip directly rather than going through
`downloads.unpack_downloads`, and deliberately does not rename the extracted
`chromium-<version>/` directory up a level. That rename is the one step in the
pipeline that needs exclusive access to a directory Windows Defender has just
finished writing 566,000 files into, and it fails with `WinError 5` often
enough to matter. Nothing downstream cares: every patch is applied with
`-d <tree>`.

`build/` is ignored by git and is entirely rebuildable. A prepared tree is
about 8.4 GB over 566,000 files; `build/download_cache` is about 1.8 GB.
Deleting a tree costs only the time to extract another; deleting the cache also
costs the download.

7-Zip is found through
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\7zFM.exe`. Without
it the tar extractor falls back to pure Python, which handles the Chromium
`.tar.xz` (slowly) but not the `.tgz` and `.zip` Windows downloads.

Note for rebases: `swarm-<name>.patch` files are regenerated, not hand-edited.
`swarm/devutils/make_swarm_patches.py` holds the edits as anchored string
replacements and refuses to run if an anchor has moved, which is a clearer
failure than a rejected hunk.

## Rebasing onto the next upstream tag

1. `git fetch upstream && git merge <new tag>` — conflicts should be limited to
   the four `# SWARM` hooks in `build.py` / `package.py`.
2. `git -C ungoogled-chromium checkout <matching ungoogled tag>`.
3. Re-prepare a tree (tarball, prune, both upstream series).
4. Apply `swarm/patches/series`. Every hunk that fails points at a file
   Chromium moved; the four patches touch 15 files, all listed above
   (`launch_context_win.cc` is touched by two of them, branding first).
5. Re-run `python swarm/brand/render_icons.py` and
   `python swarm/install_swarm_assets.py --source-tree build/src --dry-run`;
   the dry run fails loudly if an icon destination disappeared.
6. Re-check the verified facts in this file — the install-modes header, the
   native-messaging registry literal, and that the two IIDs in the header still
   match the `uuid()` lines in the two `.idl` files. All three are exactly the
   kind of thing Chromium moves between releases.
7. If the wallet has moved on, re-copy `swarm/extensions/wallet` from its
   repository (see **Where the wallet comes from**) and check the id again.
8. Bump `swarm/revision.txt`.
