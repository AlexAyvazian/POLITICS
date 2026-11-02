import io
import unittest
from scripts.update_congressional_travel import parse_office, select_senate_office, safe_doc
XML='''<GiftRule>
<dbo.filer FirstName="Alex" LastName="Worker"><dbo.Office OfficeName="COLLINS, SUSAN">
<dbo.Document ReportingYear="2026" BeginTravelDate="02/10/2026" EndTravelDate="02/12/2026" DateReceived="03/01/2026"><dbo.Reports ReportTitle="Employee Reimbursed Travel" DocURL="https://giftrule-disclosure.senate.gov/media/2026/test.pdf" /></dbo.Document>
</dbo.Office></dbo.filer>
<dbo.filer FirstName="Susan" LastName="Collins"><dbo.Office OfficeName="COLLINS, SUSAN">
<dbo.Document ReportingYear="2025" BeginTravelDate="04/08/2025" EndTravelDate="04/09/2025"><dbo.Reports ReportTitle="Member Gift Travel" DocURL="https://giftrule-disclosure.senate.gov/media/2025/test2.pdf" /></dbo.Document>
</dbo.Office></dbo.filer>
<dbo.filer FirstName="Jane" LastName="Employee"><dbo.Office OfficeName="SCHUMER, CHUCK">
<dbo.Document ReportingYear="2026" BeginTravelDate="04/08/2026" EndTravelDate="04/09/2026"><dbo.Reports ReportTitle="Employee Gift Travel" DocURL="https://giftrule-disclosure.senate.gov/media/2026/test3.pdf" /></dbo.Document>
</dbo.Office></dbo.filer></GiftRule>'''
class TravelTests(unittest.TestCase):
 def test_office_filing_does_not_claim_staff_travel_was_senators_own(self):
  filings=parse_office(XML.encode())
  self.assertEqual(len(filings['COLLINS, SUSAN']),2)
  self.assertEqual(filings['COLLINS, SUSAN'][0]['travelerType'],'staff')
  self.assertEqual(filings['COLLINS, SUSAN'][1]['travelerType'],'unknown')
 def test_office_name_exact_not_surname_only(self):
  p={'id':{'bioguide':'C001035'},'name':{'first':'Susan','last':'Collins'},'terms':[{'type':'sen'}]}
  n={'id':{'bioguide':'S000148'},'name':{'first':'Charles','nickname':'Chuck','last':'Schumer'},'terms':[{'type':'sen'}]}
  mapping=select_senate_office([p,n],parse_office(XML.encode()))
  self.assertEqual(len(mapping['C001035']),2)
  self.assertEqual(len(mapping['S000148']),1)
 def test_does_not_publish_nonofficial_document_url(self):
  self.assertEqual(safe_doc('https://attacker.tld/notofficial.pdf'),'')
  self.assertTrue(safe_doc('https://giftrule-disclosure.senate.gov/media/2026/test.pdf'))
if __name__=='__main__':unittest.main()
