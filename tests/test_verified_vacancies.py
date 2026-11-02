"""Official-source vacancy checks should never infer a vacancy from absent roster data."""
import unittest
from scripts import update_verified_vacancies as m

CLERK = """<h1>Vacancies of the 119th Congress</h1><h2>Session 2</h2><ul>
<li><p>Georgia – 13th District</p><p>Passed Away</p><h3>Rep. David Scott</h3>
<p>Succeeded August 25, 2026</p><h3>Rep. Everton Blair Jr.</h3></li>
<li><p>Florida – 20th District</p><h3>Rep. Sheila Cherfilus-McCormick</h3>
<p>Special Election</p><h3>Date TBD</h3></li>
<li><p>Texas – 23rd District</p><h3>Rep. Tony Gonzales</h3><p>Special Election</p><h3>Date TBD</h3></li>
<li><p>California – 14th District</p><h3>Rep. Eric Swalwell</h3><p>Succeeded August 18, 2026</p></li>
</ul><h2>Session 1</h2><li>Texas – 18th District</li><p>Succeeded February 2, 2026</p>"""
CA_VACANT = '<h2>Member Vacant</h2><p>District: 03</p><p>Party: Vacant</p>'
CA_FILLED = '<h2>Member Elected</h2><p>District: 03</p><p>Party: Republican</p>'

class VacancySourceTests(unittest.TestCase):
 def test_current_house_vacancies_only_not_successor_sworn(self):
  seats=m.parse_current_house(CLERK)
  self.assertEqual({(s['state'],s['district']) for s in seats},{('FL','20'),('TX','23')})
  self.assertTrue(all(s['sourceUrl']==m.CLERK for s in seats))
 def test_ca_assembly_status_exact_not_based_on_missing_member(self):
  seat=m.parse_ca_assembly(CA_VACANT)
  self.assertEqual((seat['state'],seat['district'],seat['status']),('CA','003','vacant'))
  self.assertIsNone(m.parse_ca_assembly(CA_FILLED))
  with self.assertRaises(ValueError):
   m.parse_ca_assembly('Some arbitrary page')
 def test_house_parser_rejects_unrelated_page(self):
  with self.assertRaises(ValueError):
   m.parse_current_house('<html><body>No official current vacancies list</body></html>')

if __name__=='__main__':unittest.main()
