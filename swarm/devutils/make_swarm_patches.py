#!/usr/bin/env python3
"""Author the SWARM patch series against the prepared (upstream-patched) tree.

Run AFTER prepare_tree.py has pruned the tree and applied both upstream series.
For every target file it applies the SWARM edits in memory, writes a unified
diff into swarm/patches/swarm/, and leaves the tree untouched, so that
`prepare_tree.py swarm` can then prove the series applies cleanly.
"""
import difflib
import sys
from pathlib import Path

# Repository root: swarm/devutils/<this file>
ROOT = Path(__file__).resolve().parents[2]
# The prepared tree: build/src, or a path given on the command line.
SRC = (Path(sys.argv[1]).resolve() if len(sys.argv) > 1
       else ROOT / 'build' / 'src')
OUT = ROOT / 'swarm' / 'patches' / 'swarm'

BRANDING_NEW = """COMPANY_FULLNAME=Swarm
COMPANY_SHORTNAME=Swarm
PRODUCT_FULLNAME=SWARM Browser
PRODUCT_SHORTNAME=SWARM Browser
PRODUCT_INSTALLER_FULLNAME=SWARM Browser Installer
PRODUCT_INSTALLER_SHORTNAME=SWARM Browser Installer
COPYRIGHT=Copyright @LASTCHANGE_YEAR@ Swarm. Based on Chromium, Copyright @LASTCHANGE_YEAR@ The Chromium Authors. All rights reserved.
MAC_BUNDLE_ID=green.swarm.browser
MAC_CREATOR_CODE=Cr24
MAC_TEAM_ID=
"""


def sub(text, old, new, path, count=1):
    """Replace and fail loudly if the anchor moved."""
    n = text.count(old)
    if n != count:
        raise SystemExit(
            f'{path}: expected {count} occurrence(s) of\n---\n{old}\n---\n'
            f'but found {n}. Upstream changed; update make_swarm_patches.py.')
    return text.replace(old, new)


# --------------------------------------------------------------- 1. branding
def edit_branding(files):
    files['chrome/app/theme/chromium/BRANDING'] = lambda _t: BRANDING_NEW


def edit_install_modes(text, path):
    text = sub(text,
               'inline constexpr wchar_t kCompanyPathName[] = L"";',
               'inline constexpr wchar_t kCompanyPathName[] = L"Swarm";',
               path)
    text = sub(text,
               'inline constexpr wchar_t kProductPathName[] = L"Chromium";',
               'inline constexpr wchar_t kProductPathName[] = L"SWARM Browser";',
               path)
    text = sub(text,
               'inline constexpr char kSafeBrowsingName[] = "chromium";',
               'inline constexpr char kSafeBrowsingName[] = "swarm";',
               path)
    text = sub(text,
               '        .base_app_name = L"Chromium",              // A distinct base_app_name.\n'
               '        .base_app_id = L"Chromium",                // A distinct base_app_id.\n'
               '        .browser_prog_id_prefix = L"ChromiumHTM",  // Browser ProgID prefix.\n'
               '        .browser_prog_id_description =\n'
               '            L"Chromium HTML Document",  // Browser ProgID description.\n'
               '        .direct_launch_url_scheme = "chromium",\n'
               '        .pdf_prog_id_prefix = L"ChromiumPDF",  // PDF ProgID prefix.\n'
               '        .pdf_prog_id_description =\n'
               '            L"Chromium PDF Document",  // PDF ProgID description.\n',
               '        .base_app_name = L"SWARM Browser",       // A distinct base_app_name.\n'
               '        .base_app_id = L"SWARMBrowser",          // A distinct base_app_id.\n'
               '        .browser_prog_id_prefix = L"SwarmHTM",   // Browser ProgID prefix.\n'
               '        .browser_prog_id_description =\n'
               '            L"SWARM Browser HTML Document",  // Browser ProgID description.\n'
               '        .direct_launch_url_scheme = "swarmbrowser",\n'
               '        .pdf_prog_id_prefix = L"SwarmPDF",  // PDF ProgID prefix.\n'
               '        .pdf_prog_id_description =\n'
               '            L"SWARM Browser PDF Document",  // PDF ProgID description.\n',
               path)
    return text


# SWARM's own COM/install identifiers, generated with uuid.uuid4() on
# 2026-09-26. Stock ungoogled-chromium ships Chromium's, so a SWARM install and
# a Chromium install would fight over the same Active Setup key, the same COM
# CLSIDs and the same AppContainer sandbox profile. Every one of these is a
# registry or COM identity the installer writes, so every one must be ours.
#
# The two IIDs are also TypeLib identities compiled into the .idl files, so
# they are changed in BOTH places (see edit_elevation_service_idl and
# edit_tracing_service_idl below). Changing only the header would leave the
# registered TypeLib describing an interface with a different IID.
SWARM_ACTIVE_SETUP_GUID = '{292B5E35-79C4-4443-B288-986C32D03F36}'
SWARM_TOAST_ACTIVATOR_CLSID = '9DF10883-3C81-4AE7-A330-62E0AC876D5C'
SWARM_ELEVATOR_CLSID = 'C26E8648-5605-4693-824C-5FF11F2F6E7B'
SWARM_ELEVATOR_IID = '3AB5A56A-0742-4028-A897-699CE55280BC'
SWARM_TRACING_CLSID = '4BB29995-9C49-465B-B9D2-19E04D7EE366'
SWARM_TRACING_IID = '7BC2EB3C-A034-4345-939D-348139AAC577'
# An AppContainer SID is an arbitrary S-1-15-2 value that Chromium hands to
# the sandbox verbatim (chrome_content_browser_client.cc appends a suffix).
# Sharing Chromium's would share the AppContainer profile under
# %LOCALAPPDATA%\Packages.
SWARM_SANDBOX_SID_PREFIX = ('S-1-15-2-2465972275-1438521111-4273585194-'
                            '3144023244-3347025105-')
