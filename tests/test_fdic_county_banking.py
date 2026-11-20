import unittest
from scripts.update_fdic_county_banking import normalize_location, build_snapshot, state_filter

class FdicCountyBankingTests(unittest.TestCase):
    def test_state_filter_quotes_oregon_boolean_keyword(self):
        self.assertEqual(state_filter("OR"), 'STALP:"OR"')

    def test_normalize_location_preserves_county_and_office_type(self):
        row={"STCNTY":"06019","STALP":"CA","COUNTY":"Fresno","CERT":"1768","NAME":"Mechanics Bank",
             "SERVTYPE":"11","SERVTYPE_DESC":"FULL SERVICE - BRICK AND MORTAR","MAINOFF":"0","RUNDATE":"11/13/2026"}
        out=normalize_location(row)
        self.assertEqual(out["fips"],"06019")
        self.assertEqual(out["cert"],"1768")
        self.assertTrue(out["fullServiceBrickMortar"])
        self.assertFalse(out["mainOffice"])
        self.assertEqual(out["runDate"],"2026-11-13")

    def test_build_snapshot_counts_offices_and_distinct_institutions(self):
        rows=[
          {"STCNTY":"06019","STALP":"CA","COUNTY":"Fresno","CERT":"100","NAME":"A","SERVTYPE_DESC":"FULL SERVICE - BRICK AND MORTAR","MAINOFF":"0","RUNDATE":"11/13/2026"},
          {"STCNTY":"06019","STALP":"CA","COUNTY":"Fresno","CERT":"100","NAME":"A","SERVTYPE_DESC":"FULL SERVICE - BRICK AND MORTAR","MAINOFF":"0","RUNDATE":"11/13/2026"},
          {"STCNTY":"06019","STALP":"CA","COUNTY":"Fresno","CERT":"200","NAME":"B","SERVTYPE_DESC":"LIMITED SERVICE - RETAIL OFFICE","MAINOFF":"1","RUNDATE":"11/13/2026"},
          {"STCNTY":"06029","STALP":"CA","COUNTY":"Kern","CERT":"100","NAME":"A","SERVTYPE_DESC":"FULL SERVICE - BRICK AND MORTAR","MAINOFF":"0","RUNDATE":"11/13/2026"},
        ]
        out=build_snapshot(rows,"2026-11-20T12:00:00Z",min_offices=1,min_counties=1)
        fresno=out["counties"]["06019"]
        self.assertEqual(fresno["officeCount"],3)
        self.assertEqual(fresno["institutionCount"],2)
        self.assertEqual(fresno["fullServiceBrickMortar"],2)
        self.assertEqual(fresno["mainOfficeCount"],1)
        self.assertEqual(out["officeCount"],4)
        self.assertEqual(out["dataAsOf"],"2026-11-13")

    def test_invalid_county_fips_is_dropped_not_mapped_to_zero(self):
        self.assertIsNone(normalize_location({"STCNTY":"","CERT":"1","RUNDATE":"11/13/2026"}))

if __name__=="__main__":
    unittest.main()
