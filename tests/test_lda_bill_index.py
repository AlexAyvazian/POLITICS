import unittest
from datetime import date
from scripts.update_lda_bill_index import extract_bill_refs, normalize_filings

class LdaBillIndexTests(unittest.TestCase):
    def test_extracts_common_federal_bill_and_resolution_formats(self):
        text="Support H.R. 428, S. 2503, H.J.Res. 12, S.Res. 88 and H.Con.Res. 4."
        self.assertEqual(
            extract_bill_refs(text),
            ["HCONRES 4","HJRES 12","HR 428","S 2503","SRES 88"],
        )

    def test_normalizer_keeps_only_explicit_bill_mentions_and_deduplicates_filing_bill_pairs(self):
        rows=[
            {
                "filing_uuid":"abc",
                "filing_year":2026,
                "filing_type_display":"2nd Quarter - Report",
                "filing_period_display":"2nd Quarter",
                "filing_document_url":"https://lda.gov/filings/public/filing/abc/print/",
                "income":"50000.00","expenses":None,
                "client":{"name":"Example Client"},
                "registrant":{"name":"Example Firm"},
                "lobbying_activities":[
                    {"general_issue_code_display":"Budget/Appropriations","description":"H.R. 428 and HR 428 implementation",
                     "government_entities":[{"name":"HOUSE OF REPRESENTATIVES"}],"lobbyists":[]},
                    {"general_issue_code_display":"Taxation","description":"General tax policy","government_entities":[],"lobbyists":[]},
                ],
            },
            {
                "filing_uuid":"def","filing_year":2026,"filing_type_display":"Registration",
                "filing_document_url":"https://lda.gov/filings/public/filing/def/print/",
                "income":None,"expenses":None,
                "client":{"name":"No Bill Client"},"registrant":{"name":"No Bill Firm"},
                "lobbying_activities":[{"general_issue_code_display":"Health","description":"General health policy","government_entities":[]}],
            },
        ]
        out=normalize_filings(rows,2026,date(2026,11,20))
        self.assertEqual(out["filingsIndexed"],1)
        self.assertEqual(list(out["bills"]),["HR 428"])
        item=out["bills"]["HR 428"]["filings"][0]
        self.assertEqual(item["client"],"Example Client")
        self.assertEqual(item["registrant"],"Example Firm")
        self.assertEqual(item["reportedAmount"],50000.0)
        self.assertEqual(item["reportedAmountKind"],"income")
        self.assertEqual(item["governmentEntities"],["HOUSE OF REPRESENTATIVES"])
        self.assertEqual(item["descriptions"],["H.R. 428 and HR 428 implementation"])

if __name__=="__main__":
    unittest.main()