# Chromium's IElevatorChromium, the v1 interface its elevation service also
# implements. Not registered by the installer, but still a Chromium COM
# identity that a SWARM build should not claim.
SWARM_ELEVATOR_V1_IID = '06042C9A-CD8B-4DA6-AB51-4B1D18A0BA10'


OLD_INSTALL_GUIDS = '        .active_setup_guid =\n            L"{7D2B3E1D-D096-4594-9D8F-A6667F12E0AC}",  // Active Setup\n                                                        // GUID.\n        .toast_activator_clsid = {0x635EFA6F,\n                                  0x08D6,\n                                  0x4EC9,\n                                  {0xBD, 0x14, 0x8A, 0x0F, 0xDE, 0x97, 0x51,\n                                   0x59}},  // Toast Activator CLSID.\n        .elevator_clsid = {0xD133B120,\n                           0x6DB4,\n                           0x4D6B,\n                           {0x8B, 0xFE, 0x83, 0xBF, 0x8C, 0xA1, 0xB1,\n                            0xB0}},  // Elevator CLSID.\n        .elevator_iid = {0xbb19a0e5,\n                         0xc6,\n                         0x4966,\n                         {0x94, 0xb2, 0x5a, 0xfe, 0xc6, 0xfe, 0xd9,\n                          0x3a}},  // IElevator IID and TypeLib\n        // {BB19A0E5-00C6-4966-94B2-5AFEC6FED93A}.\n        .old_elevator_iids = {},\n        .tracing_service_clsid = {0x83f69367,\n                                  0x442d,\n                                  0x447f,\n                                  {0x8b, 0xcc, 0x0e, 0x3f, 0x97, 0xbe, 0x9c,\n                                   0xf2}},  // SystemTraceSession CLSID.\n        .tracing_service_iid = {0xe0b03e2d,\n                                0x7682,\n                                0x4d83,\n                                {0xb9, 0xff, 0x45, 0x74, 0xaf, 0x72, 0x05,\n                                 0x00}},  // ISystemTraceSessionChromium IID and\n                                          // TypeLib\n        .old_tracing_service_iids = kOldTracingServiceIids,\n'

NEW_INSTALL_GUIDS = '        // SWARM: every identifier below is ours, not Chromium\'s. Stock\n        // ungoogled-chromium keeps Chromium\'s, so the two would collide\n        // on the same Active Setup key, the same COM CLSIDs and the same\n        // AppContainer sandbox profile if both were installed.\n        .active_setup_guid =\n            L"{292B5E35-79C4-4443-B288-986C32D03F36}",  // Active Setup\n                                                        // GUID.\n        .toast_activator_clsid = {0x9df10883,\n                                  0x3c81,\n                                  0x4ae7,\n                                  {0xa3, 0x30, 0x62, 0xe0, 0xac, 0x87, 0x6d, 0x5c}},\n        // Toast Activator CLSID.\n        .elevator_clsid = {0xc26e8648,\n                           0x5605,\n                           0x4693,\n                           {0x82, 0x4c, 0x5f, 0xf1, 0x1f, 0x2f, 0x6e, 0x7b}},\n        // Elevator CLSID.\n        .elevator_iid = {0x3ab5a56a,\n                         0x0742,\n                         0x4028,\n                         {0xa8, 0x97, 0x69, 0x9c, 0xe5, 0x52, 0x80, 0xbc}},\n        // IElevator2Chromium IID and TypeLib. Kept in sync with\n        // the uuid() in chrome/elevation_service/elevation_service_idl.idl.\n        .old_elevator_iids = {},\n        .tracing_service_clsid = {0x4bb29995,\n                                  0x9c49,\n                                  0x465b,\n                                  {0xb9, 0xd2, 0x19, 0xe0, 0x4d, 0x7e, 0xe3, 0x66}},\n        // SystemTraceSession CLSID.\n        .tracing_service_iid = {0x7bc2eb3c,\n                                0xa034,\n                                0x4345,\n                                {0x93, 0x9d, 0x34, 0x81, 0x39, 0xaa, 0xc5, 0x77}},\n        // ISystemTraceSessionChromium IID and TypeLib. Kept in sync\n        // with the uuid() in chrome/windows_services/\n        // elevated_tracing_service/tracing_service_idl.idl.\n        // SWARM has never shipped, so there is no retired IID to clean\n        // up. Keeping Chromium\'s here would make a SWARM install or\n        // uninstall delete a Chromium install\'s registration.\n        .old_tracing_service_iids = {},\n'

OLD_TRACING_IID_ARRAY = 'inline constexpr auto kOldTracingServiceIids = std::to_array<IID>({\n    // Replaced in 2026-09. Delete after 2028-09.\n    // {A3FD580A-FFD4-4075-9174-75D0B199D3CB}\n    {0xa3fd580a,\n     0xffd4,\n     0x4075,\n     {0x91, 0x74, 0x75, 0xd0, 0xb1, 0x99, 0xd3, 0xcb}},\n});\n'

NEW_TRACING_IID_ARRAY = "// SWARM: Chromium's retired tracing IID is deliberately not carried over;\n// see .old_tracing_service_iids below.\n"


OLD_SANDBOX_SID = '        .sandbox_sid_prefix =\n            L"S-1-15-2-3251537155-1984446955-2931258699-841473695-"\n            L"1938553385-"\n            L"924012148-",  // App container sid prefix for sandbox.\n'

NEW_SANDBOX_SID = '        .sandbox_sid_prefix =\n            L"SWARM_SID_PLACEHOLDER",  // SWARM app container sid prefix.\n'


def edit_install_modes_guids(text, path):
    """Give SWARM its own COM, Active Setup and sandbox identities."""
    text = sub(text, OLD_INSTALL_GUIDS, NEW_INSTALL_GUIDS, path)
    text = sub(text, OLD_TRACING_IID_ARRAY, NEW_TRACING_IID_ARRAY, path)
    text = sub(text, OLD_SANDBOX_SID,
               NEW_SANDBOX_SID.replace("SWARM_SID_PLACEHOLDER",
                                       SWARM_SANDBOX_SID_PREFIX),
               path)
    return text


