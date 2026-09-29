"""Unit test for swarm/brand/product_strings.py (run: python -m unittest swarm.tests.brand.test_product_strings
or python swarm/tests/brand/test_product_strings.py)."""
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[2] / 'brand'))
import product_strings  # noqa: E402

SAMPLE = '''<grit>
  <translations>
    <messages fallback_to_english="true">
      <!-- Chromium keeps its own copy of these strings -->
      <if expr="_is_chrome_for_testing_branded">
        <then>
          <message name="IDS_PRODUCT_NAME" desc="The Chrome for Testing application name" translateable="false">
            Google Chrome for Testing
          </message>
        </then>
        <else>
          <message name="IDS_PRODUCT_NAME" desc="The Chromium application name" translateable="false">
            Chromium
          </message>
        </else>
      </if>
      <message name="IDS_BROWSER_WINDOW_TITLE_FORMAT" desc="The format for titles">
        <ph name="PAGE_TITLE">$1<ex>Google</ex></ph> - Chromium
      </message>
      <message name="IDS_OS" desc="ChromiumOS text">
        ChromiumOS and Chromium's settings
      </message>
      <if expr="_is_chrome_for_testing_branded">
        <then>
          <message name="IDS_ABOUT_VERSION_COMPANY_NAME" desc="Company name">
            Google LLC
          </message>
          <message name="IDS_ABOUT_VERSION_COPYRIGHT" desc="Copyright">
            Copyright <ph name="YEAR">{0,date,y}<ex>2016</ex></ph> Google LLC. All rights reserved.
          </message>
        </then>
        <else>
          <message name="IDS_ABOUT_VERSION_COMPANY_NAME" desc="Company name">
            The Chromium Authors
          </message>
          <message name="IDS_ABOUT_VERSION_COPYRIGHT" desc="Copyright">
            Copyright <ph name="YEAR">{0,date,y}<ex>2016</ex></ph> The Chromium Authors. All rights reserved.
          </message>
        </else>
      </if>
    </messages>
  </translations>
</grit>
'''


class ProductStringsTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.grd = Path(self.dir.name) / 'chromium_strings.grd'
        self.grd.write_text(SAMPLE, encoding='utf-8')

    def tearDown(self):
        self.dir.cleanup()

    def test_rewrites_message_text_only(self):
        counts = product_strings.rewrite_strings(self.grd)
        out = self.grd.read_text(encoding='utf-8')
        self.assertIn('            SWARM Browser\n', out)
        self.assertIn('$1<ex>Google</ex></ph> - SWARM Browser', out)
        self.assertIn("ChromiumOS and SWARM Browser's settings", out)
        # declarations, descriptions and comments untouched
        self.assertIn('desc="The Chromium application name"', out)
        self.assertIn('<!-- Chromium keeps its own copy', out)
        self.assertIn('desc="ChromiumOS text"', out)
        # chrome-for-testing branch untouched
        self.assertIn('Google Chrome for Testing', out)
        self.assertEqual(counts['explicit_messages'], 2)
        self.assertGreaterEqual(counts['word_replacements'], 3)

    def test_about_page_messages(self):
        product_strings.rewrite_strings(self.grd)
        out = self.grd.read_text(encoding='utf-8')
        self.assertIn('            Swarm\n', out)
        self.assertIn('Swarm. Based on Chromium, Copyright', out)
        self.assertIn('The Chromium Authors. All rights reserved.', out)
        # the Google branch of the split is untouched
        self.assertIn('Google LLC. All rights reserved.', out)

    def test_idempotent(self):
        product_strings.rewrite_strings(self.grd)
        first = self.grd.read_text(encoding='utf-8')
        counts = product_strings.rewrite_strings(self.grd)
        self.assertEqual(first, self.grd.read_text(encoding='utf-8'))
        self.assertEqual(counts['word_replacements'], 0)
        self.assertEqual(counts['explicit_messages'], 0)

    def test_dry_run_changes_nothing(self):
        product_strings.rewrite_strings(self.grd, dry_run=True)
        self.assertEqual(SAMPLE, self.grd.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
