import unittest
from scripts.update_epa_county_aqi import normalize_row, build_snapshot

class EpaCountyAqiTests(unittest.TestCase):
    def test_normalize_row_keeps_monitoring_days_and_aqi_categories(self):
        row={
          "State Code":"06","County Code":"019","State":"California","County":"Fresno",
          "Year":"2025","Days with AQI":"365","Good Days":"126","Moderate Days":"176",
          "Unhealthy for Sensitive Groups Days":"55","Unhealthy Days":"8",
          "Very Unhealthy Days":"0","Hazardous Days":"0","Max AQI":"185",
          "90th Percentile AQI":"121","Median AQI":"64"
        }
        out=normalize_row(row)
        self.assertEqual(out["fips"],"06019")
        self.assertEqual(out["daysWithAqi"],365)
        self.assertEqual(out["goodDays"],126)
        self.assertEqual(out["moderateDays"],176)
        self.assertEqual(out["unhealthySensitiveDays"],55)
        self.assertEqual(out["unhealthyDays"],8)
        self.assertEqual(out["unhealthyOrWorseDays"],63)
        self.assertEqual(out["maxAqi"],185)
        self.assertEqual(out["p90Aqi"],121)
        self.assertEqual(out["medianAqi"],64)

    def test_name_lookup_maps_code_less_epa_rows_to_fips(self):
        row={"State":"California","County":"Fresno","Year":"2025","Days with AQI":"300","Good Days":"100","Moderate Days":"150","Unhealthy for Sensitive Groups Days":"40","Unhealthy Days":"10","Very Unhealthy Days":"0","Hazardous Days":"0"}
        out=normalize_row(row,{("california","fresno"):"06019"})
        self.assertEqual(out["fips"],"06019")

    def test_missing_or_invalid_fips_is_not_converted_to_zero_air_quality(self):
        row={"State Code":"","County Code":"","Year":"2025","Days with AQI":"0"}
        self.assertIsNone(normalize_row(row))

    def test_snapshot_only_contains_actual_monitored_county_rows(self):
        rows=[
          {"State Code":"06","County Code":"019","State":"California","County":"Fresno","Year":"2025","Days with AQI":"300","Good Days":"100","Moderate Days":"150","Unhealthy for Sensitive Groups Days":"40","Unhealthy Days":"10","Very Unhealthy Days":"0","Hazardous Days":"0","Max AQI":"170","90th Percentile AQI":"120","Median AQI":"60"},
          {"State Code":"36","County Code":"061","State":"New York","County":"New York","Year":"2025","Days with AQI":"320","Good Days":"180","Moderate Days":"130","Unhealthy for Sensitive Groups Days":"10","Unhealthy Days":"0","Very Unhealthy Days":"0","Hazardous Days":"0","Max AQI":"140","90th Percentile AQI":"95","Median AQI":"48"},
        ]
        out=build_snapshot(rows,"2026-11-20T12:00:00Z",min_count=1)
        self.assertEqual(out["count"],2)
        self.assertIn("06019",out["counties"])
        self.assertNotIn("06001",out["counties"])
        self.assertIn("monitor",out["coverage"].lower())
        self.assertIn("not a zero",out["missingCountyMeaning"].lower())

if __name__=="__main__":
    unittest.main()