ELEVATOR_V1_OLD = '[\n  object,\n  oleautomation,\n  uuid(B88C45B9-8825-4629-B83E-77CC67D9CEED),\n  helpstring("IElevatorChromium Interface"),\n'

ELEVATOR_V2_OLD = '[\n  object,\n  oleautomation,\n  uuid(BB19A0E5-00C6-4966-94B2-5AFEC6FED93A),\n  helpstring("IElevator2Chromium Interface"),\n'

TRACING_OLD = '[\n  object,\n  oleautomation,\n  uuid(E0B03E2D-7682-4D83-B9FF-4574AF720500),\n  helpstring("ISystemTraceSessionChromium Interface"),\n'


def edit_elevation_service_idl(text, path):
    """Give SWARM's flavour of IElevator its own interface identity.

    Chromium gives every flavour (Chromium, Chrome, Beta, Dev, Canary)
    its own IID of the same interface precisely so the flavours can
    co-exist -- the file says so itself. SWARM is a flavour, so it gets
    its own.
    """
    text = sub(text, ELEVATOR_V1_OLD,
               '// SWARM: SWARM is a flavour of Chromium and gets its own interface\n// identity, exactly as Chrome, Beta, Dev and Canary each do above.\n[\n  object,\n  oleautomation,\n  uuid(%s),\n  helpstring("IElevatorChromium Interface"),\n' % SWARM_ELEVATOR_V1_IID, path)
    text = sub(text, ELEVATOR_V2_OLD,
               '// SWARM: this uuid must equal .elevator_iid in\n// chrome/install_static/chromium_install_modes.h, because the\n// installer registers that IID as this interface\'s TypeLib.\n[\n  object,\n  oleautomation,\n  uuid(%s),\n  helpstring("IElevator2Chromium Interface"),\n' % SWARM_ELEVATOR_IID, path)
    return text


def edit_tracing_service_idl(text, path):
    """Same for the elevated tracing service's per-flavour interface."""
    return sub(text, TRACING_OLD,
               '// SWARM: this uuid must equal .tracing_service_iid in\n// chrome/install_static/chromium_install_modes.h, because the\n// installer registers that IID as this interface\'s TypeLib.\n[\n  object,\n  oleautomation,\n  uuid(%s),\n  helpstring("ISystemTraceSessionChromium Interface"),\n' % SWARM_TRACING_IID, path)


def edit_launch_context_win(text, path):
    # Verified in Chromium 153.0.8010.52: the native-messaging registry key is a
    # hardcoded literal here, NOT derived from install_static. Patching
    # kProductPathName alone would leave the key at SOFTWARE\Chromium.
    return sub(text,
               '  static constexpr wchar_t kChromiumNativeMessagingRegistryKey[] =\n'
               '      L"SOFTWARE\\\\Chromium\\\\NativeMessagingHosts";',
               '  // SWARM: keep this in sync with kCompanyPathName and\n'
               '  // kProductPathName in chrome/install_static/chromium_install_modes.h,\n'
               '  // which give install_static::GetRegistryPath() the same prefix.\n'
               '  static constexpr wchar_t kChromiumNativeMessagingRegistryKey[] =\n'
               '      L"SOFTWARE\\\\Swarm\\\\SWARM Browser\\\\NativeMessagingHosts";',
               path)


# ------------------------------------------------- 1b. bundled native hosts
# A second, separate patch on the same file. It is its own patch because it is
# a different decision from the branding one: branding renames the registry key
# SWARM reads, this one lets SWARM find a host that is not in the registry at
# all. The two hunks sit far apart in the file, so applying them in series
# costs GNU patch nothing but a line offset.
#
# Two folders are tried, base::DIR_MODULE first. The installer
# (swarm-installer-host.patch) puts the host in the version directory, next to
# chrome.dll; in the portable zip everything is one flat folder, where
# DIR_MODULE and DIR_EXE are the same. DIR_EXE stays second, so a host placed
# next to chrome.exe is still found.
SWARM_BUNDLED_HOST_HELPER = '''// SWARM: the manifest of a native messaging host shipped inside the SWARM
// Browser package. Such a host has no installer of its own, so nothing writes
// it to the registry; it is one of the browser's own files, looked up in
//   1. <directory of chrome.dll>\\swarm\\hosts\\<host name>.json (DIR_MODULE),
//   2. <directory of chrome.exe>\\swarm\\hosts\\<host name>.json (DIR_EXE).
// An installed browser keeps chrome.exe in the application directory and
// everything else, the bundled host included, in the version directory beside
// it, where chrome.dll is -- the directory Chromium also finds its own
// Extensions folder in (chrome::DIR_EXTERNAL_EXTENSIONS). In the portable zip
// both are the same folder.
//
// The host name arrives from an extension, so it is checked against the
// character set Chromium's own host names use before it is ever turned into a
// path: here a name becomes a file name, and it must not be able to become a
// directory traversal.
base::FilePath FindSwarmBundledManifest(const std::string& host_name) {
  if (host_name.empty() ||
      host_name.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789._") !=
          std::string::npos ||
      host_name.find("..") != std::string::npos) {
    return base::FilePath();
  }
  // <dir>\\swarm\\hosts\\<host name>.json, or empty if there is no such file.
  auto manifest_in = [&host_name](int dir_key) -> base::FilePath {
    base::FilePath dir;
    if (!base::PathService::Get(dir_key, &dir)) {
      return base::FilePath();
    }
    base::FilePath candidate = dir.Append(FILE_PATH_LITERAL("swarm"))
                                   .Append(FILE_PATH_LITERAL("hosts"))
                                   .AppendASCII(host_name + ".json");
    return base::PathExists(candidate) ? candidate : base::FilePath();
  };
  base::FilePath manifest_path = manifest_in(base::DIR_MODULE);
  if (manifest_path.empty()) {
    manifest_path = manifest_in(base::DIR_EXE);
  }
  return manifest_path;
}

'''


