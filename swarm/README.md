# The SWARM layer

SWARM Browser is `ungoogled-chromium-windows` plus everything in this folder.
The rule is simple and it is the whole point of the layout:

> **No upstream patch file is ever edited.** Everything SWARM lives under
> `swarm/`, and the only changes outside it are a handful of lines in
> `build.py` and `package.py`, every one of them marked `# SWARM`.

That keeps a rebase onto the next Chromium release a submodule bump plus a
re-check of this layer's own 15 hunks, instead of a merge across ungoogled's
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
  patches/swarm/swarm-privacy-defaults.patch
  patches/swarm/swarm-component-extensions.patch
  brand/render_icons.py                re-cuts the SWARM mark into Chromium's icon set
  brand/icons/                         the rendered result (binary, copied in, not patched)
  extensions/wallet/                   bundled SWARM Wallet component extension
  extensions/rewards/                  bundled SWARM Rewards component extension
  install_swarm_assets.py              copies icons + extensions into build/src
  flags.swarm.gn                       extra GN args, appended last
  revision.txt                         the SWARM layer's build number
```

And the four marked hooks outside it:

| File | `# SWARM` change |
| --- | --- |
| `build.py` | apply `swarm/patches` after the two upstream series |
| `build.py` | run `swarm/install_swarm_assets.py` after patching |
| `build.py` | append `swarm/flags.swarm.gn` to `out/Default/args.gn` |
| `package.py` | name the outputs `SWARM-Browser-<chromium>-<swarm>-win-<arch>.{exe,zip}` |

## The three patches

### `swarm-branding.patch` (3 files, 4 hunks)

* `chrome/app/theme/chromium/BRANDING` — company `Swarm`, product
  `SWARM Browser`, installer `SWARM Browser Installer`,
  `MAC_BUNDLE_ID=green.swarm.browser`. The copyright line keeps the Chromium
  notice: `Copyright <year> Swarm. Based on Chromium, Copyright <year> The
  Chromium Authors. All rights reserved.`
* `chrome/install_static/chromium_install_modes.h` — `kCompanyPathName` from
  `L""` to `L"Swarm"`, `kProductPathName` from `L"Chromium"` to
  `L"SWARM Browser"`, plus `base_app_name`, `base_app_id`, the HTML and PDF
  ProgIDs, `direct_launch_url_scheme` and `kSafeBrowsingName`.
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

**Not changed, on purpose:** `active_setup_guid`, `toast_activator_clsid`,
`elevator_clsid`, `elevator_iid`, `tracing_service_clsid`,
`tracing_service_iid` and `sandbox_sid_prefix` still hold Chromium's values, as
they do in stock ungoogled-chromium. A SWARM install and a Chromium install on
the same machine would collide on them. Minting SWARM GUIDs is a small change
but it is a release-identity decision for the owner, so it is deliberately left
open.

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

Agent B2-wallet replaces the contents of `swarm/extensions/wallet`. The folder
path, the `key` and therefore the id must not change.

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
the asset copy and stops before any compilation. It fetches only the one
Windows download a patch actually touches (`typescript`), not the multi-GB
toolchains. `apply_patches()` runs GNU patch with `check=True`, and GNU patch
exits non-zero if any hunk fails, so reaching the end is the proof.

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
   Chromium moved; the three patches touch 13 files, all listed above.
5. Re-run `python swarm/brand/render_icons.py` and
   `python swarm/install_swarm_assets.py --source-tree build/src --dry-run`;
   the dry run fails loudly if an icon destination disappeared.
6. Re-check the two verified facts in this file (the install-modes header and
   the native-messaging registry literal) — both are exactly the kind of thing
   Chromium moves between releases.
7. Bump `swarm/revision.txt`.
