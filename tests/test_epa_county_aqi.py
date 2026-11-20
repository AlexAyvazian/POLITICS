import io
import unittest
from scripts.update_epa_county_aqi import parse_csv, build_snapshot

FIXTURE="""State,County,Year,Days with AQI,Good Days,Moderate Days,Unhealthy for Sensitive Groups Days,Unhealthy Days,Very Unhealthy Days,Hazardous Days,Max AQI,90th Percentile AQI,Median AQI,Days CO,Days NO2,Days Ozone,Days PM2.5,Days PM10
California,Fresno,2025,365,120,190,45,9,1,0,180,112,61,0,5,130,220,10
Louisiana,Orleans,2025,350,250,90,9,1,0,0,155,88,43,0,2,200,148,0
"""

class EpaCountyAqiTests(unittest.TestCase):
    def test_parser_builds_county_keys_and_aqi_over_100_days(self):
        rows=parse_csv(io.StringIO(FIXTURE))
        self.assertEqual(rows["CA|fresno"]["daysWithAqi"],365)
        self.assertEqual(rows["CA|fresno"]["aqiAbove100Days"],55)
        self.assertEqual(rows["CA|fresno"]["maxAqi"],180)
        self.assertEqual(rows["LA|orleans"]["medianAqi"],43)

    def test_snapshot_builds_state_county_day_aggregates(self):
        rows=parse_csv(io.StringIO(FIXTURE))
        out=build_snapshot(rows,"2026-11-20")
        self.assertEqual(out["year"],2025)
        self.assertEqual(out["countyCount"],2)
        self.assertEqual(out["states"]["CA"]["monitoredCounties"],1)
        self.assertEqual(out["states"]["CA"]["countyDaysWithAqi"],365)
        self.assertEqual(out["states"]["CA"]["aqiAbove100CountyDays"],55)
        self.assertIn("not zero pollution",out["coverage"].lower())
        self.assertIn("some, but not all",out["coverage"].lower())

if __name__=="__main__":
    unittest.main()