def edit_launch_context_win_bundled(text, path):
    """Look in the browser's own folders when the registry has no entry."""
    text = sub(text,
               '#include "base/files/file_path.h"\n',
               '#include "base/files/file_path.h"\n'
               '#include "base/files/file_util.h"  // SWARM\n',
               path)
    text = sub(text,
               '#include "base/numerics/safe_conversions.h"\n',
               '#include "base/numerics/safe_conversions.h"\n'
               '#include "base/path_service.h"  // SWARM\n',
               path)
    text = sub(text,
               '}  // namespace\n'
               '\n'
               '// static\n'
               'base::FilePath LaunchContext::FindManifest(',
               SWARM_BUNDLED_HOST_HELPER +
               '}  // namespace\n'
               '\n'
               '// static\n'
               'base::FilePath LaunchContext::FindManifest(',
               path)
    text = sub(text,
               '  if (!found) {\n'
               '    error_message =\n'
               '        "Native messaging host " + host_name + " is not registered.";\n'
               '    return base::FilePath();\n'
               '  }\n',
               '  if (!found) {\n'
               '    // SWARM: a host bundled with the browser needs no registry entry and\n'
               '    // no install step. The registry is still tried first, so a host the\n'
               '    // user installed overrides the bundled one.\n'
               '    base::FilePath swarm_bundled = FindSwarmBundledManifest(host_name);\n'
               '    if (!swarm_bundled.empty()) {\n'
               '      return swarm_bundled;\n'
               '    }\n'
               '    error_message =\n'
               '        "Native messaging host " + host_name + " is not registered.";\n'
               '    return base::FilePath();\n'
               '  }\n',
               path)
    return text


# -------------------------------------------------------- 2. privacy defaults
def edit_blink_features(text, path):
    text = sub(text,
               'BASE_FEATURE(kReducedSystemInfo, "ReducedSystemInfo", base::FEATURE_DISABLED_BY_DEFAULT);',
               'BASE_FEATURE(kReducedSystemInfo, "ReducedSystemInfo", base::FEATURE_ENABLED_BY_DEFAULT);',
               path)
    text = sub(text,
               'BASE_FEATURE(kRemoveClientHints, "RemoveClientHints", base::FEATURE_DISABLED_BY_DEFAULT);',
               'BASE_FEATURE(kRemoveClientHints, "RemoveClientHints", base::FEATURE_ENABLED_BY_DEFAULT);',
               path)
    return text


def edit_network_features(text, path):
    # kMinimalReferrers stays off: it strips same-origin referrers too and
    # breaks sites. Only cross-origin referrers are removed by default.
    return sub(text,
               'BASE_FEATURE(kNoCrossOriginReferrers,\n'
               '             "NoCrossOriginReferrers",\n'
               '             base::FEATURE_DISABLED_BY_DEFAULT);',
               'BASE_FEATURE(kNoCrossOriginReferrers,\n'
               '             "NoCrossOriginReferrers",\n'
               '             base::FEATURE_ENABLED_BY_DEFAULT);',
               path)


def edit_browser_ui_prefs(text, path):
    return sub(text,
               '  registry->RegisterBooleanPref(\n'
               '      prefs::kHttpsOnlyModeEnabled, false,\n'
               '      user_prefs::PrefRegistrySyncable::SYNCABLE_PREF);',
               '  // SWARM: HTTPS-First mode on by default. It stays a normal profile\n'
               '  // pref, so the user can still turn it off in Settings.\n'
               '  registry->RegisterBooleanPref(\n'
               '      prefs::kHttpsOnlyModeEnabled, true,\n'
               '      user_prefs::PrefRegistrySyncable::SYNCABLE_PREF);',
               path)


def edit_chrome_main_delegate(text, path):
    return sub(text,
               'std::optional<int> ChromeMainDelegate::BasicStartupComplete() {\n',
               'std::optional<int> ChromeMainDelegate::BasicStartupComplete() {\n'
               '  // SWARM: privacy defaults. Chromium has no "switch on by default"\n'
               '  // mechanism, so the SWARM defaults are appended at the earliest\n'
               '  // callback, before anything reads them, and only when the user has not\n'
               '  // set them. Chromium then maps them to prefs itself: see\n'
               '  // chrome/browser/prefs/chrome_command_line_pref_store.cc, which maps\n'
               '  // --no-pings to prefs::kEnableHyperlinkAuditing=false and\n'
               '  // --webrtc-ip-handling-policy to prefs::kWebRTCIPHandlingPolicy.\n'
               '  // --disable-search-engine-collection is read directly by the\n'
               '  // ungoogled-chromium patch of the same name.\n'
               '  // Canvas / client-rects / WebGL noise is deliberately NOT enabled\n'
               '  // here: it breaks ordinary sites and stays an opt-in flag.\n'
               '  {\n'
               '    base::CommandLine* swarm_command_line =\n'
               '        base::CommandLine::ForCurrentProcess();\n'
               '    if (!swarm_command_line->HasSwitch("no-pings")) {\n'
               '      swarm_command_line->AppendSwitch("no-pings");\n'
               '    }\n'
               '    if (!swarm_command_line->HasSwitch("webrtc-ip-handling-policy")) {\n'
               '      swarm_command_line->AppendSwitchASCII(\n'
               '          "webrtc-ip-handling-policy", "default_public_interface_only");\n'
               '    }\n'
               '    if (!swarm_command_line->HasSwitch(\n'
               '            "disable-search-engine-collection")) {\n'
               '      swarm_command_line->AppendSwitch(\n'
               '          "disable-search-engine-collection");\n'
               '    }\n'
               '  }\n',
               path)


