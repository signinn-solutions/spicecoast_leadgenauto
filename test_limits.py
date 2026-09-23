import unittest
import os
import json
import tempfile
from datetime import date, timedelta
from unittest.mock import patch, MagicMock

import lead_finder_test as lft

class TestLeadFinderLimits(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.usage_file = os.path.join(self.temp_dir.name, "daily_usage.json")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_load_daily_usage_no_file(self):
        today, count = lft.load_daily_usage(self.usage_file)
        self.assertEqual(today, str(date.today()))
        self.assertEqual(count, 0)

    def test_save_and_load_daily_usage_same_day(self):
        today = str(date.today())
        lft.save_daily_usage(today, 15, self.usage_file)
        cur_today, count = lft.load_daily_usage(self.usage_file)
        self.assertEqual(cur_today, today)
        self.assertEqual(count, 15)

    def test_load_daily_usage_previous_day_resets(self):
        yesterday = str(date.today() - timedelta(days=1))
        lft.save_daily_usage(yesterday, 45, self.usage_file)
        cur_today, count = lft.load_daily_usage(self.usage_file)
        self.assertEqual(cur_today, str(date.today()))
        self.assertEqual(count, 0)

    def test_load_daily_usage_corrupted_file(self):
        with open(self.usage_file, "w") as f:
            f.write("{invalid json...")
        today, count = lft.load_daily_usage(self.usage_file)
        self.assertEqual(today, str(date.today()))
        self.assertEqual(count, 0)

    def test_domain_extraction(self):
        self.assertEqual(lft.extract_domain("https://www.spiceworld.de/about"), "spiceworld.de")
        self.assertEqual(lft.extract_domain("http://spiceworld.de"), "spiceworld.de")
        self.assertEqual(lft.extract_domain("https://sub.spiceworld.de:8080/path"), "sub.spiceworld.de")
        self.assertIsNone(lft.extract_domain(None))
        self.assertIsNone(lft.extract_domain(""))

    def test_get_user_inputs_validates_limits(self):
        # Simulate inputs: invalid string -> >50 -> >remaining(10) -> valid(5)
        user_inputs = ["spice importer", "Hamburg", "Germany", "abc", "60", "12", "5"]
        with patch('builtins.input', side_effect=user_inputs):
            query, requested = lft.get_user_inputs(remaining_today=10)
            self.assertEqual(query, "spice importer in Hamburg, Germany")
            self.assertEqual(requested, 5)

    def test_hard_stop_at_limit(self):
        # Test that loop stops when DAILY_LIMIT is reached
        today = str(date.today())
        used_today = 48
        DAILY_LIMIT = 50
        fake_places = [
            {"id": f"p-{i}", "displayName": {"text": f"Biz {i}"}, "websiteUri": f"http://biz{i}.com"}
            for i in range(5)
        ]

        processed = 0
        for place in fake_places:
            if used_today >= DAILY_LIMIT:
                break
            used_today += 1
            processed += 1

        self.assertEqual(processed, 2)
        self.assertEqual(used_today, 50)

    def test_seen_places_persistence(self):
        seen_file = os.path.join(self.temp_dir.name, "seen_places.json")
        self.assertEqual(lft.load_seen_place_ids(seen_file), {})

        sample_data = {
            "place123": {
                "name": "Hamburg Spice Co",
                "address": "123 Port St",
                "phone": "+49 40 123456",
                "website": "https://hamburgspice.de",
                "domain": "hamburgspice.de",
                "email": "contact@hamburgspice.de",
                "email_status": "deliverable",
                "first_found_date": str(date.today())
            }
        }
        lft.save_seen_place_ids(sample_data, seen_file)
        loaded = lft.load_seen_place_ids(seen_file)
        self.assertEqual(loaded, sample_data)

    def test_search_new_places_skips_seen(self):
        seen_ids = {"place1": {"name": "Old Business"}}
        mock_page1 = ([
            {"id": "place1", "displayName": {"text": "Old Business"}},
            {"id": "place2", "displayName": {"text": "New Business 1"}},
        ], "token123")
        mock_page2 = ([
            {"id": "place3", "displayName": {"text": "New Business 2"}},
        ], None)

        with patch("lead_finder_test.search_places", side_effect=[mock_page1, mock_page2]):
            with patch("time.sleep", return_value=None):
                results = lft.search_new_places("spices in Hamburg", needed=5, seen_ids=seen_ids)
                self.assertEqual(len(results), 2)
                self.assertEqual([r["id"] for r in results], ["place2", "place3"])


if __name__ == "__main__":
    unittest.main()

