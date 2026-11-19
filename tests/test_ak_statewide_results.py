import unittest

from scripts.update_ak_statewide_results import build_race, build_president, API_SOURCE


class AlaskaStatewideResultTests(unittest.TestCase):
    def sample(self):
        units=[]
        leaders={}
        for i in range(1,41):
            code=f"029{i:02d}"
            a=100+i
            b=80+i
            units.append([code,a,b,a+b,0,None,0,0,0,0])
            leaders[code]=["Mary Peltola",a,"Dan Sullivan",b]
        return {
            "status":"called",
            "updated_utc":"2026-11-19T03:21:51Z",
            "pair":{"a":"Mary Peltola","b":"Dan Sullivan"},
            "candidates":[
                {"name":"Mary Peltola","party":"D"},
                {"name":"Dan Sullivan","party":"R"},
            ],
            "units":units,
            "unit_leaders":leaders,
        }

    def test_build_race_requires_and_publishes_all_40_house_districts(self):
        race=build_race(self.sample(),"U.S. Senate","https://example.test/senate")
        self.assertEqual(len(race["districts"]),40)
        self.assertEqual(race["districts"]["1"]["party"],"democratic")
        self.assertEqual(race["districts"]["40"]["winner"],"Mary Peltola")
        self.assertEqual(race["geography"],"stateHouseDistrict")
        self.assertEqual(race["dataSourceUrl"],API_SOURCE["senate"])

    def test_incomplete_house_district_result_is_rejected(self):
        payload=self.sample()
        payload["units"]=payload["units"][:-1]
        with self.assertRaisesRegex(ValueError,"40 Alaska House districts"):
            build_race(payload,"U.S. Senate","https://example.test/senate")

    def test_certified_2024_president_cache_has_40_house_districts(self):
        race=build_president()
        self.assertEqual(len(race["districts"]),40)
        self.assertEqual(race["districts"]["1"]["party"],"republican")
        self.assertEqual(race["districts"]["2"]["party"],"democratic")
        self.assertEqual(race["status"],"certified")


if __name__=="__main__":
    unittest.main()