# ---------------------------------------------------- 3. component extensions
def _extension_files(folder):
    """Every file in a bundled extension except its manifest, sorted.

    Read from disk rather than hardcoded: the wallet is maintained in its own
    repository and copied in, so a list written here would go stale the first
    time that extension gains a file. manifest.json is excluded because it is
    registered in browser_resources.grd, not in the component one.
    """
    root = ROOT / 'swarm' / 'extensions' / folder
    files = sorted(f.relative_to(root).as_posix() for f in root.rglob('*')
                   if f.is_file())
    missing = [f for f in files if f == 'manifest.json']
    if not missing:
        raise SystemExit(f'{root} has no manifest.json')
    return [f for f in files if f != 'manifest.json']


WALLET_FILES = _extension_files('wallet')
REWARDS_FILES = _extension_files('rewards')
UPDATE_FILES = _extension_files('update')
START_FILES = _extension_files('start')


def _idr(prefix, relpath):
    stem = relpath.replace('/', '_').replace('-', '_').replace('.', '_').upper()
    return f'IDR_{prefix}_{stem}'


def edit_browser_resources_grd(text, path):
    return sub(text,
               '      <include name="IDR_READING_MODE_GDOCS_HELPER_MANIFEST" file="resources\\reading_mode_gdocs_helper\\manifest.json" type="BINDATA" />\n',
               '      <include name="IDR_READING_MODE_GDOCS_HELPER_MANIFEST" file="resources\\reading_mode_gdocs_helper\\manifest.json" type="BINDATA" />\n'
               '\n'
               '      <!-- SWARM: the four bundled SWARM component extensions. The folders\n'
               '           are copied in by swarm/install_swarm_assets.py. -->\n'
               '      <include name="IDR_SWARM_WALLET_MANIFEST" file="resources\\swarm_wallet\\manifest.json" type="BINDATA" />\n'
               '      <include name="IDR_SWARM_REWARDS_MANIFEST" file="resources\\swarm_rewards\\manifest.json" type="BINDATA" />\n'
               '      <include name="IDR_SWARM_UPDATE_MANIFEST" file="resources\\swarm_update\\manifest.json" type="BINDATA" />\n'
               '      <include name="IDR_SWARM_START_MANIFEST" file="resources\\swarm_start\\manifest.json" type="BINDATA" />\n',
               path)


def edit_component_extension_resources_grd(text, path):
    lines = ['\n',
             '      <!-- SWARM: bundled SWARM Wallet, SWARM Rewards, SWARM Update and\n'
             '           SWARM Start extension files.\n'
             '           The resource path prefix must match the root_directory passed to\n'
             '           ComponentLoader::Add() in component_loader.cc. -->\n']
    for relpath in WALLET_FILES:
        lines.append(f'      <include name="{_idr("SWARM_WALLET", relpath)}" '
                     f'file="swarm_wallet/{relpath}" type="BINDATA" />\n')
    for relpath in REWARDS_FILES:
        lines.append(f'      <include name="{_idr("SWARM_REWARDS", relpath)}" '
                     f'file="swarm_rewards/{relpath}" type="BINDATA" />\n')
    for relpath in UPDATE_FILES:
        lines.append(f'      <include name="{_idr("SWARM_UPDATE", relpath)}" '
                     f'file="swarm_update/{relpath}" type="BINDATA" />\n')
    for relpath in START_FILES:
        lines.append(f'      <include name="{_idr("SWARM_START", relpath)}" '
                     f'file="swarm_start/{relpath}" type="BINDATA" />\n')
    anchor = ('      <include name="IDR_READING_MODE_GDOC_HELPER_GDOCS_SCRIPT_JS" '
              'file="reading_mode_gdocs_helper/gdocs_script.js" type="BINDATA" />\n')
    return sub(text, anchor, anchor + ''.join(lines), path)


def edit_resources_build_gn(text, path):
    inputs = ''.join(
        [f'      "swarm_wallet/{f}",\n' for f in ['manifest.json'] + WALLET_FILES] +
        [f'      "swarm_rewards/{f}",\n' for f in ['manifest.json'] + REWARDS_FILES] +
        [f'      "swarm_update/{f}",\n' for f in ['manifest.json'] + UPDATE_FILES] +
        [f'      "swarm_start/{f}",\n' for f in ['manifest.json'] + START_FILES])
    anchor = ('      "reading_mode_gdocs_helper/content.js",\n'
              '      "reading_mode_gdocs_helper/gdocs_script.js",\n')
    return sub(text, anchor,
               anchor + '      # SWARM: bundled SWARM extensions.\n' + inputs,
               path)


def edit_component_loader_h(text, path):
    return sub(text,
               '  void AddContextualTasksExtension();\n',
               '  void AddContextualTasksExtension();\n'
               '\n'
               '  // SWARM: the four bundled SWARM component extensions.\n'
               '  void AddSwarmExtensions();\n',
               path)


def edit_component_loader_cc(text, path):
    text = sub(text,
               'void ComponentLoader::AddWebStoreApp() {\n',
               '// SWARM: SWARM Wallet, SWARM Rewards, SWARM Update and SWARM Start are\n'
               '// bundled as component extensions. Their ids are fixed by the "key" field in their\n'
               '// manifests and are recorded in swarm/README.md. The folders under\n'
               '// chrome/browser/resources are put there by swarm/install_swarm_assets.py\n'
               '// and turned into resources by component_extension_resources.grd.\n'
               'void ComponentLoader::AddSwarmExtensions() {\n'
               '  Add(IDR_SWARM_WALLET_MANIFEST,\n'
               '      base::FilePath(FILE_PATH_LITERAL("swarm_wallet")));\n'
               '  Add(IDR_SWARM_REWARDS_MANIFEST,\n'
               '      base::FilePath(FILE_PATH_LITERAL("swarm_rewards")));\n'
               '  Add(IDR_SWARM_UPDATE_MANIFEST,\n'
               '      base::FilePath(FILE_PATH_LITERAL("swarm_update")));\n'
               '  // SWARM Start: the new-tab page, the SWARM Navigator side panel and\n'
               '  // the welcome page that swarm-first-run.patch opens on first start.\n'
               '  Add(IDR_SWARM_START_MANIFEST,\n'
               '      base::FilePath(FILE_PATH_LITERAL("swarm_start")));\n'
               '}\n'
               '\n'
               'void ComponentLoader::AddWebStoreApp() {\n',
               path)
    text = sub(text,
               '  if (should_disable_background_extensions) {\n'
               '    return;\n'
               '  }\n'
               '\n'
               '  if (!skip_session_components) {\n',
               '  if (should_disable_background_extensions) {\n'
               '    return;\n'
               '  }\n'
               '\n'
               '  if (!skip_session_components) {\n'
               '    // SWARM: bundled SWARM Wallet, Rewards, Update and Start.\n'
               '    AddSwarmExtensions();\n',
               path)
    return text


