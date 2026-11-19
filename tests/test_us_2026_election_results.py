"""Tests for the nationwide 2026 election-result cache used by Congressional Atlas."""
import unittest
from scripts import update_us_2026_election_results as source

RACE_COLUMNS = [
    "race_id","state","office","title","status","outcome","candidate","party",
    "votes","share_pct","total_votes","seats","called_utc","count_updated_utc",
    "source","source_url","source_read_utc","page_url",
]
COUNTY_COLUMNS = [
    "race_id","state","office","place_kind","fips","place","candidate_a","party_a",
    "votes_a","candidate_b","party_b","votes_b","votes_other","total_votes",
    "finished","count_updated_utc",
]

def race(*values):
    return list(values)

class ElectionCacheTests(unittest.TestCase):
    def setUp(self):
        self.races = {
            "schema_version":"ctm-results-open-data-v1",
            "credit":"Call the Map (callthemap.com/results); counts in part from civicAPI (civicapi.org)",
            "last_updated_utc":"2026-11-19T03:25:33Z",
            "source_read_utc":"2026-11-19T03:26:13Z",
            "columns":[{"name":name} for name in RACE_COLUMNS],
            "rows":[
                race("CA-01","CA","House","California 1st District","called","won","Mike McGuire","D",160012,58.01,275838,1,"2026-11-04T21:49:04Z","2026-11-19T02:00:00Z","civicAPI","https://civicapi.org/race/example","2026-11-19T03:00:00Z","https://www.callthemap.com/results/house/ca-01"),
                race("CA-01","CA","House","California 1st District","called","","James Gallagher","R",115826,41.99,275838,1,"2026-11-04T21:49:04Z","2026-11-19T02:00:00Z","civicAPI","https://civicapi.org/race/example","2026-11-19T03:00:00Z","https://www.callthemap.com/results/house/ca-01"),
                race("LA-05","LA","House","Louisiana 5th District","counting","leads","Patricia Moore","D",40786,17.89,227923,1,"","2026-11-17T03:12:14Z","Louisiana Secretary of State","https://example.gov/la","2026-11-17T04:40:32Z","https://www.callthemap.com/results/house/la-05"),
                race("LA-05","LA","House","Louisiana 5th District","counting","","Gabe Firment","R",39126,17.17,227923,1,"","2026-11-17T03:12:14Z","Louisiana Secretary of State","https://example.gov/la","2026-11-17T04:40:32Z","https://www.callthemap.com/results/house/la-05"),
                race("SEN-AK","AK","Senate","Alaska U.S. Senate","called","won","Mary Peltola","D",151000,52.0,290000,1,"2026-11-05T00:00:00Z","2026-11-18T00:00:00Z","civicAPI","https://civicapi.org/race/sen-ak","2026-11-19T03:00:00Z","https://www.callthemap.com/results/senate/alaska"),
                race("SEN-AK","AK","Senate","Alaska U.S. Senate","called","","Dan Sullivan","R",139000,48.0,290000,1,"2026-11-05T00:00:00Z","2026-11-18T00:00:00Z","civicAPI","https://civicapi.org/race/sen-ak","2026-11-19T03:00:00Z","https://www.callthemap.com/results/senate/alaska"),
                race("GOV-TX","TX","Governor","Texas Governor","final","won","Example Republican","R",5000000,52.0,9600000,1,"2026-11-04T10:00:00Z","2026-11-18T00:00:00Z","Texas Secretary of State","https://example.gov/tx","2026-11-19T03:00:00Z","https://www.callthemap.com/results/governors/texas"),
                race("GOV-TX","TX","Governor","Texas Governor","final","","Example Democrat","D",4600000,48.0,9600000,1,"2026-11-04T10:00:00Z","2026-11-18T00:00:00Z","Texas Secretary of State","https://example.gov/tx","2026-11-19T03:00:00Z","https://www.callthemap.com/results/governors/texas"),
            ],
        }
        self.counties = {
            "schema_version":"ctm-results-open-data-v1",
            "last_updated_utc":"2026-11-19T03:25:33Z",
            "columns":[{"name":name} for name in COUNTY_COLUMNS],
            "rows":[
                ["SEN-AK","AK","Senate","house district","02901","House District 1","Mary Peltola","D",6200,"Dan Sullivan","R",4100,100,10400,"yes","2026-11-18T00:00:00Z"],
                ["GOV-TX","TX","Governor","county","48001","Anderson County","Example Democrat","D",1000,"Example Republican","R",1800,100,2900,"yes","2026-11-18T00:00:00Z"],
                ["GOV-TX","TX","Governor","county","48003","Andrews County","Example Democrat","D",1000,"Example Republican","R",900,1500,3400,"yes","2026-11-18T00:00:00Z"],
            ],
        }

    def test_builds_called_house_results_and_keeps_uncalled_house_seats_pending(self):
        data = source.build_cache(self.races, self.counties)
        called = data["house"]["CA-01"]
        self.assertEqual(called["mapParty"], "democratic")
        self.assertEqual(called["winner"], "Mike McGuire")
        self.assertEqual(called["status"], "called")
        pending = data["house"]["LA-05"]
        self.assertEqual(pending["mapParty"], "pending")
        self.assertEqual(pending["leader"], "Patricia Moore")
        self.assertEqual(pending["leaderParty"], "democratic")
        self.assertEqual(pending["status"], "counting")

    def test_builds_2026_senate_and_governor_statewide_results(self):
        data = source.build_cache(self.races, self.counties)
        self.assertEqual(data["senate"]["AK"]["mapParty"], "democratic")
        self.assertEqual(data["senate"]["AK"]["winner"], "Mary Peltola")
        self.assertEqual(data["governor"]["TX"]["mapParty"], "republican")
        self.assertEqual(data["governor"]["TX"]["winner"], "Example Republican")

    def test_county_or_alaska_district_color_is_only_assigned_when_pairwise_winner_is_provable(self):
        data = source.build_cache(self.races, self.counties)
        ak = data["senate"]["AK"]["units"]["02901"]
        self.assertEqual(ak["mapParty"], "democratic")
        tx = data["governor"]["TX"]["units"]
        self.assertEqual(tx["48001"]["mapParty"], "republican")
        self.assertEqual(tx["48003"]["mapParty"], "unknown")

    def test_cache_preserves_source_status_and_attribution(self):
        data = source.build_cache(self.races, self.counties)
        self.assertEqual(data["schemaVersion"], 1)
        self.assertEqual(data["electionDate"], "2026-11-03")
        self.assertEqual(data["asOf"], "2026-11-19T03:25:33Z")
        self.assertIn("Call the Map", data["credit"])
        self.assertEqual(data["house"]["CA-01"]["source"], "civicAPI")

    def test_javascript_exports_one_static_browser_cache(self):
        data = source.build_cache(self.races, self.counties)
        js = source.javascript(data)
        self.assertIn("US_ELECTION_2026", js)
        self.assertIn('"CA-01"', js)
        self.assertIn('"mapParty":"pending"', js)

if __name__ == "__main__":
    unittest.main()
