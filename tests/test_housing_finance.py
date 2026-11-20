import unittest
from datetime import date
from scripts.update_housing_finance import (
    cfpb_window, normalize_cfpb, normalize_hmda, build_snapshot
)

class HousingFinanceTests(unittest.TestCase):
    def test_cfpb_window_is_rolling_24_months(self):
        self.assertEqual(cfpb_window(date(2026,11,20)),("2024-11-20","2026-11-20"))

    def test_normalize_hmda_keeps_originated_and_denied_separate(self):
        raw={"parameters":{"state":"CA","actions_taken":"1,3"},"aggregations":[
            {"sum":69622765000,"count":177363,"actions_taken":"3"},
            {"sum":344737760000,"count":572268,"actions_taken":"1"},
        ]}
        out=normalize_hmda(raw)
        self.assertEqual(out["originatedCount"],572268)
        self.assertEqual(out["deniedCount"],177363)
        self.assertEqual(out["originatedAmount"],344737760000)
        self.assertEqual(out["deniedAmount"],69622765000)
        self.assertAlmostEqual(out["denialShareOriginatedPlusDeniedPct"],23.66,places=2)

    def test_normalize_cfpb_extracts_count_issue_response_and_timeliness(self):
        raw={
          "hits":{"total":{"value":7440},"hits":[]},
          "aggregations":{
            "issue":{"issue":{"buckets":[{"key":"Trouble during payment process","doc_count":3371}]}},
            "timely":{"timely":{"buckets":[{"key":"Yes","doc_count":7177},{"key":"No","doc_count":263}]}},
            "company_response":{"company_response":{"buckets":[{"key":"Closed with explanation","doc_count":6798}]}},
          }
        }
        out=normalize_cfpb(raw)
        self.assertEqual(out["complaintCount"],7440)
        self.assertEqual(out["topIssue"],{"name":"Trouble during payment process","count":3371})
        self.assertEqual(out["topCompanyResponse"],{"name":"Closed with explanation","count":6798})
        self.assertAlmostEqual(out["timelyResponsePct"],96.47,places=2)

    def test_snapshot_requires_atlas_states_and_preserves_scope(self):
        hmda={"CA":{"originatedCount":10,"deniedCount":2},"NY":{"originatedCount":9,"deniedCount":3}}
        cfpb={"CA":{"complaintCount":5},"NY":{"complaintCount":4}}
        out=build_snapshot(["CA","NY"],hmda,cfpb,date(2026,11,20))
        self.assertEqual(out["stateCount"],2)
        self.assertEqual(out["hmdaYear"],2025)
        self.assertEqual(out["cfpbPeriod"],{"start":"2024-11-20","end":"2026-11-20"})
        self.assertEqual(out["states"]["CA"]["hmda"]["originatedCount"],10)
        self.assertEqual(out["states"]["NY"]["cfpb"]["complaintCount"],4)

if __name__=="__main__":
    unittest.main()