def edit_allowlist(text, path):
    return sub(text,
               '    case IDR_READING_MODE_GDOCS_HELPER_MANIFEST:\n'
               '    case IDR_WEBSTORE_MANIFEST:\n',
               '    case IDR_READING_MODE_GDOCS_HELPER_MANIFEST:\n'
               '    // SWARM: the four bundled SWARM component extensions.\n'
               '    case IDR_SWARM_REWARDS_MANIFEST:\n'
               '    case IDR_SWARM_START_MANIFEST:\n'
               '    case IDR_SWARM_UPDATE_MANIFEST:\n'
               '    case IDR_SWARM_WALLET_MANIFEST:\n'
               '    case IDR_WEBSTORE_MANIFEST:\n',
               path)


# ------------------------------------------ 4. the installer carries the host
# chrome/installer/mini_installer/chrome.release is the list of files the
# installer packs, relative to the build output directory. It is read at NINJA
# time: the mini_installer target runs
# chrome/tools/build/win/create_installer_archive.py, which globs every entry
# (CopySectionFilesToStagingDir). build.py therefore copies swarm/hosts/ into
# out/Default before ninja runs; package.py's copy would come too late.
#
# The entry is a wildcard, like Extensions\*.* above it. An entry that matches
# nothing is skipped without an error (a missing plain file name would be too;
# the wildcard is used because it needs no edit when the host gains a file), so
# a tree without the host -- CI today -- still builds its installer, only
# without a bundled wallet host.
#
# %(VersionDir)s is <install dir>\<version>\, next to chrome.dll, which is where
# FindSwarmBundledManifest looks first (base::DIR_MODULE). Uninstalling deletes
# everything under the install directory, the host included.
SWARM_INSTALLER_HOST_ENTRY = (
    '#\n'
    '# SWARM: the bundled SWARM Wallet native messaging host\n'
    '# (green.swarm.wallet_host.json, swarm-wallet-host.exe, native.node).\n'
    '# build.py copies it into swarm\\hosts\\ in the build output before ninja,\n'
    '# and the browser looks for it next to chrome.dll first. An entry that\n'
    '# matches nothing is skipped, so a build without the host still packs.\n'
    '#\n'
    'swarm\\hosts\\*.*: %(VersionDir)s\\swarm\\hosts\\\n')


def edit_chrome_release(text, path):
    """Pack <build output>/swarm/hosts/ into the installer's version dir."""
    return sub(text,
               '\n[HIDPI]\n',
               '\n' + SWARM_INSTALLER_HOST_ENTRY + '\n[HIDPI]\n',
               path)


# ------------------------------------------------------ 6. SWARM first run
# ungoogled-chromium's first-run-page.patch adds, in chrome_browser_main.cc,
#   browser_creator_->AddFirstRunTabs({GURL("chrome://ungoogled-first-run")});
# and a WebUI page of its own (chrome/browser/ui/webui/ungoogled_first_run.h).
# The upstream patch file is never edited; this patch, applied after both
# upstream series, changes the lines that patch left in the tree:
#   1. the first-run tab is SWARM Start's welcome page;
#   2. chrome://ungoogled-first-run, still reachable by typing it, now shows a
#      SWARM page that forwards to the same welcome page;
#   3. it is no longer suggested in the address bar nor listed on
#      chrome://chrome-urls.
# The route is a redirect rather than a WebUI page with SWARM content because
# the welcome page belongs with the rest of the SWARM pages (the Start
# extension): one copy of the text, the same fonts and styles, and no string
# compiled into C++.
SWARM_START_ID = 'fopmngfcphleeiffnfhhahdhafgimnei'
SWARM_WELCOME_URL = f'chrome-extension://{SWARM_START_ID}/welcome.html'

SWARM_FIRST_RUN_PAGE = f'''    std::string source = R"(
<!doctype html>
<title>Welcome to SWARM Browser</title>
<meta name="color-scheme" content="dark">
<meta http-equiv="refresh" content="0; url={SWARM_WELCOME_URL}">
<style>
 html{{background:#0E1116; color:#E6EDF3; font:15px/1.5 system-ui, sans-serif}}
 a{{color:#FFC94D}}
 p{{max-width:32em; margin:6em auto; padding:0 1em}}
</style>
<p>Opening the SWARM Browser welcome page.
 If it does not open, <a href="{SWARM_WELCOME_URL}">open it here</a>.
)";
'''


def edit_first_run_tab(text, path):
    return sub(text,
               '      browser_creator_->AddFirstRunTabs({GURL("chrome://ungoogled-first-run")});\n',
               '      // SWARM: the first-run tab is the SWARM welcome page (SWARM Start,\n'
               '      // a component extension), not ungoogled-chromium\'s page.\n'
               '      browser_creator_->AddFirstRunTabs({GURL(\n'
               f'          "{SWARM_WELCOME_URL}")}});\n',
               path)


def edit_first_run_page(text, path):
    start = text.index('    std::string source = R"(\n')
    end = text.index(')";\n', start) + len(')";\n')
    old = text[start:end]
    return sub(text, old,
               '    // SWARM: this page only forwards to the SWARM welcome page.\n'
               + SWARM_FIRST_RUN_PAGE, path)


def edit_chrome_url_hosts(text, path):
    return sub(text,
               '      "ungoogled-first-run",\n      kChromeUIAboutHost,\n',
               '      kChromeUIAboutHost,\n',
               path)


