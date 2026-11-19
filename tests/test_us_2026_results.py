import unittest

from scripts.update_us_2026_results import build_dataset


class US2026ElectionResultTests(unittest.TestCase):
    def sample_races(self):
        columns=[{"name":x} for x in [
            "race_id","state","office","title","status","outcome","candidate","party",
            "votes","share_pct","total_votes","seats","called_utc","count_updated_utc",
            "source","source_url","source_read_utc","page_url"
        ]]
        rows=[
            ["CA-05","CA","House","California 5th District","called","won","Ada Blue","D",120,60.0,200,1,"2026-11-04T00:00:00Z","2026-11-05T00:00:00Z","civicAPI","https://civicapi.org/race/1","2026-11-05T01:00:00Z","https://www.callthemap.com/results/house/ca-05"],
            ["CA-05","CA","House","California 5th District","called","","Rex Red","R",80,40.0,200,1,"2026-11-04T00:00:00Z","2026-11-05T00:00:00Z","civicAPI","https://civicapi.org/race/1","2026-11-05T01:00:00Z","https://www.callthemap.com/results/house/ca-05"],
            ["SEN-CA","CA","Senate","California Senate","called","won","Sam Blue","D",130,65.0,200,1,"2026-11-04T00:00:00Z","2026-11-05T00:00:00Z","civicAPI","https://civicapi.org/race/2","2026-11-05T01:00:00Z","https://www.callthemap.com/results/senate/california"],
            ["SEN-CA","CA","Senate","California Senate","called","","Ron Red","R",70,35.0,200,1,"2026-11-04T00:00:00Z","2026-11-05T00:00:00Z","civicAPI","https://civicapi.org/race/2","2026-11-05T01:00:00Z","https://www.callthemap.com/results/senate/california"],
            ["GOV-TX","TX","Governor","Texas Governor","counting","leads","Gina Blue","D",101,50.5,200,1,"","2026-11-05T00:00:00Z","Texas Secretary of State","https://example.test","2026-11-05T01:00:00Z","https://www.callthemap.com/results/governors/texas"],
            ["GOV-TX","TX","Governor","Texas Governor","counting","","Ron Red","R",99,49.5,200,1,"","2026-11-05T00:00:00Z","Texas Secretary of State","https://example.test","2026-11-05T01:00:00Z","https://www.callthemap.com/results/governors/texas"],
        ]
        return {"last_updated_utc":"2026-11-05T00:00:00Z","source_read_utc":"2026-11-05T01:00:00Z","columns":columns,"rows":rows}

    def sample_counties(self):
        columns=[{"name":x} for x in [
            "race_id","state","office","place_kind","fips","place","candidate_a","party_a","votes_a",
            "candidate_b","party_b","votes_b","votes_other","total_votes","finished","count_updated_utc"
        ]]
        rows=[
            ["SEN-CA","CA","Senate","county","06019","Fresno County","Sam Blue","D",55,"Ron Red","R",45,0,100,"yes","2026-11-05T00:00:00Z"],
            ["GOV-TX","TX","Governor","county","48001","Anderson County","Gina Blue","D",40,"Ron Red","R",60,0,100,"yes","2026-11-05T00:00:00Z"],
        ]
        return {"columns":columns,"rows":rows}

    def test_builds_house_senate_governor_and_county_results(self):
        data=build_dataset(self.sample_races(),self.sample_counties(),strict=False)
        self.assertEqual(data["house"]["CA"]["05"]["winner"],"Ada Blue")
        self.assertEqual(data["house"]["CA"]["05"]["party"],"democratic")
        self.assertEqual(data["senate"]["CA"]["winner"],"Sam Blue")
        self.assertEqual(data["senate"]["CA"]["counties"]["06019"]["party"],"democratic")
        self.assertEqual(data["governor"]["TX"]["status"],"counting")
        self.assertEqual(data["governor"]["TX"]["outcome"],"leads")
        self.assertEqual(data["governor"]["TX"]["counties"]["48001"]["party"],"republican")


if __name__=="__main__":
    unittest.main()
