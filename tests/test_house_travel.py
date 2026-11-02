import io
import unittest
from scripts.update_house_travel import parse_house_xml, match_house
XML='''<GiftTravel><Travel><DocID>500033353</DocID><FilerName>Nathan Dadap</FilerName><MemberName>Mullin, Kevin</MemberName><State>CA</State><District>15</District><Year>2026</Year><Destination>Richmond, VA</Destination><FilingType>Original</FilingType><DepartureDate>12/15/2025</DepartureDate><ReturnDate>12/15/2025</ReturnDate><TravelSponsor>Edison Foundation</TravelSponsor></Travel></GiftTravel>'''
class HouseGiftTests(unittest.TestCase):
 def test_reports_explicit_sponsor_and_location_without_asserting_member_traveled(self):
  rows=parse_house_xml(XML.encode())
  self.assertEqual(rows[0]['sponsor'],'Edison Foundation')
  self.assertEqual(rows[0]['destination'],'Richmond, VA')
  self.assertEqual(rows[0]['filer'],'Nathan Dadap')
  self.assertEqual(rows[0]['travelerType'],'not-established')
 def test_exact_member_state_and_district_join(self):
  rows=parse_house_xml(XML.encode())
  people=[{'id':{'bioguide':'M001200'},'name':{'first':'Kevin','last':'Mullin'},'terms':[{'type':'rep','state':'CA','district':15}]},
          {'id':{'bioguide':'W001100'},'name':{'first':'Kevin','last':'Mullin'},'terms':[{'type':'rep','state':'WA','district':15}]}]
  matched=match_house(rows,people)
  self.assertIn('M001200',matched)
  self.assertNotIn('W001100',matched)
 def test_honors_filing_year_without_inventing_2026_departure_dates(self):
  self.assertEqual(parse_house_xml(XML.encode())[0]['reportedYear'],2026)
  self.assertEqual(parse_house_xml(XML.encode())[0]['beginDate'],'12/15/2025')
 def test_unmatched_member_name_cannot_be_joined_by_district_only(self):
  rows=parse_house_xml(XML.replace('Mullin, Kevin','Other, Member').encode())
  people=[{'id':{'bioguide':'M001200'},'name':{'first':'Kevin','last':'Mullin'},'terms':[{'type':'rep','state':'CA','district':15}]}]
  self.assertEqual(match_house(rows,people),{})
if __name__=='__main__':unittest.main()
