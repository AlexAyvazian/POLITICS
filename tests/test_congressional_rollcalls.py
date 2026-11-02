import unittest
from scripts import update_congressional_rollcalls as v
HOUSE='''<?xml version="1.0"?><rollcall-vote><vote-metadata><congress>119</congress><session>2nd</session><rollcall-num>314</rollcall-num><legis-num>S. 2403</legis-num><vote-question>On Motion to Suspend the Rules and Pass</vote-question><vote-result>Passed</vote-result><action-date>16-Sep-2026</action-date></vote-metadata><vote-data><recorded-vote><legislator name-id="H000001">Example</legislator><vote>Yea</vote></recorded-vote><recorded-vote><legislator name-id="H000002">Example 2</legislator><vote>Not Voting</vote></recorded-vote></vote-data></rollcall-vote>'''
SENATE='''<?xml version="1.0"?><roll_call_vote><congress>119</congress><session>2</session><vote_number>256</vote_number><vote_date>September 30, 2026</vote_date><vote_question_text>On the Nomination</vote_question_text><vote_result>Nomination Confirmed</vote_result><vote_document_text>PN1129</vote_document_text><members><member><last_name>Tester</last_name><state>CO</state><vote_cast>Nay</vote_cast></member><member><last_name>Other</last_name><state>UT</state><vote_cast>Yea</vote_cast></member></members></roll_call_vote>'''
class RollCallTests(unittest.TestCase):
 def test_house_id_matches_bioguide_and_captures_explicit_not_voting(self):
  r=v.parse_house(HOUSE.encode(),2026,314,min_members=2)
  self.assertEqual(r['members']['H000001'],'Yea')
  self.assertEqual(r['members']['H000002'],'Not Voting')
  self.assertEqual(len(r['members']),2)
  self.assertEqual(r['roll'],314)
  self.assertEqual(r['date'],'2026-09-16')
  self.assertEqual(r['measure'],'S. 2403')
 def test_senate_keeps_exact_state_surname_and_recorded_choice(self):
  r=v.parse_senate(SENATE.encode(),2026,256,min_members=2)
  self.assertEqual(r['members'][0],{'state':'CO','lastName':'Tester','cast':'Nay'})
  self.assertEqual(r['members'][1]['cast'],'Yea')
  self.assertEqual(r['year'],2026)
 def test_invalid_and_incomplete_votes_cannot_be_published(self):
  with self.assertRaises(ValueError):
   v.parse_house(b'<html>Not found</html>',2026,314,min_members=2)
  with self.assertRaises(ValueError):
   v.parse_senate(SENATE.replace('On the Nomination','').encode(),2026,256,min_members=70)
 def test_official_file_urls_never_use_forecasts(self):
  self.assertEqual(v.house_url(2026,314),'https://clerk.house.gov/evs/2026/roll314.xml')
  self.assertEqual(v.senate_url(2026,256),'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00256.xml')
if __name__=='__main__':unittest.main()
