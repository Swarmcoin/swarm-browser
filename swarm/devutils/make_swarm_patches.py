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
SRC = ROOT / 'build' / 'src'
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
WALLET_FILES = ['popup.html', 'popup.js', 'background.js', 'swarm.css',
                'icons/wallet-16.png', 'icons/wallet-32.png',
                'icons/wallet-48.png', 'icons/wallet-128.png']
REWARDS_FILES = ['popup.html', 'popup.js', 'background.js', 'swarm.css',
                 'icons/rewards-16.png', 'icons/rewards-32.png',
                 'icons/rewards-48.png', 'icons/rewards-128.png']


def _idr(prefix, relpath):
    stem = relpath.replace('/', '_').replace('-', '_').replace('.', '_').upper()
    return f'IDR_{prefix}_{stem}'


def edit_browser_resources_grd(text, path):
    return sub(text,
               '      <include name="IDR_READING_MODE_GDOCS_HELPER_MANIFEST" file="resources\\reading_mode_gdocs_helper\\manifest.json" type="BINDATA" />\n',
               '      <include name="IDR_READING_MODE_GDOCS_HELPER_MANIFEST" file="resources\\reading_mode_gdocs_helper\\manifest.json" type="BINDATA" />\n'
               '\n'
               '      <!-- SWARM: the two bundled SWARM component extensions. The folders\n'
               '           are copied in by swarm/install_swarm_assets.py. -->\n'
               '      <include name="IDR_SWARM_WALLET_MANIFEST" file="resources\\swarm_wallet\\manifest.json" type="BINDATA" />\n'
               '      <include name="IDR_SWARM_REWARDS_MANIFEST" file="resources\\swarm_rewards\\manifest.json" type="BINDATA" />\n',
               path)


def edit_component_extension_resources_grd(text, path):
    lines = ['\n',
             '      <!-- SWARM: bundled SWARM Wallet and SWARM Rewards extension files.\n'
             '           The resource path prefix must match the root_directory passed to\n'
             '           ComponentLoader::Add() in component_loader.cc. -->\n']
    for relpath in WALLET_FILES:
        lines.append(f'      <include name="{_idr("SWARM_WALLET", relpath)}" '
                     f'file="swarm_wallet/{relpath}" type="BINDATA" />\n')
    for relpath in REWARDS_FILES:
        lines.append(f'      <include name="{_idr("SWARM_REWARDS", relpath)}" '
                     f'file="swarm_rewards/{relpath}" type="BINDATA" />\n')
    anchor = ('      <include name="IDR_READING_MODE_GDOC_HELPER_GDOCS_SCRIPT_JS" '
              'file="reading_mode_gdocs_helper/gdocs_script.js" type="BINDATA" />\n')
    return sub(text, anchor, anchor + ''.join(lines), path)


def edit_resources_build_gn(text, path):
    inputs = ''.join(
        [f'      "swarm_wallet/{f}",\n' for f in ['manifest.json'] + WALLET_FILES] +
        [f'      "swarm_rewards/{f}",\n' for f in ['manifest.json'] + REWARDS_FILES])
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
               '  // SWARM: the two bundled SWARM component extensions.\n'
               '  void AddSwarmExtensions();\n',
               path)


def edit_component_loader_cc(text, path):
    text = sub(text,
               'void ComponentLoader::AddWebStoreApp() {\n',
               '// SWARM: SWARM Wallet and SWARM Rewards are bundled as component\n'
               '// extensions. Their ids are fixed by the "key" field in their manifests\n'
               '// and are recorded in swarm/README.md. The folders under\n'
               '// chrome/browser/resources are put there by swarm/install_swarm_assets.py\n'
               '// and turned into resources by component_extension_resources.grd.\n'
               'void ComponentLoader::AddSwarmExtensions() {\n'
               '  Add(IDR_SWARM_WALLET_MANIFEST,\n'
               '      base::FilePath(FILE_PATH_LITERAL("swarm_wallet")));\n'
               '  Add(IDR_SWARM_REWARDS_MANIFEST,\n'
               '      base::FilePath(FILE_PATH_LITERAL("swarm_rewards")));\n'
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
               '    // SWARM: bundled SWARM Wallet and SWARM Rewards.\n'
               '    AddSwarmExtensions();\n',
               path)
    return text


def edit_allowlist(text, path):
    return sub(text,
               '    case IDR_READING_MODE_GDOCS_HELPER_MANIFEST:\n'
               '    case IDR_WEBSTORE_MANIFEST:\n',
               '    case IDR_READING_MODE_GDOCS_HELPER_MANIFEST:\n'
               '    // SWARM: the two bundled SWARM component extensions.\n'
               '    case IDR_SWARM_REWARDS_MANIFEST:\n'
               '    case IDR_SWARM_WALLET_MANIFEST:\n'
               '    case IDR_WEBSTORE_MANIFEST:\n',
               path)


PATCHES = {
    'swarm-branding.patch': {
        'chrome/app/theme/chromium/BRANDING': lambda t, p: BRANDING_NEW,
        'chrome/install_static/chromium_install_modes.h': edit_install_modes,
        'chrome/browser/extensions/api/messaging/launch_context_win.cc':
            edit_launch_context_win,
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
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total_hunks = 0
    for patch_name, targets in PATCHES.items():
        chunks = []
        for relpath, edit in targets.items():
            full = SRC / relpath
            if not full.is_file():
                raise SystemExit(f'missing from prepared tree: {relpath}')
            original = full.read_text(encoding='utf-8')
            modified = edit(original, relpath)
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
