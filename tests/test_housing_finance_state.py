import unittest
from datetime import date
from scripts.update_housing_finance_state import normalize_hmda, normalize_cfpb, build_snapshot

class HousingFinanceTests(unittest.TestCase):
    def test_hmda_normalization_uses_originations_and_denials_only(self):
        raw={"aggregations":[
            {"actions_taken":"1","count":80,"sum":20000000},
            {"actions_taken":"3","count":20,"sum":4000000}
        ]}
        out=normalize_hmda(raw)
        self.assertEqual(out["originatedCount"],80)
        self.assertEqual(out["deniedCount"],20)
        self.assertEqual(out["originatedAmount"],20000000)
        self.assertEqual(out["deniedAmount"],4000000)
        self.assertEqual(out["deniedShareOfOriginatedOrDeniedPct"],20.0)

    def test_cfpb_normalization_keeps_complaint_caveat_fields(self):
        raw={
          "hits":{"total":{"value":1000}},
          "aggregations":{
            "issue":{"issue":{"buckets":[{"key":"Trouble during payment process","doc_count":420}]}},
            "company":{"company":{"buckets":[{"key":"Example Mortgage LLC","doc_count":200}]}},
            "timely":{"timely":{"buckets":[{"key":"Yes","doc_count":990},{"key":"No","doc_count":10}]}},
            "company_response":{"company_response":{"buckets":[{"key":"Closed with explanation","doc_count":880}]}}
          }
        }
        out=normalize_cfpb(raw)
        self.assertEqual(out["complaintCount"],1000)
        self.assertEqual(out["topIssue"],{"name":"Trouble during payment process","count":420})
        self.assertEqual(out["topCompany"],{"name":"Example Mortgage LLC","count":200})
        self.assertEqual(out["timelyResponsePct"],99.0)
        self.assertEqual(out["topCompanyResponse"],{"name":"Closed with explanation","count":880})

    def test_snapshot_is_statewide_context_and_not_county_specific(self):
        rows={"CA":{"hmda":{"originatedCount":80,"deniedCount":20},"cfpb":{"complaintCount":1000}}}
        out=build_snapshot(rows,date(2026,11,20))
        self.assertEqual(out["scope"],"statewide context")
        self.assertIn("not county-specific",out["coverage"].lower())
        self.assertEqual(out["states"]["CA"]["hmda"]["originatedCount"],80)

if __name__=="__main__":
    unittest.main()
