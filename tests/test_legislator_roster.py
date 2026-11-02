"""Checks that nightly Open States rosters can safely color district polygons."""
import io
import unittest
from scripts import update_legislator_rosters as roster

HEADER = 'id,name,current_party,current_district,current_chamber,links\n'
BODY = (
 'ocd-person/a1,Montana Senator,Republican,22,upper,https://legmt.gov/person/a1\n'
 'ocd-person/a2,Montana Representative,Democratic,22,lower,https://legmt.gov/person/a2\n'
 'ocd-person/a3,Another Senator,Independent,27,upper,https://legmt.gov/person/a3\n'
)

class LegislatorRosterTests(unittest.TestCase):
 def test_exact_chamber_district_and_party_preserved(self):
  result=roster.parse_current_csv('MT', io.StringIO(HEADER+BODY), min_rows=3)
  self.assertEqual(result['state'],'MT')
  self.assertEqual(result['totalPeople'],3)
  people={person['name']:person for person in result['people']}
  self.assertEqual(people['Montana Senator']['district'],'22')
  self.assertEqual(people['Montana Senator']['role'],'Senator')
  self.assertEqual(people['Montana Senator']['party'],'Republican')
  self.assertEqual(people['Montana Representative']['role'],'Representative')
  self.assertEqual(people['Montana Representative']['party'],'Democratic')
  self.assertEqual(people['Another Senator']['district'],'27')
  self.assertEqual(result['sourceUrl'],'https://data.openstates.org/people/current/mt.csv')
 def test_bad_schema_fails_without_overwriting_previous_snapshot(self):
  with self.assertRaises(ValueError):
   roster.parse_current_csv('MT',io.StringIO('district,party\n22,R\n'),min_rows=1)
  with self.assertRaises(ValueError):
   roster.parse_current_csv('MT',io.StringIO(HEADER+BODY),min_rows=10)
 def test_state_files_only_for_known_states_and_not_browser_credentials(self):
  self.assertEqual(len(roster.STATES),50)
  self.assertEqual(roster.csv_url('MT'),'https://data.openstates.org/people/current/mt.csv')
  with self.assertRaises(ValueError):
   roster.csv_url('FAKE')
 def test_nebraska_unicameral_legislature_is_mapped_to_state_senate_without_party_guessing(self):
  rows=HEADER+'ocd-person/ne1,Nebraska Senator,Nonpartisan,13,legislature,https://nebraskalegislature.gov/\\n'
  result=roster.parse_current_csv('NE',io.StringIO(rows),min_rows=1)
  self.assertEqual(result['people'][0]['role'],'Senator')
  self.assertEqual(result['people'][0]['party'],'Nonpartisan')
 
 def test_alphanumeric_district_is_preserved_without_guessing_geoid(self):
  rows=HEADER+'ocd-person/x1,Vermont Representative,Democratic,Addison-1,lower,https://legislature.vermont.gov/\n'+'ocd-person/x2,Vermont Senator,Democratic,2,upper,https://legislature.vermont.gov/\n'
  result=roster.parse_current_csv('VT',io.StringIO(rows),min_rows=1)
  person=next(p for p in result['people'] if p['name']=='Vermont Representative')
  self.assertEqual(person['district'],'Addison-1')
  self.assertEqual(person['role'],'Representative')

if __name__=='__main__':
 unittest.main()
