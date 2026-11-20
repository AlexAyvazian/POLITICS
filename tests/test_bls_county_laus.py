import unittest
from datetime import date
from scripts.update_bls_county_laus import normalize_rows, normalize_period

class BlsCountyLausTests(unittest.TestCase):
    def test_period_normalization_handles_bls_month_labels(self):
        self.assertEqual(normalize_period("Sep-26"),"2026-09")
        self.assertEqual(normalize_period("September 2026"),"2026-09")
        self.assertEqual(normalize_period("2026-09"),"2026-09")

    def test_normalize_rows_keeps_latest_county_month_and_metrics(self):
        rows=[
            ["LAUS Area Code","State","County","Area Title","Period","Labor Force","Employment","Unemployment","Unemployment Rate"],
            ["CN0601900000000","06","019","Fresno County, CA","Aug-26","460,000","418,000","42,000","9.1"],
            ["CN0601900000000","06","019","Fresno County, CA","Sep-26","462,000","421,000","41,000","8.9"],
            ["CN0602900000000","06","029","Kern County, CA","Sep-26","390,000","350,000","40,000","10.3"],
            ["","", "", "footer", "", "", "", "", ""],
        ]
        out=normalize_rows(rows,date(2026,11,20),min_count=1)
        self.assertEqual(out["period"],"2026-09")
        self.assertEqual(out["count"],2)
        self.assertEqual(out["counties"]["06019"]["name"],"Fresno County, CA")
        self.assertEqual(out["counties"]["06019"]["laborForce"],462000)
        self.assertEqual(out["counties"]["06019"]["employed"],421000)
        self.assertEqual(out["counties"]["06019"]["unemployed"],41000)
        self.assertEqual(out["counties"]["06019"]["unemploymentRatePct"],8.9)
        self.assertNotIn("06019_old",out["counties"])
        self.assertEqual(out["seasonalAdjustment"],"Not seasonally adjusted")
        self.assertEqual(out["source"],"U.S. Bureau of Labor Statistics")

if __name__=="__main__":
    unittest.main()
