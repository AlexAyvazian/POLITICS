import io
import unittest
from scripts import update_voteview_rollcalls as vv

MEMBERS = '''congress,chamber,icpsr,state_icpsr,district_code,state_abbrev,party_code,bioname,bioguide_id
119,House,10001,41,3,AL,200,EXAMPLE ONE,H000001
119,House,10002,41,4,AL,100,EXAMPLE TWO,H000002
119,Senate,10003,41,0,AL,100,EXAMPLE SENATOR,S000001
'''
ROLLS = '''congress,chamber,rollnumber,date,session,clerk_rollnumber,bill_number,vote_result,vote_desc,vote_question
119,House,17,2026-09-16,2,314,S2403,Passed,Retire through Ownership Act,On Motion to Suspend
119,House,18,2026-09-16,2,315,HRES101,Failed,Another motion,On Passage
'''
VOTES = '''congress,chamber,rollnumber,icpsr,cast_code,prob
119,House,17,10001,1,100.0
119,House,17,10002,6,100.0
119,House,17,10003,0,0
119,House,18,10001,9,95.0
119,House,18,10002,0,0
'''

class CongressionalVoteviewTests(unittest.TestCase):
 def test_merge_preserves_exact_bioguide_member_and_official_roll_number(self):
  members=vv.parse_members(io.StringIO(MEMBERS))
  rolls=vv.parse_rollcalls(io.StringIO(ROLLS),'House')
  rows=vv.parse_votes(io.StringIO(VOTES),'House')
  profiles=vv.assemble(members,rolls,rows,'House')
  self.assertEqual(profiles['H000001'][0]['cast'],'Yea')
  self.assertEqual(profiles['H000001'][0]['roll'],314)
  self.assertEqual(profiles['H000001'][0]['url'],'https://clerk.house.gov/Votes/2026314')
  self.assertEqual(profiles['H000002'][0]['cast'],'Nay')
  self.assertEqual(profiles['H000001'][1]['cast'],'Not Voting')
  self.assertEqual(len(profiles['H000002']),1)
  self.assertNotIn('S000001',profiles)
 def test_voteview_cast_codes_preserve_important_distinctions(self):
  self.assertEqual(vv.CAST[2],'Paired Yea')
  self.assertEqual(vv.CAST[3],'Announced Yea')
  self.assertEqual(vv.CAST[4],'Announced Nay')
  self.assertEqual(vv.CAST[5],'Paired Nay')
  self.assertEqual(vv.CAST[7],'Present')
  self.assertEqual(vv.CAST[9],'Not Voting')
  self.assertNotIn(0,vv.CAST)
 def test_voteview_rollnumber_is_not_official_clerk_rollnumber(self):
  rolls=vv.parse_rollcalls(io.StringIO(ROLLS),'House')
  self.assertEqual(rolls[17]['roll'],314)
  self.assertEqual(rolls[17]['voteviewRoll'],17)
 def test_missing_bioguide_is_not_automatically_assigned_by_surname(self):
  src=MEMBERS+'119,House,10004,41,8,AL,100,MEMBER WITH NO ID,\n'
  members=vv.parse_members(io.StringIO(src))
  self.assertNotIn(10004,members)
 def test_reject_inadequate_or_wrong_chamber_data(self):
  with self.assertRaises(ValueError):
   vv.parse_votes(io.StringIO('bad,header\nabc\n'),'House')
  self.assertFalse(vv.parse_rollcalls(io.StringIO(ROLLS),'Senate'))

if __name__=='__main__':
 unittest.main()
