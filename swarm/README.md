# The SWARM layer

SWARM Browser is `ungoogled-chromium-windows` plus everything in this folder.
The rule is simple and it is the whole point of the layout:

> **No upstream patch file is ever edited.** Everything SWARM lives under
> `swarm/`, and the only changes outside it are a handful of lines in
> `build.py` and `package.py`, every one of them marked `# SWARM`.

That keeps a rebase onto the next Chromium release a submodule bump plus a
re-check of this layer's own 35 hunks, instead of a merge across ungoogled's
several hundred.

Upstream provenance of this checkout:

| | |
| --- | --- |
| `ungoogled-chromium-windows` tag | `153.0.8010.52-1.1`, commit `4fe389fe08dac85cead3ea77afe59834dbbc9673` |
| `ungoogled-chromium` submodule | tag `153.0.8010.52-1`, commit `a638756eb14c8b6ce64b4b2a067afea5d4207bf4` |
| Chromium | `153.0.8010.52` (`ungoogled-chromium/chromium_version.txt`) |
| SWARM layer build | `swarm/revision.txt` (currently `3`: build 5, with SWARM Start, the SWARM welcome page and the branding pass. `2` was the installer carrying the wallet host, `1` the first build; the packages carry the number in their name, `-3-`) |

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
  patches/swarm/swarm-installer-host.patch
  patches/swarm/swarm-first-run.patch
  patches/swarm/swarm-toolbar-pins.patch
  patches/swarm/swarm-ui-logos.patch
  patches/swarm/swarm-default-colour.patch
  patches/swarm/swarm-ui-names.patch
  brand/render_icons.py                re-cuts the SWARM mark into Chromium's icon set
  brand/icons/                         the rendered result (binary, copied in, not patched)
  brand/render_ui_logos.py             re-cuts the mark into the logos drawn INSIDE the UI
  brand/tree/                          its result, laid out as paths of the source tree
  brand/product_strings.py             "Chromium" -> "SWARM Browser" in chromium_strings.grd
  brand/ui_strings.py                  the same for the other string bundles, plus "Chrome"
                                       and a few messages set by name
  extensions/wallet/                   bundled SWARM Wallet (copied from its own repo)
  extensions/rewards/                  bundled SWARM Rewards component extension
  extensions/update/                   bundled SWARM Update: the daily signed update check
  extensions/start/                    bundled SWARM Start: new tab, Navigator, welcome page
  updates/                             make, sign and check the update feed (updates/README.md)
  tests/update/                        node --test suites + Edge smoke test for SWARM Update
  tests/start/                         node --test suites for SWARM Start's pure logic
  tests/brand/                         unit tests for the two string rewriters
  devutils/                            regenerate the series, verify it, parse-check it
  install_swarm_assets.py              copies icons, UI logos + extensions into build/src
                                       (stamping SWARM Update's version.json), rewrites the
                                       UI strings, and copies the built wallet host into
                                       the build output
  flags.swarm.gn                       extra GN args, appended last
  revision.txt                         the SWARM layer's build number
```

There is deliberately no `swarm/hosts/` in the source tree: it is a **build
output** directory. See **The bundled wallet host** below.

And the six marked hooks outside it:

| File | `# SWARM` change |
| --- | --- |
| `build.py` | apply `swarm/patches` after the two upstream series |
| `build.py` | run `swarm/install_swarm_assets.py` after patching |
| `build.py` | append `swarm/flags.swarm.gn` to `out/Default/args.gn` |
| `build.py` | run `swarm/install_swarm_assets.py --host-dest out/Default` right before ninja, so the installer can pack the wallet host |
| `package.py` | call `install_bundled_host()` on `out/Default` before packaging (again; it leaves up-to-date files alone) |
| `package.py` | name the outputs `SWARM-Browser-<chromium>-<swarm>-win-<arch>.{exe,zip}` |

## The ten patches

| Patch | Files | Hunks | What it does |
| --- | --- | --- | --- |
| `swarm-branding.patch` | 5 | 9 | SWARM name, install identity, native-messaging registry key |
| `swarm-native-host-lookup.patch` | 1 | 3 | finds the bundled wallet host in the browser's own folders |
| `swarm-privacy-defaults.patch` | 4 | 4 | privacy defaults compiled in |
| `swarm-component-extensions.patch` | 6 | 7 | SWARM Wallet, Rewards, Update and Start as component extensions |
| `swarm-installer-host.patch` | 1 | 1 | the installer packs the bundled wallet host |
| `swarm-first-run.patch` | 3 | 3 | the first-run tab is the SWARM welcome page (build 5) |
| `swarm-toolbar-pins.patch` | 1 | 1 | the Navigator and wallet buttons are pinned until the person changes the pins (build 5) |
| `swarm-ui-logos.patch` | 2 | 4 | the inline product glyph (the About item) is the SWARM mark (build 5) |
| `swarm-default-colour.patch` | 1 | 1 | SWARM honey #F5A623 is the default browser colour (build 5) |
| `swarm-ui-names.patch` | 2 | 2 | chrome://chrome-urls is titled "SWARM Browser pages" (build 5) |

Applied in that order (`swarm/patches/series`), after both upstream series.
25 distinct files, 35 hunks; `launch_context_win.cc` is the one file two
patches touch. `swarm-first-run.patch` changes three lines that
ungoogled-chromium's own `first-run-page.patch` put in the tree; the upstream
patch file itself is untouched, which is the rule.

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
so at the moment an extension first asks for it nothing has written
`HKCU\Software\Swarm\SWARM Browser\NativeMessagingHosts` for it: the browser's
own installer registers no native messaging hosts, and a portable zip has no
install step at all. Upstream Chromium has no concept of a native messaging
host that travels with the browser: `GetManifestPath` looks in the registry
and, failing that, reports *"Native messaging host … is not registered."*

The patch adds `FindSwarmBundledManifest()` and calls it in exactly that
`if (!found)` branch, so the order is:

1. `HKCU`, then `HKLM`, 32-bit view then 64-bit (unchanged upstream behaviour);
2. only if none of those hold the host,
   `<directory of chrome.dll>\swarm\hosts\<host name>.json` (`base::DIR_MODULE`);
3. then `<directory of chrome.exe>\swarm\hosts\<host name>.json` (`base::DIR_EXE`).

**Why the directory of `chrome.dll` comes first.** An installed Chromium keeps
`chrome.exe` (and `chrome_proxy.exe`) in the application directory and
everything else in a version directory beside it,
`<install dir>\<version>\`, which is where `chrome.dll` is and where the
installer puts the bundled host (see `swarm-installer-host.patch`). In the
portable zip everything is one flat folder, so the two lookups are the same
folder and the first one finds the host. `base::DIR_MODULE` is the directory of
the module the calling code is linked into (`GetModuleFileName(CURRENT_MODULE())`
in `base/base_paths_win.cc`), and in the browser process that is `chrome.dll`.
Chromium itself finds its external-extensions folder the same way on Windows —
`chrome::DIR_EXTERNAL_EXTENSIONS` is `DIR_MODULE\extensions`
(`chrome/common/chrome_paths.cc`), matching the installer's
`Extensions\*.*: %(VersionDir)s\Extensions\`. A side effect worth knowing: the
host is always the one from the same version directory as the running
`chrome.dll`, so a browser and its bundled host change version together.
`DIR_EXE` stays as the second place so a host placed next to `chrome.exe` is
still found.

A host the user installed therefore still wins over the bundled one, and a
browser that is merely unzipped finds its wallet with nothing written to the
registry and nothing left behind when the folder is deleted.

**The host name comes from an extension, so it is validated before it becomes a
path.** `FindSwarmBundledManifest` rejects an empty name, any character outside
`[a-z0-9._]` (the set Chromium's own host names use), and any name containing
`..`, before `AppendASCII` is reached. Without that check a host name is a
directory traversal: the name is attacker-chosen relative to the browser, and
this is the one place a string from an extension is turned into a file path.
The check runs once, before either folder is tried, and both paths are built
inside the same function from the validated name. The function returns an
empty `FilePath` unless `base::PathExists` succeeds in one of the two folders,
so a missing file falls back to the unchanged "not registered" error.

The two extra includes are `base/files/file_util.h` (for `PathExists`) and
`base/path_service.h` (for `PathService`, and through `base/base_paths.h` for
`DIR_MODULE` and `DIR_EXE`).

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

Bundles the three extensions the way Chromium bundles its own: manifests as
resources in `chrome/browser/browser_resources.grd`, the rest of the files in
`chrome/browser/resources/component_extension_resources.grd` (whose generated
map `ChromeComponentExtensionResourceManager` uses to serve
`<extension>/<path>` out of the pak, so nothing is written to disk), the grit
inputs in `chrome/browser/resources/BUILD.gn`, an `AddSwarmExtensions()` in
`component_loader.{h,cc}` called from
`AddDefaultComponentExtensionsWithBackgroundPages`, and the three new IDRs in
`component_extensions_allowlist/allowlist.cc` — without which
`IsComponentExtensionAllowlisted(int)` hits `NOTREACHED()`.

The folder name under `chrome/browser/resources` (`swarm_wallet`,
`swarm_rewards`, `swarm_update`) is the `root_directory` passed to
`ComponentLoader::Add()` *and* the resource-path prefix in the grd. Change one
and you must change all three; `swarm/install_swarm_assets.py` holds the
mapping.

The per-file lists in the grd and in `BUILD.gn` are **generated from the
folders on disk** by `swarm/devutils/make_swarm_patches.py`, not typed out.
The wallet and rewards extensions are maintained in their own repository and
copied in, so a hand-written list would go stale the first time either gained
a file — and quietly: the browser would build and then fail to find a script
at runtime. That is 59 files: 22 wallet, 16 rewards and 21 update.
`check_syntax.py`, given a prepared tree, compares each folder with its grd
entries, its `BUILD.gn` inputs and its copy in the tree, file for file; the
one file allowed to differ is SWARM Update's stamped `version.json`.

### Build 5: SWARM Start, first run, pins, logos, strings, colour, names

**SWARM Start** (`swarm/extensions/start`, id `fopmngfcphleeiffnfhhahdhafgimnei`;
its key was generated on 2026-09-28 at `D:/swarm-work/keys/swarm-start.pem`,
outside the tree) is the fourth component extension, bundled exactly like the
other three:

* `chrome_url_overrides.newtab` -> `newtab.html`: the SWARM start page. A
  drawn background (gradient and the site's comb pattern, with a slow drift
  that stops under `prefers-reduced-motion` or when switched off), the SWARM
  mark, a search box (`lib/query.js` decides address or search; searches go
  to `chrome.search.query`, the browser's default engine), seven SWARM
  shortcuts (`lib/destinations.js`; FUEL is left out on purpose, it is a
  separate brand; the Market is labelled testnet), and three tiles: the
  wallet (opens the wallet's own popup page, see below), "7 privacy switches
  on" with a plain list (`privacy.html`, `lib/privacy.js`, whose test checks
  every entry against `swarm-privacy-defaults.patch`), and "Network now",
  OFF by default: nothing is fetched until the person turns it on, then two
  GETs per new tab to `lwd-main.swarm.green/status.json` and
  `swarm.green/data/swarm-map-live.json` (`credentials: "omit"`, no referrer;
  SWARM mainnet only, `lib/format.js`). The three switches are kept in
  `chrome.storage.local` (`startSettings`).
* `side_panel` + `action`: the SWARM Navigator. The toolbar button (the mark
  in amber on transparency, so it is not mistaken for the wallet's dark tile)
  opens the side panel (`setPanelBehavior({openPanelOnActionClick: true})`
  in `background.js`).
* `welcome.html`: the first-run page (below).
* Permissions `storage`, `sidePanel`, `search`; host permissions for the two
  status files only; CSP `connect-src https://lwd-main.swarm.green
  https://swarm.green`; nothing web-accessible, no content script, no
  `externally_connectable`.

**The wallet and SWARM Update are opened, never talked to.** Neither exposes
a messaging contract to another extension: the wallet's
`externally_connectable` lists only SWARM Rewards, and its
`onMessageExternal` answers Rewards about the receive address and nothing
else; SWARM Update answers its own pages only. SWARM Start therefore opens
their own `popup.html` in a small window (`chrome.windows.create`, a
browser-initiated navigation that `extension_navigation_throttle.cc` allows to
another extension's page without that page being web-accessible) and shows no
balance or block height of its own.

**`swarm-first-run.patch`.** ungoogled-chromium's `first-run-page.patch` adds
`AddFirstRunTabs({GURL("chrome://ungoogled-first-run")})` to
`chrome_browser_main.cc` and a WebUI page in `ungoogled_first_run.h`. The
SWARM patch, applied after it, points the first-run tab at
`chrome-extension://fopmngfcphleeiffnfhhahdhafgimnei/welcome.html`, turns the
ungoogled page (still reachable by typing its address) into a short SWARM page
that forwards there (the navigation throttle allows `chrome://` pages to open
extension pages), and removes its host from the list `chrome://chrome-urls`
shows and the address bar suggests. A redirect rather than new WebUI content,
so the welcome text lives once, with the other SWARM pages, in the extension.

**`swarm-toolbar-pins.patch`.** The toolbar shows an extension's button only
when its id is in `extensions.pinned_extensions`, and
`ExtensionPrefs::GetPinnedExtensions()` reads only a user-set value, so a
registered default would be ignored. The patch returns the Navigator's and
the wallet's ids while the person has never pinned or unpinned anything; the
first pin, unpin or move writes the full list, and the person's own list rules
from then on.

**UI logos (`render_ui_logos.py`, `brand/tree/`, `swarm-ui-logos.patch`).**
The owner's 2026-09-30 screenshot of Settings showed the Chromium logo in the
header and beside "About". Files replaced; `install_swarm_assets.py` fails if
any destination no longer exists upstream:

| Tree path | What draws it |
| --- | --- |
| `chrome/app/theme/default_{100,200}_percent/chromium/product_logo_{16,32}.png` | `chrome://theme/current-channel-logo` (IDR_PRODUCT_LOGO_32): the Settings, Extensions, History and Downloads headers and the About page |
| `.../product_logo_name_22{,_white}.png` | IDR_PRODUCT_LOGO_NAME_22: the name logo (SWARM lockup) |
| `components/resources/default_{100,200}_percent/chromium/product_logo{,_white}.png` | the components' product logo (SWARM lockup) |
| `components/resources/default_{100,200}_percent/chromium/favicon_product.png` | the tab icon of chrome:// pages |
| `ui/webui/resources/images/chrome_logo_dark.svg` | the same headers in dark mode |
| `chrome/app/theme/chromium/product_logo{,_animation}.svg` | IDR_PRODUCT_LOGO_SVG and _ANIMATION_SVG |
| `chrome/installer/mini_installer/mini_installer.ico`, `chrome/installer/setup/setup.ico` | the installer's and setup.exe's own icons |

The glyph beside "About" is an inline iconset entry, `cr:chrome-product` and
`settings20:chrome-product` (two in `cr_elements/icons.html.ts`, two in
`settings/icons.html.ts`); `swarm-ui-logos.patch` replaces the four with the
monochrome mark read from `extensions/start/icons.svg`. Left as they are:
`chrome/browser/resources/intro/images/refresh_showcase_illustration_chromium.png`
(the sign-in intro, unreachable without Google sign-in) and the Web Store icons.

**UI strings (`ui_strings.py`).** The same mechanism as `product_strings.py`,
over `generated_resources.grd`, `components_strings.grd`,
`components_chromium_strings.grd`, `ui_strings.grd`, `app_locale_settings.grd`
and their parts (the ChromeOS, Android, omnibox-pedal-synonym and glic parts
are skipped). On the 153 tree: 276 x Chrome and 89 x Chromium -> SWARM
Browser, and five messages set by name: `IDS_SETTINGS_PEOPLE` "You and your
browser", `IDS_SETTINGS_GOOGLE_SERVICES_PAGE_TITLE` "Other services",
`IDS_VERSION_UI_OFFICIAL` / `_UNOFFICIAL` "Official Build" / "Developer Build"
(ungoogled's patch had appended ", ungoogled-chromium"), and
`IDS_SETTINGS_SIDE_PANEL_ALIGNMENT_CHROME_PANELS` "Browser panels". "Chromium"
stays where it names the upstream project truthfully (the Authors, "Based on
Chromium", "the Chromium open source project", "Chromium developers");
"Chrome" stays where it names something else (Web Store, ChromeOS, Chrome
apps, Enterprise, Remote Desktop, "Google Chrome") and in sentences about a
Google service (sign-in, sync, Gmail, Safe Browsing), which describe Google's
feature. "Google" is never replaced by a rule: what is left names Google or one
of its products as a third party. Test: `python swarm/tests/brand/test_ui_strings.py`.
Not reached by any grd rule: the descriptions on `chrome://flags`, which are
C++ literals (`flag_descriptions.cc` and ungoogled's own flag patches).

**Colour (`swarm-default-colour.patch`).** The default of `prefs::kUserColor`
becomes SWARM honey `#F5A623` (it was transparent, meaning Chromium's blue
baseline) and `kBrowserColorVariant` tonal spot, so the browser's colour
scheme is generated from amber. It stays an ordinary preference: the person can
pick another colour, and "reset to default" returns to amber.

**Names (`swarm-ui-names.patch`).** `chrome://chrome-urls` writes its title
and heading as literals in its page files; they become "SWARM Browser pages".

### `swarm-installer-host.patch` (1 file, 1 hunk)

`chrome/installer/mini_installer/chrome.release` is the list of files the
installer packs, each named relative to the build output directory and mapped
to a folder of the installation: `%(ChromeDir)s` is the application directory,
`%(VersionDir)s` the version directory beside it. The patch adds one entry at
the end of `[GENERAL]`, under a `# SWARM` comment:

```
swarm\hosts\*.*: %(VersionDir)s\swarm\hosts\
```

so the three host files land in `<install dir>\<version>\swarm\hosts\`, next to
`chrome.dll` — the first folder `FindSwarmBundledManifest` tries.

**The list is read at ninja time, not at packaging time.** The `mini_installer`
target (`chrome/installer/mini_installer/BUILD.gn`, action
`mini_installer_archive`) runs `chrome/tools/build/win/create_installer_archive.py`,
which copies what `chrome.release` lists into a staging folder and compresses it
into the `chrome.packed.7z` resource of `mini_installer.exe`. By the time
`package.py` runs, the installer is finished. That is why `build.py` copies the
host into `out/Default/swarm/hosts/` right before ninja; `package.py`'s call
alone reaches only the zip.

**A build without the host still builds its installer.** `create_installer_archive.py`
treats every entry, wildcard or plain file name, the same way: it globs it
(`insensiglob` in `CopySectionFilesToStagingDir`), copies whatever matches and
skips an entry that matches nothing, without an error (only `--verbose` prints
"No matches found"). With no `host-dist` — CI today — the entry is empty and
the installer ships without a bundled host. A wildcard rather than the three
names follows the upstream `Extensions\*.*` entry and needs no edit if the host
gains a file. The archive step writes a depfile listing every file it packed,
so a changed host file makes ninja pack the installer again; that is why
`install_bundled_host()` leaves files that are already up to date alone.

**Install, update, uninstall.** `setup.exe` moves the whole version directory
into place (`AddMoveTreeWorkItem` in `chrome/installer/setup/install_worker.cc`),
so the host arrives with it. After an update the old version directory is
removed by `DeleteOldVersions` (`chrome/installer/util/delete_old_versions.cc`),
host included; that function leaves a version alone while any `.exe` or `.dll`
anywhere in its directory is in use, which now includes a running
`swarm-wallet-host.exe`, and it is retried later. Uninstalling runs
`DeleteChromeFilesAndFolders` (`chrome/installer/setup/uninstall.cc`), which
deletes every file and folder under the install directory except the running
`setup.exe`'s own `Installer` folder, so the host goes with the rest.
Installing the host writes nothing outside the install directory and nothing to
the registry.

**Size.** The host adds about 161 MB to the version directory before the
installer's LZMA compression (`swarm-wallet-host.exe` 83 MB, `native.node`
78 MB).

## The bundled wallet host (`swarm/hosts/`)

`swarm/hosts/` never appears in this repository, and that is the point: its
three files are **build outputs**, not sources. `install_swarm_assets.py`
copies them into the build output directory, `build.py` calls it right before
ninja so the installer can pack them, and `package.py` calls it again before
the zip is written.

| | |
| --- | --- |
| Source of the files | `D:/swarm-work/host-dist` (`DEFAULT_HOST_DIST`, overridable with `--host-dist`) |
| Destination | `<build output>/swarm/hosts/` — i.e. `build/src/out/Default/swarm/hosts/` |
| In the portable zip | `SWARM-Browser-…-win-x64\swarm\hosts\`, beside `chrome.exe` and `chrome.dll` |
| In an installation | `<install dir>\<version>\swarm\hosts\`, beside `chrome.dll` |
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

**It is idempotent.** `build.py` calls it before every ninja run and
`package.py` again before packaging; a file whose content is already in place
is left alone (reported as "up to date"), so its timestamp does not make ninja
pack the installer again.

**What reaches which artifact.** Both, whenever `host-dist` exists when the
browser is built:

| Artifact | How the host gets in | Where it lands |
| --- | --- | --- |
| Installer `SWARM-Browser-…-win-x64.exe` | `build.py` copies it into `out/Default/swarm/hosts/` before ninja; `swarm-installer-host.patch` lists it in `chrome.release`, which the `mini_installer` target packs at ninja time | `<install dir>\<version>\swarm\hosts\` |
| Portable `SWARM-Browser-…-win-x64.zip` | `package.py` hands `install_bundled_host()`'s paths to `filescfg.create_archive` next to upstream's `FILES.cfg` list | `SWARM-Browser-…-win-x64\swarm\hosts\`, beside `chrome.exe` |

Where there is no `host-dist` — **every CI build today**, because the host is
built only on this PC — neither artifact carries the host, the build does not
fail, and the browser falls back to the registry path (it needs the wallet's
own installer). Building the host in CI is the remaining half of this task.
An x86 or arm64 build made on a machine with `host-dist` would carry the same
x64 host; only x64 is a release target.

Locally built at the time of writing (`D:/swarm-work/host-dist/SHA256SUMS.txt`):

```
692b798bc05f6ec43b4678a93daeb5477b73db410aa4505e99e4b41fe7192ec7  swarm-wallet-host.exe
2dcd84bb378c127723f9eae3862d2d4fbe67e3333d2ceac6fd0b7d0c806bb912  native.node
ccb707f2fb22dd7444d469dd284299fddb79b6dab7efd53a18a3df96e7b05887  green.swarm.wallet_host.json
```

Those are one machine's outputs, not a release: CI has never built the host,
and nothing here is signed. (The manifest inside the build output differs from
the one in `host-dist` by its rewritten `path`.)

## Where the extensions come from

SWARM Update is written here: `swarm/extensions/update`, with its tests in
`swarm/tests/update` (outside the folder, which ships as it stands) and its
tools in `swarm/updates`. See **The update channel** below.

SWARM Wallet and SWARM Rewards are not written here. Both are copies from the
wallet repository, which is where they are developed and tested:

| | |
| --- | --- |
| Repository | `privacy-wallet-browser` (`D:/swarm-work/privacy-wallet-browser` locally) |
| Branch | `codex/browser-wallet-host` |
| Commit | `79c0c0391d21776714fabae863afcb10ca989b46` (2026-09-27) |
| `browser/extension` | -> `swarm/extensions/wallet`, 22 files |
| `browser/rewards-extension` | -> `swarm/extensions/rewards`, 16 files |
| Left behind | `test/`, `package.json`, `node_modules` |

`test/` and `package.json` exist only so the pure modules (the QR encoder, the
sender, the rewards ledger and link) can run under `node --test` outside a
browser. They are the extensions' own test suites and they belong over there;
shipping them would put dead files in the pak.

Re-copying after either extension changes upstream is: copy the folder, drop
those three, re-run `make_swarm_patches.py` (which reads the file lists off
disk, so new files need no edit here) and `install_swarm_assets.py`.

**The `key` in each `manifest.json` must survive the copy.** It does, and the
two extensions check each other: each names the other's id in
`externally_connectable`, which is how the wallet and the rewards counter talk,
so a wrong key would break that link and not just the id. Both are recomputed
from the copied manifests after every copy:

* wallet `gmmgmodmgnigcgboccjelpgedejejfap` — also what the native messaging
  host manifest (`browser/install/green.swarm.wallet_host.json` over there)
  names in `allowed_origins`
* rewards `gjmgdanakkpkgpmecnecoliifonlapnb`

One file in the wallet, `icons/swarm-mark.svg`, is referenced by nothing; it is
copied because the rule here is to take the folder as it stands rather than to
curate it, and its absence would be the kind of difference that is hard to
explain later.

## Extension ids

Fixed by the `key` field (base64 DER SubjectPublicKeyInfo) in each
`manifest.json`. The id is the first 16 bytes of `SHA256(DER public key)` with
each hex nibble mapped `0-f` to `a-p` (Chromium `crx_file/id_util.cc`).

| Extension | Folder | Id |
| --- | --- | --- |
| SWARM Wallet | `swarm/extensions/wallet` -> `swarm_wallet` | `gmmgmodmgnigcgboccjelpgedejejfap` |
| SWARM Rewards | `swarm/extensions/rewards` -> `swarm_rewards` | `gjmgdanakkpkgpmecnecoliifonlapnb` |
| SWARM Update | `swarm/extensions/update` -> `swarm_update` | `locbhnoahhmjhcjpndjmnfmnfekhdode` |
| SWARM Start | `swarm/extensions/start` -> `swarm_start` | `fopmngfcphleeiffnfhhahdhafgimnei` |

The wallet id is what the native messaging host manifest must list in
`allowed_origins` as `chrome-extension://gmmgmodmgnigcgboccjelpgedejejfap/`.

**The matching private keys are not in this repository.** They were generated
locally and left outside the tree (`D:/swarm-work/keys/swarm-wallet.pem`,
`swarm-rewards.pem`, `swarm-update.pem`, `swarm-start.pem`, each RSA 2048 from `openssl genrsa`);
only the public key is needed to build, and a component extension is never
signed into a `.crx`. If the owner ever wants to publish an extension to a
store, generate the store key there and expect a different id.

These are the keys that fix the extension *ids*. The key that signs the
*update feed* is a different thing, Ed25519, and has its own section below.

The folder path, the `key` and therefore the id must not change when the wallet
is re-copied from its own repository.

## The update channel (SWARM Update)

v0 policy, from `docs/SWARM-BROWSER-PLAN.md` Layer 5: **check daily, offer the
installer, no silent download, no auto-install.** The full description, the
feed format and the owner's release steps are in `swarm/updates/README.md`.

* Once a day (`chrome.alarms`; the first check a few minutes after first
  start) the service worker fetches `https://swarm.green/browser/updates.json`
  with `credentials: "omit"`, `cache: "no-store"`, no referrer, no query
  string and `Accept-Language: *`. Host permission and CSP `connect-src`:
  `https://swarm.green` only. Permissions: `alarms`, `notifications`,
  `storage`. No `downloads`, no `tabs`, no content script.
* The feed is `{"format":1,"payload":"<base64>","signature":"<base64>"}`, an
  Ed25519 signature over exactly the payload bytes, checked with WebCrypto
  against the public key(s) in `swarm/extensions/update/lib/feed-key.js`
  before a byte of the payload is read. Refused: unsigned, tampered, signed by
  another key, malformed, a `published` time earlier than the last accepted
  one (rollback), an offer older than the running build (downgrade), a link
  outside `https://github.com/Swarm-Official/` and `https://swarm.green/`.
* A newer build means a notification, a badge on the toolbar icon and
  `update.html`: the version, the download links, the SHA-256 to compare, the
  sentence that nothing was downloaded and nothing will install itself, and
  "Remind me tomorrow". The popup shows "You are on the latest version" /
  "Checked <time>" / the offer.
* The running build is `swarm_update/version.json`: the committed file is the
  placeholder `{"chromium":"0.0.0.0","swarm":"0","channel":"dev"}`, and
  `install_swarm_assets.py` stamps the tree's copy from
  `ungoogled-chromium/chromium_version.txt` and `swarm/revision.txt` with
  channel `release`. Only a `dev` copy may be pointed at another
  `https://swarm.green/...` feed address (for the smoke test).

**Verified in the Chromium 153.0.8010.52 tree**, since the extension depends
on all three:

* WebCrypto Ed25519 is on by default: `normalize_algorithm.cc` gates only
  ChaCha20-Poly1305, ML-DSA and ML-KEM behind `WebCryptoPQC`, and
  `components/webcrypto/algorithm_registry.cc` registers Ed25519
  unconditionally. No ungoogled or Windows patch touches WebCrypto.
* Reading `version.json` from the extension's own package works under
  `connect-src https://swarm.green`: `chrome/common/chrome_content_client.cc`
  registers `chrome-extension:` as a CSP-bypassing scheme.
* `chrome.runtime.getPlatformInfo()` reports the architecture the browser was
  compiled for (`components/update_client/update_query_params.cc`), so the x64
  build asks for the `windows-x64` entry.

**The feed key baked in today is a development key** (`dev-2026-09-27`,
private half at `D:/swarm-work/keys/update-feed-dev.pem`). Every
`install_swarm_assets.py` run prints a warning while that is so. Before any
public release the owner makes the production key on their own machine
(`node swarm/updates/gen-key.mjs --out <outside every repository>
--label release-<date> --write-extension-key`, commit the changed
`feed-key.js`) and publishes the signed feed as one static file,
`browser/updates.json` in the website repository. Today that address
answers 404, which the popup reports as "SWARM has not published an update
list yet."

Tests: `node --test "swarm/tests/update/*.test.mjs"` (99, no network) and
`node swarm/tests/update/smoke-edge.mjs` (Edge with a disposable profile,
34 checks; screenshots `D:/swarm-work/smoke/05-update-*`).

## Product strings (`swarm/brand/product_strings.py`)

The BRANDING file only renames the installer, the app identity and the profile
folder. Every sentence the user reads -- "About Chromium", the window title
"<page> - Chromium", "Chromium is up to date" -- lives in
`chrome/app/chromium_strings.grd`: 748 whole-word uses of "Chromium" in
Chromium 153. The 2026-09-29 local build showed exactly that gap: chrome://version
and Settings still said Chromium.

A unified diff of that many hunks would break at every rebase, so the layer
rewrites the file at asset-install time instead, the way ungoogled-chromium's
domain substitution rewrites sources. `install_swarm_assets.py --source-tree`
calls `rewrite_strings()` after the icons and extensions. Rules:

* only message TEXT lines change; `<message ... desc="...">` declarations,
  XML comments and translator notes stay, so the message names and the
  generated `IDS_*` header are unchanged and nothing recompiles;
* whole word `Chromium` -> `SWARM Browser`; `ChromiumOS` is one token and
  untouched; `Chromium Authors` and `Based on Chromium` are protected;
* the about pages get an explicit company name (`Swarm`) and the same
  notice the BRANDING file carries: *Copyright <year> Swarm. Based on
  Chromium, Copyright <year> The Chromium Authors. All rights reserved.*;
* the grd declares `fallback_to_english="true"`, so the 81 `.xtb`
  translation files are left alone and other locales fall back to the
  English text for the changed messages.

Idempotent (a second run reports 0 replacements). Unit test:
`python swarm/tests/brand/test_product_strings.py`. On the 153 tree the run
reports 595 replacements, 2 about-page messages set, 157 protected or
skipped uses kept.

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

**What has run.** The repository is `Swarm-Official/swarm-browser`, branch
`swarm-main`. At the time of writing (2026-09-27, 20:47 UTC) run
`36287323142` is build 1, of `8996a54`, in progress, and run `36336652588`
is build 2, of `84c2870`, pending; both were dispatched by hand. A full
staged x64 build takes about 46 hours: ten real stages (upstream's last
green run needed ten; stages 11–16 pass straight through), each about
4.5 hours with the artifact hand-off.

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
patched `.grd` files and the installed manifests too, and read the patched
`chrome.release` with the installer's own `Readconfig()` (imported from that
tree's `create_installer_archive.py`) to check where `swarm\hosts\*.*` lands:

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

The generator needs the tree as it is after the two upstream series and
*before* the SWARM series; a verify tree has all three applied. Without a
second extraction: copy the target files out of a verify tree into a scratch
tree, reverse the SWARM series there (`patch -p1 --reverse --fuzz=0`, last
patch first), and run the generator on that copy *unchanged* first — it must
reproduce every committed patch byte for byte before you change anything. That
is how revision 2 was regenerated.

## Rebasing onto the next upstream tag

1. `git fetch upstream && git merge <new tag>` — conflicts should be limited to
   the six `# SWARM` hooks in `build.py` / `package.py`.
2. `git -C ungoogled-chromium checkout <matching ungoogled tag>`.
3. Re-prepare a tree (tarball, prune, both upstream series).
4. Apply `swarm/patches/series`. Every hunk that fails points at a file
   Chromium moved; the five patches touch 16 files, all listed above
   (`launch_context_win.cc` is touched by two of them, branding first).
5. Re-run `python swarm/brand/render_icons.py` and
   `python swarm/install_swarm_assets.py --source-tree build/src --dry-run`;
   the dry run fails loudly if an icon destination disappeared.
6. Re-check the verified facts in this file — the install-modes header, the
   native-messaging registry literal, and that the two IIDs in the header still
   match the `uuid()` lines in the two `.idl` files. All three are exactly the
   kind of thing Chromium moves between releases. For the bundled host, also
   that the installer still keeps `chrome.dll` in `%(VersionDir)s` (what
   `base::DIR_MODULE` finds) and that `create_installer_archive.py` still
   skips a `chrome.release` entry that matches nothing.
7. If either extension has moved on, re-copy it from the wallet repository
   (see **Where the extensions come from**) and recompute both ids. SWARM
   Update needs nothing here: its `version.json` is stamped from
   `chromium_version.txt` and `revision.txt` on every build.
8. Bump `swarm/revision.txt`. The update channel orders builds by Chromium
   version and then by this number, so a release that does not raise one of
   the two is invisible to installed browsers.
