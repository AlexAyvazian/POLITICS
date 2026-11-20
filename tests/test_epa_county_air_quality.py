import unittest
from scripts.update_epa_county_air_quality import normalize_row, build_snapshot

class EpaCountyAirQualityTests(unittest.TestCase):
    def test_normalize_row_preserves_numeric_values_and_nd_as_missing(self):
        row={
          "State":"California","County":"Fresno County","County FIPS Code":"06019",
          "Population (2020 Census)":1008654,
          "CO 8-hour (ppm)":"2.1","Lead 3-month (µg/m3)":"ND",
          "NO2 AM (ppb)":"8.4","NO2 1-hour (ppb)":"49",
          "Ozone 8-hour (ppb)":"78","PM10 24-hour (µg/m3)":"122",
          "PM2.5 Wtd AM (µg/m3)":"12.3","PM2.5 24-hour (µg/m3)":"55.7",
          "SO2 1-hour (ppb)":"ND","SO2 Wtd AM (ppb)":"ND"
        }
        out=normalize_row(row)
        self.assertEqual(out["fips"],"06019")
        self.assertEqual(out["ozone8hPpb"],78.0)
        self.assertEqual(out["pm25AnnualUgM3"],12.3)
        self.assertEqual(out["pm25DailyUgM3"],55.7)
        self.assertEqual(out["pm10DailyUgM3"],122.0)
        self.assertEqual(out["no2OneHourPpb"],49.0)
        self.assertEqual(out["co8hPpm"],2.1)
        self.assertIsNone(out["lead3MonthUgM3"])
        self.assertIsNone(out["so2OneHourPpb"])

    def test_invalid_or_all_nd_row_is_not_fabricated_as_zero(self):
        row={"State":"Example","County":"No Monitor County","County FIPS Code":"06001",
             "CO 8-hour (ppm)":"ND","Lead 3-month (µg/m3)":"ND","NO2 AM (ppb)":"ND",
             "NO2 1-hour (ppb)":"ND","Ozone 8-hour (ppb)":"ND","PM10 24-hour (µg/m3)":"ND",
             "PM2.5 Wtd AM (µg/m3)":"ND","PM2.5 24-hour (µg/m3)":"ND",
             "SO2 1-hour (ppb)":"ND","SO2 Wtd AM (ppb)":"ND"}
        self.assertIsNone(normalize_row(row))

    def test_snapshot_only_contains_counties_with_monitoring_statistics(self):
        rows=[
          {"State":"California","County":"Fresno County","County FIPS Code":"06019","Ozone 8-hour (ppb)":"78"},
          {"State":"New York","County":"New York County","County FIPS Code":"36061","PM2.5 Wtd AM (µg/m3)":"7.1"},
        ]
        out=build_snapshot(rows,"2026-11-20T12:00:00Z",min_count=1)
        self.assertEqual(out["count"],2)
        self.assertIn("06019",out["counties"])
        self.assertNotIn("06001",out["counties"])
        self.assertIn("not a zero",out["missingCountyMeaning"].lower())
        self.assertIn("not intended to numerically rank",out["coverage"].lower())

if __name__=="__main__":
    unittest.main()