# ------------------------------------------------ 7. SWARM buttons pinned
# The toolbar shows an extension's button only when its id is in the profile
# pref extensions.pinned_extensions. ExtensionPrefs::GetPinnedExtensions()
# reads only a USER-set value (GetUserPrefValue), so a registered default
# would be ignored. Instead: while the person has never pinned or unpinned
# anything, the pinned list is the SWARM Navigator's button and the wallet.
# The first pin, unpin or move writes the full list (SetPinnedExtensions), and
# from then on the person's own list is the only one.
SWARM_WALLET_ID = 'gmmgmodmgnigcgboccjelpgedejejfap'


def edit_pinned_extensions(text, path):
    return sub(text,
               'ExtensionIdList ExtensionPrefs::GetPinnedExtensions() const {\n'
               '  ExtensionIdList id_list_out;\n'
               '  GetUserExtensionPrefIntoContainer(pref_names::kPinnedExtensions,\n'
               '                                    &id_list_out);\n'
               '  return id_list_out;\n'
               '}\n',
               'ExtensionIdList ExtensionPrefs::GetPinnedExtensions() const {\n'
               '  ExtensionIdList id_list_out;\n'
               '  if (!GetUserExtensionPrefIntoContainer(pref_names::kPinnedExtensions,\n'
               '                                         &id_list_out)) {\n'
               '    // SWARM: until the person pins or unpins anything, the SWARM\n'
               '    // Navigator (SWARM Start) and SWARM Wallet buttons are pinned.\n'
               '    // Ids that are not installed are skipped by the toolbar model.\n'
               f'    id_list_out = {{"{SWARM_START_ID}",\n'
               f'                   "{SWARM_WALLET_ID}"}};\n'
               '  }\n'
               '  return id_list_out;\n'
               '}\n',
               path)


# ------------------------------------------------------ 8. UI logos (G1)
# The About item in Settings and the Safety Hub card draw the product glyph
# from an inline icon, cr:chrome-product / settings20:chrome-product, which in
# Chromium 153 is the Chrome logo outline. Each <g id="chrome-product"> in the
# two icon sets becomes the SWARM mark (monochrome, currentColor), read from
# swarm/extensions/start/icons.svg so there is one copy of the drawing. The
# PNG and SVG logos (Settings header, favicons, ...) are files, not text, and
# are copied in by install_swarm_assets.py from swarm/brand/tree.
def _swarm_mark_paths():
    import re as _re
    sprite = (ROOT / 'swarm' / 'extensions' / 'start' / 'icons.svg').read_text(encoding='utf-8')
    symbol = _re.search(r'<symbol id="i-mark" [^>]*>(.*?)</symbol>', sprite, _re.S).group(1)
    return _re.findall(r' d="([^"]+)"', symbol)


def edit_chrome_product_icon(expected):
    import re as _re

    def edit(text, path):
        pattern = _re.compile(r'<g id="chrome-product"[^>]*>.*?</g>', _re.S)
        found = pattern.findall(text)
        if len(found) != expected:
            raise SystemExit(f'{path}: expected {expected} chrome-product icons, '
                             f'found {len(found)}. Upstream changed.')
        paths = ''.join(f'<path d="{d}"></path>' for d in _swarm_mark_paths())
        # The mark is 1000 x 467.95; the box below centres it in a square.
        mark = f'<g id="chrome-product" viewBox="0 -266 1000 1000">{paths}</g>'
        return pattern.sub(lambda _m: mark, text)
    return edit


# ------------------------------------------------ 9. SWARM amber (G3)
# The browser's colour is generated from one seed colour (Material "dynamic
# colour"): prefs::kUserColor, SK_ColorTRANSPARENT meaning "Chromium's blue
# baseline". The default becomes SWARM honey #F5A623, with the tonal-spot
# scheme, so the toolbar, the selected item in Settings, focus rings and
# buttons are generated from amber. The generated scheme keeps its own
# contrast pairs (text on the accent colour is dark in dark mode). It is still
# a normal preference: "Customize" / "Reset to default" in Settings,
# Appearance keeps working; reset returns to amber, not to blue.
def edit_theme_default_colour(text, path):
    text = sub(text,
               '  registry->RegisterIntegerPref(prefs::kUserColor, SK_ColorTRANSPARENT);\n',
               '  // SWARM: SWARM honey #F5A623 is the default colour of the browser.\n'
               '  registry->RegisterIntegerPref(prefs::kUserColor,\n'
               '                                SkColorSetRGB(0xF5, 0xA6, 0x23));\n',
               path)
    text = sub(text,
               '  registry->RegisterIntegerPref(\n'
               '      prefs::kBrowserColorVariant,\n'
               '      static_cast<int>(ui::mojom::BrowserColorVariant::kSystem));\n',
               '  // SWARM: the scheme the amber default is generated with.\n'
               '  registry->RegisterIntegerPref(\n'
               '      prefs::kBrowserColorVariant,\n'
               '      static_cast<int>(ui::mojom::BrowserColorVariant::kTonalSpot));\n',
               path)
    return text


# ------------------------------------------------ 10. page names (G4)
# chrome://chrome-urls (also chrome://about) writes its title and heading as
# literals in its own page files, not as grd strings, so the string rules in
# swarm/brand/ui_strings.py cannot reach them.
def edit_chrome_urls_title(text, path):
    return sub(text, '    <title>Chrome URLs</title>\n',
               '    <title>SWARM Browser pages</title>\n', path)


def edit_chrome_urls_heading(text, path):
    return sub(text, '<h2>List of Chrome URLs</h2>\n',
               '<h2>List of SWARM Browser pages</h2>\n', path)


