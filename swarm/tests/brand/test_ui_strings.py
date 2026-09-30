#!/usr/bin/env python3
"""Unit tests for swarm/brand/ui_strings.py (python swarm/tests/brand/test_ui_strings.py)."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'brand'))
import ui_strings as u  # noqa: E402


class LineRules(unittest.TestCase):
    def check(self, before, after):
        self.assertEqual(u.rewrite_line(before)[0], after)

    def test_chromium_is_the_product(self):
        self.check('      Chromium didn\'t shut down correctly.\n', '      SWARM Browser didn\'t shut down correctly.\n')

    def test_chromium_the_project_stays(self):
        line = ('        Chromium is made possible by the <ph name="BEGIN_LINK_CHROMIUM">&lt;a href="$1"&gt;</ph>'
                'Chromium<ph name="END_LINK_CHROMIUM">&lt;/a&gt;</ph> open source project.\n')
        out = u.rewrite_line(line)[0]
        self.assertTrue(out.lstrip().startswith('SWARM Browser is made possible'))
        self.assertIn('</ph>Chromium<ph name="END_LINK_CHROMIUM">', out)
        for keep in ('The Chromium Authors', 'Based on Chromium', 'ChromiumOS', 'Chromium OS',
                     'for use by Chromium developers'):
            self.assertIn(keep, u.rewrite_line(f'  {keep} x\n')[0])

    def test_chrome_as_the_browser(self):
        self.check('      Customize Chrome\n', '      Customize SWARM Browser\n')
        self.check("      Chrome's settings\n", "      SWARM Browser's settings\n")
        self.check('      Restart Chrome\n', '      Restart SWARM Browser\n')

    def test_other_things_called_chrome_stay(self):
        for text in ('Chrome Web Store', 'ChromeOS', 'Chrome OS', 'Chromebook', 'Google Chrome',
                     'chrome://settings', 'Chrome Enterprise', 'Chrome Remote Desktop', 'Chrome apps',
                     'Chrome for Testing', 'ChromeVox'):
            self.check(f'      Open {text} now\n', f'      Open {text} now\n')

    def test_google_service_sentences_keep_their_words(self):
        for text in ('Chrome can get these codes from your Gmail.', 'Sign in to Chrome',
                     'Chrome has features like Google Safe Browsing', 'Chrome sync is off'):
            self.check(f'      {text}\n', f'      {text}\n')

    def test_declarations_and_comments_untouched(self):
        for line in ('    <message name="IDS_X" desc="About Chrome and Chromium">\n',
                     '    <!-- Chromium only -->\n', '    <if expr="_chromium">\n'):
            self.check(line, line)


class Explicit(unittest.TestCase):
    def test_set_message_by_name(self):
        text = ('<grit-part>\n    <message name="IDS_SETTINGS_PEOPLE" desc="x">\n      You and Google\n'
                '    </message>\n</grit-part>\n')
        out, n = u.set_message(text, 'IDS_SETTINGS_PEOPLE', 'You and your browser')
        self.assertEqual(n, 1)
        self.assertIn('      You and your browser\n    </message>', out)
        self.assertEqual(u.set_message(out, 'IDS_SETTINGS_PEOPLE', 'You and your browser')[0], out)

    def test_missing_message_fails_loudly(self):
        with self.assertRaises(SystemExit):
            u.set_message('<grit-part></grit-part>', 'IDS_NOPE', 'x')


class WholeTree(unittest.TestCase):
    def test_idempotent_on_a_small_tree(self):
        with tempfile.TemporaryDirectory() as d:
            tree = Path(d)
            (tree / 'chrome/app').mkdir(parents=True)
            (tree / 'components').mkdir(parents=True)
            (tree / 'ui/strings').mkdir(parents=True)
            (tree / 'chrome/app/generated_resources.grd').write_text(
                '<grit><release><messages>\n<part file="settings_strings.grdp" />\n'
                '<message name="IDS_A" desc="d">\n  Restart Chrome\n</message>\n</messages></release></grit>\n',
                encoding='utf-8')
            (tree / 'chrome/app/settings_strings.grdp').write_text(
                '<grit-part>\n<message name="IDS_SETTINGS_PEOPLE" desc="d">\n  You and Google\n</message>\n'
                '<message name="IDS_SETTINGS_GOOGLE_SERVICES_PAGE_TITLE" desc="d">\n  Google services\n</message>\n'
                '<message name="IDS_SETTINGS_SIDE_PANEL_ALIGNMENT_CHROME_PANELS" desc="d">\n  Chrome Panels\n</message>\n'
                '</grit-part>\n', encoding='utf-8')
            (tree / 'chrome/app/chromium_strings.grd').write_text('<grit></grit>\n', encoding='utf-8')
            (tree / 'components/components_strings.grd').write_text(
                '<grit><part file="version_ui_strings.grdp" /></grit>\n', encoding='utf-8')
            (tree / 'components/version_ui_strings.grdp').write_text(
                '<grit-part>\n<message name="IDS_VERSION_UI_OFFICIAL" desc="d">\n  Official Build, ungoogled-chromium\n'
                '</message>\n<message name="IDS_VERSION_UI_UNOFFICIAL" desc="d">\n  Developer Build, ungoogled-chromium\n'
                '</message>\n</grit-part>\n', encoding='utf-8')
            (tree / 'components/components_chromium_strings.grd').write_text('<grit></grit>\n', encoding='utf-8')
            (tree / 'ui/strings/ui_strings.grd').write_text('<grit></grit>\n', encoding='utf-8')
            (tree / 'ui/strings/app_locale_settings.grd').write_text('<grit></grit>\n', encoding='utf-8')
            first = u.rewrite(tree)
            self.assertEqual(first['totals'], {'Chrome': 1})
            self.assertEqual(len(first['explicit']), 5)
            text = (tree / 'chrome/app/settings_strings.grdp').read_text(encoding='utf-8')
            self.assertIn('You and your browser', text)
            self.assertIn('Other services', text)
            self.assertNotIn('ungoogled', (tree / 'components/version_ui_strings.grdp').read_text(encoding='utf-8'))
            second = u.rewrite(tree)
            self.assertEqual(second['totals'], {})


if __name__ == '__main__':
    unittest.main()
