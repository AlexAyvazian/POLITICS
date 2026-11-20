import unittest
from datetime import date
from scripts.update_cms_partb_provider_activity import normalize_stats, build_snapshot

class CmsPartBProviderActivityTests(unittest.TestCase):
    def test_normalize_stats_uses_filtered_row_count(self):
        raw={"meta":{"success":True},"data":{"found_rows":105363,"total_rows":1296739}}
        out=normalize_stats(raw)
        self.assertEqual(out["publishedProviderRows"],105363)
        self.assertEqual(out["nationalDatasetRows"],1296739)

    def test_snapshot_requires_all_requested_states_and_preserves_scope(self):
        rows={"CA":{"publishedProviderRows":105363,"nationalDatasetRows":1296739},
              "NY":{"publishedProviderRows":90000,"nationalDatasetRows":1296739}}
        out=build_snapshot(["CA","NY"],rows,date(2026,11,20))
        self.assertEqual(out["stateCount"],2)
        self.assertEqual(out["reportingYear"],2024)
        self.assertEqual(out["states"]["CA"]["publishedProviderRows"],105363)
        self.assertIn("all licensed clinicians",out["coverage"].lower())
        self.assertIn("fewer than 11 beneficiaries",out["coverage"].lower())

if __name__=="__main__":
    unittest.main()