# ------------------------------------------------ 11. UI icons (G5)
# The Settings sidebar draws SVG iconsets; each <g id> listed in
# swarm/brand/icons_ui.py SETTINGS_ICONS is replaced, in every iconset of
# settings/icons.html.ts, by the SWARM master of the same meaning (32 grid,
# stroked, .42 inner face). The Views icons (toolbar, app menu, address bar)
# are .icon files copied in from swarm/brand/tree by install_swarm_assets.py.
# This patch is generated on top of swarm-ui-logos.patch (CHAINED), which
# edits the same file.
def edit_settings_icons(text, path):
    import re as _re
    import sys as _sys
    _sys.path.insert(0, str(ROOT / 'swarm' / 'brand'))
    import icons_ui
    for master, gid in icons_ui.SETTINGS_ICONS.items():
        pattern = _re.compile(r'<g id="%s"[^>]*>.*?</g>' % _re.escape(gid), _re.S)
        n = len(pattern.findall(text))
        if n == 0:
            raise SystemExit(f'{path}: no <g id="{gid}"> -- upstream changed')
        # Nested <g> inside an icon would end the match early; none of these has one.
        new = icons_ui.settings_iconset_g(master, gid)
        text = pattern.sub(lambda _m: new, text)
    return text


# Patches whose diff is taken against the file as the earlier SWARM patches
# leave it, because an earlier patch edits the same file.
CHAINED = {'swarm-ui-icons.patch'}


PATCHES = {
    'swarm-branding.patch': {
        'chrome/app/theme/chromium/BRANDING': lambda t, p: BRANDING_NEW,
        'chrome/install_static/chromium_install_modes.h':
            lambda t, p: edit_install_modes_guids(edit_install_modes(t, p), p),
        'chrome/elevation_service/elevation_service_idl.idl':
            edit_elevation_service_idl,
        'chrome/windows_services/elevated_tracing_service/'
        'tracing_service_idl.idl': edit_tracing_service_idl,
        'chrome/browser/extensions/api/messaging/launch_context_win.cc':
            edit_launch_context_win,
    },
    # Applied after swarm-branding.patch, which edits the same file a hundred
    # lines earlier; GNU patch absorbs the offset.
    'swarm-native-host-lookup.patch': {
        'chrome/browser/extensions/api/messaging/launch_context_win.cc':
            edit_launch_context_win_bundled,
    },
    'swarm-privacy-defaults.patch': {
        'third_party/blink/common/features.cc': edit_blink_features,
        'services/network/public/cpp/features.cc': edit_network_features,
        'chrome/browser/ui/browser_ui_prefs.cc': edit_browser_ui_prefs,
        'chrome/app/chrome_main_delegate.cc': edit_chrome_main_delegate,
    },
    'swarm-component-extensions.patch': {
        'chrome/browser/browser_resources.grd': edit_browser_resources_grd,
        'chrome/browser/resources/component_extension_resources.grd':
            edit_component_extension_resources_grd,
        'chrome/browser/resources/BUILD.gn': edit_resources_build_gn,
        'chrome/browser/extensions/component_loader.h': edit_component_loader_h,
        'chrome/browser/extensions/component_loader.cc': edit_component_loader_cc,
        'chrome/browser/extensions/component_extensions_allowlist/allowlist.cc':
            edit_allowlist,
    },
    # The installer carries the bundled host. Its own patch, because it is a
    # different file and a different decision (what the installer ships)
    # from the lookup above; appended last so the first four keep their
    # places in the series.
    'swarm-installer-host.patch': {
        'chrome/installer/mini_installer/chrome.release': edit_chrome_release,
    },
    'swarm-first-run.patch': {
        'chrome/browser/chrome_browser_main.cc': edit_first_run_tab,
        'chrome/browser/ui/webui/ungoogled_first_run.h': edit_first_run_page,
        'chrome/common/webui_url_constants.cc': edit_chrome_url_hosts,
    },
    'swarm-toolbar-pins.patch': {
        'extensions/browser/extension_prefs.cc': edit_pinned_extensions,
    },
    'swarm-ui-logos.patch': {
        'ui/webui/resources/cr_elements/icons.html.ts': edit_chrome_product_icon(2),
        'chrome/browser/resources/settings/icons.html.ts': edit_chrome_product_icon(2),
    },
    'swarm-default-colour.patch': {
        'chrome/browser/themes/theme_service.cc': edit_theme_default_colour,
    },
    'swarm-ui-names.patch': {
        'components/webui/chrome_urls/resources/chrome_urls.html': edit_chrome_urls_title,
        'components/webui/chrome_urls/resources/app.html.ts': edit_chrome_urls_heading,
    },
    'swarm-ui-icons.patch': {
        'chrome/browser/resources/settings/icons.html.ts': edit_settings_icons,
    },
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total_hunks = 0
    applied = {}  # relpath -> text after the patches generated so far
    for patch_name, targets in PATCHES.items():
        chunks = []
        for relpath, edit in targets.items():
            full = SRC / relpath
            if not full.is_file():
                raise SystemExit(f'missing from prepared tree: {relpath}')
            original = full.read_text(encoding='utf-8')
            if patch_name in CHAINED:
                # Diff against the file as the earlier SWARM patches leave it.
                original = applied.get(relpath, original)
            modified = edit(original, relpath)
            applied[relpath] = modified
            if modified == original:
                raise SystemExit(f'{relpath}: edit produced no change')
            diff = list(difflib.unified_diff(
                original.splitlines(keepends=True),
                modified.splitlines(keepends=True),
                fromfile=f'a/{relpath}', tofile=f'b/{relpath}', n=3))
            hunks = sum(1 for line in diff if line.startswith('@@'))
            total_hunks += hunks
            print(f'  {patch_name}: {relpath} ({hunks} hunk(s))')
            chunks.extend(diff)
        (OUT / patch_name).write_text(''.join(chunks), encoding='utf-8',
                                      newline='\n')
        print(f'wrote {OUT / patch_name}')
    series = OUT.parent / 'series'
    series.write_text('\n'.join(f'swarm/{name}' for name in PATCHES) + '\n',
                      encoding='utf-8', newline='\n')
    print(f'wrote {series}')
    print(f'TOTAL HUNKS: {total_hunks}')


if __name__ == '__main__':
    sys.exit(main())
