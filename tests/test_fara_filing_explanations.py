import unittest
from datetime import datetime, timezone, timedelta
from scripts.update_fara_explanations import explain_supplemental, clean_activity, should_attempt, prioritize_plan_entries

FILING = """
For 6 Month Period Ending 04/30/2026
1. (a) Name of Registrant
Kobre & Kim LLP
(b) Registration Number
6604
9. In addition to those named in Items 7 and 8, if any, list the foreign principal(s)
Roman Arkadyevich Abramovich
## III - ACTIVITIES
11. During this 6 month reporting period, has the registrant engaged in any activities?
Foreign Principal
Roman Arkadyevich Abramovich
Activities/Services
During this six-month reporting period, the registrant engaged in legal services exempt from registration under 22 U.S.C § 613(g).
12. During this 6 month reporting period, has the registrant, on behalf of any foreign principal, engaged in political activity?
## IV - FINANCIAL INFORMATION
14. (a) RECEIPTS-MONIES
| Foreign Principal | Date Received | From Whom | Purpose | Amount |
| Roman Arkadyevich Abramovich | 11/01/2025-04/30/2026 | See attached rider. | See attached rider. | $ .01 |
15. (a) DISBURSEMENTS-MONIES
| Foreign Principal | Date | Recipient | Purpose | Amount |
| Roman Arkadyevich Abramovich | 11/01/2025-04/30/2026 | See attached rider. | See attached rider. | $ .01 |
## Rider 14(a)
Roman Arkadyevich Abramovich: During this six-month reporting period, the registrant received funds in the interests of the foreign principal for legal services exempt from registration under 22 U.S.C. § 613(g). All such payments are pursuant to license(s) from the UK Office of Financial Sanctions. Because the e-File system required a non-zero numerical entry, the amount listed as the "Total" ($0.01) was entered as a placeholder and does not represent the amount of monies received.
## Rider 15(a)
Roman Arkadyevich Abramovich: During this six-month reporting period, the registrant made disbursements on behalf of the foreign principal for legal services exempt from registration under 22 U.S.C. § 613(g). All such disbursements are pursuant to license(s) from the UK Office of Financial Sanctions. Because the e-File system required a non-zero numerical entry, the amount listed as the "Total" ($0.01) was entered as a placeholder and does not represent the amount of monies received.
"""
class TestFaraEvidence(unittest.TestCase):
 def test_placeholder_cannot_be_treated_as_real_money(self):
  doc=explain_supplemental(FILING,'6604','https://efile.fara.gov/docs/6604-Supplemental-Statement-20260603-15.pdf')
  self.assertEqual(doc['registrationNumber'],'6604')
  self.assertEqual(doc['periodEnd'],'2026-04-30')
  self.assertIsNone(doc['totalReceivedUsd'])
  self.assertIsNone(doc['totalDisbursedUsd'])
  self.assertEqual(doc['moneyStatus'],'placeholder_not_actual')
  self.assertIn('placeholder',doc['moneyExplanation'].lower())
  self.assertIn('legal services',doc['servicesSummary'].lower())
  self.assertIn('UK',doc['servicesSummary'])
 def test_form_questions_are_not_reported_as_actual_political_contacts(self):
  doc=explain_supplemental(FILING,'6604','https://efile.fara.gov/docs/6604-Supplemental-Statement-20260603-15.pdf')
  self.assertIsNone(doc['contactsSummary'])
  self.assertNotIn('contacted',doc['servicesSummary'].lower())
 def test_actual_services_extracted_but_form_template_excluded(self):
  text='## III - ACTIVITIES\n11. Activity\nActivities/Services\nNo services were rendered for this principal.\n## IV - FINANCIAL INFORMATION\n'
  self.assertIsNone(clean_activity('If yes, identify each foreign principal and describe in full detail all activities and services:'))
  self.assertIn('No services',clean_activity('No services were rendered for this principal.'))
 def test_mismatched_registration_is_rejected(self):
  with self.assertRaises(ValueError):
   explain_supplemental(FILING,'9999','https://efile.fara.gov/docs/6604-Supplemental-Statement-20260603-15.pdf')
 def test_an_unreadable_pdf_does_not_block_tomorrows_new_filing(self):
  now=datetime(2026,11,19,tzinfo=timezone.utc)
  failure={'sourceUrl':'https://efile.fara.gov/docs/999-Supplemental-Statement-20261119.pdf',
           'attemptedAt':now.isoformat(),'reason':'no_text'}
  self.assertFalse(should_attempt(failure,failure['sourceUrl'],now+timedelta(days=1)))
  self.assertTrue(should_attempt(failure,failure['sourceUrl'],now+timedelta(days=8)))
  self.assertTrue(should_attempt(failure,'https://efile.fara.gov/docs/999-Supplemental-Statement-20261120.pdf',now))
  self.assertTrue(should_attempt(None,failure['sourceUrl'],now))
 
 def test_document_without_real_activity_or_money_is_uncertain(self):
  text='1. (a) Name of Registrant\nSome Firm\n(b) Registration Number\n1234\n## III - ACTIVITIES\n## IV - FINANCIAL INFORMATION\n'
  doc=explain_supplemental(text,'1234','https://efile.fara.gov/docs/1234-Supplemental-Statement-20260603.pdf')
  self.assertIsNone(doc['servicesSummary'])
  self.assertEqual(doc['moneyStatus'],'not_extracted')
  self.assertIsNone(doc['totalReceivedUsd'])
  self.assertIsNone(doc['totalDisbursedUsd'])
 def test_verified_filing_totals_and_named_us_political_contacts_are_extracted(self):
  text="""
For 6 Month Period Ending 01/31/2025
(b) Registration Number 5666
9. In addition to those named in Items 7 and 8:
Ministry of Foreign Affairs, Republic of Somaliland
## III - ACTIVITIES
11. Activities/Services
Government relations and public affairs support.
12. Political activity
Ministry of Foreign Affairs, Republic of Somaliland | 11/20/2024 | John Stout, Rep. Burchett | Email | Update on U.S.-Somaliland relations
Ministry of Foreign Affairs, Republic of Somaliland | 11/20/2024 | Wall Street Journal | Text message | U.S.-Somaliland relations
13. Other activity
## IV - FINANCIAL INFORMATION
14. (a) RECEIPTS-MONIES
See Appendix for Response
$ 3,329,032.46
Total
14. (b) RECEIPTS - FUNDRAISING CAMPAIGN
15. (a) DISBURSEMENTS-MONIES
Ministry of Foreign Affairs, Republic of Somaliland | 08/26/2024 | Various | Travel | $ 29.48
$ 12,646.37
Total
15. (b) DISBURSEMENTS-THINGS OF VALUE
"""
  doc=explain_supplemental(text,'5666','https://efile.fara.gov/docs/5666-Supplemental-Statement-20250303-44.pdf',
      ['Ministry of Foreign Affairs, Republic of Somaliland'])
  self.assertEqual(doc['moneyStatus'],'verified_filing_totals')
  self.assertEqual(doc['totalReceivedUsd'],3329032.46)
  self.assertEqual(doc['totalDisbursedUsd'],12646.37)
  self.assertEqual(len(doc['politicalContacts']),1)
  self.assertEqual(doc['politicalContacts'][0]['contact'],'John Stout, Rep. Burchett')
  self.assertIn('1 disclosed U.S. political-contact',doc['contactsSummary'])
  self.assertNotIn('Wall Street Journal',doc['contactsSummary'])

 def test_newest_active_supplements_are_prioritized_before_registration_number(self):
  entries=[
   {'reg':'100','active':True,'doc':{'filed':'01/01/2025'}},
   {'reg':'9000','active':True,'doc':{'filed':'11/18/2026'}},
   {'reg':'8000','active':False,'doc':{'filed':'11/19/2026'}},
  ]
  ordered=prioritize_plan_entries(entries)
  self.assertEqual([x['reg'] for x in ordered],['9000','100','8000'])

if __name__ == '__main__':unittest.main()
