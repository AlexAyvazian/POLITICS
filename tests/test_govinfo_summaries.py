import unittest
from scripts.update_congressional_bill_summaries import parse_summary,govinfo_url,plain_text
SAMPLE='''<BillSummaries>
  <item><title>H.R. 2102, Major Richard Star Act</title>
    <summary><action-date>2026-10-27</action-date><action-desc>Passed House</action-desc><summary-text>&lt;p&gt;This bill would allow eligible veterans to receive retired pay and disability compensation concurrently.&lt;/p&gt;</summary-text></summary>
    <summary><action-date>2025-03-14</action-date><action-desc>Introduced</action-desc><summary-text>&lt;p&gt;Earlier introduction summary.&lt;/p&gt;</summary-text></summary>
  </item>
</BillSummaries>'''
class GovinfoSummaryTests(unittest.TestCase):
 def test_keyless_url(self):
  self.assertEqual(govinfo_url('HR2102'),'https://www.govinfo.gov/bulkdata/BILLSUM/119/hr/BILLSUM-119hr2102.xml')
  self.assertEqual(govinfo_url('S3371'),'https://www.govinfo.gov/bulkdata/BILLSUM/119/s/BILLSUM-119s3371.xml')
  self.assertIsNone(govinfo_url('PN1129'))
 def test_parses_latest_official_status_and_human_text(self):
  parsed=parse_summary(SAMPLE.encode(),'HR2102')
  self.assertEqual(parsed['title'],'H.R. 2102, Major Richard Star Act')
  self.assertIn('eligible veterans',parsed['summary'])
  self.assertEqual(parsed['summaryStage'],'Passed House')
  self.assertEqual(parsed['summaryDate'],'2026-10-27')
  self.assertNotIn('<p>',parsed['summary'])
 def test_no_missing_xml_or_empty_crs_summary_published(self):
  self.assertIsNone(parse_summary(b'<html>bad</html>','HR2102'))
  self.assertIsNone(parse_summary(b'<BillSummaries><item><title>No summary</title></item></BillSummaries>','HR2102'))
 def test_preserves_sentence_boundaries_and_does_not_invent_budget_data(self):
  self.assertEqual(plain_text('&lt;p&gt;An estimated $5 billion. &amp;amp; more.&lt;/p&gt;'), 'An estimated $5 billion. & more.')
if __name__=='__main__':unittest.main()
