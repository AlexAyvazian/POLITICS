import unittest
from datetime import date
from scripts.update_usaspending_county import build_request, normalize_response

class UsaSpendingCountyTests(unittest.TestCase):
    def test_build_request_requests_all_counties_without_geo_filter(self):
        body=build_request(date(2026,11,20))
        self.assertEqual(body["scope"],"place_of_performance")
        self.assertEqual(body["geo_layer"],"county")
        self.assertEqual(body["spending_type"],"obligation")
        self.assertNotIn("geo_layer_filters",body)
        self.assertEqual(body["filters"]["time_period"],[{"start_date":"2024-11-20","end_date":"2026-11-20"}])
        self.assertGreaterEqual(len(body["filters"]["award_type_codes"]),20)

    def test_normalize_response_keeps_county_fips_and_state_totals(self):
        raw={"scope":"place_of_performance","geo_layer":"county","results":[
            {"shape_code":"06019","display_name":"Fresno County","aggregated_amount":1250000.25},
            {"shape_code":"06029","display_name":"Kern County","aggregated_amount":750000},
            {"shape_code":"36061","display_name":"New York County","aggregated_amount":2000000},
            {"shape_code":"bad","display_name":"Bad","aggregated_amount":999}
        ]}
        out=normalize_response(raw,date(2026,11,20))
        self.assertEqual(out["count"],3)
        self.assertEqual(out["counties"]["06019"]["obligations"],1250000.25)
        self.assertEqual(out["states"]["06"]["obligations"],2000000.25)
        self.assertEqual(out["states"]["06"]["countyCount"],2)
        self.assertEqual(out["period"],{"start":"2024-11-20","end":"2026-11-20"})
        self.assertEqual(out["source"],"USAspending.gov")
        self.assertNotIn("bad",out["counties"])

if __name__=="__main__":
    unittest.main()
