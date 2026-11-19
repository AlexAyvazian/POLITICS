import unittest
from datetime import datetime, timezone, timedelta
from scripts.update_fara_explanations import explain_supplemental, clean_activity, should_attempt

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
if __name__ == '__main__':unittest.main()
