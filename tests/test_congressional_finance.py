import unittest
from scripts.update_congressional_finance import parse_fec_text,crosswalk,select_candidates
def row(fid='S4AR12345',name='EXAMPLE'):
 x=['']*30;x[0]=fid;x[1]=name
 for i,val in {5:'123000',6:'1000',7:'85000',8:'0',10:'49000',
   11:'300',12:'0',13:'0',16:'1000',17:'75000',25:'22000',26:'1800',28:'400',29:'25'}.items():x[i]=val
 x[27]='09/30/2026'
 return '|'.join(x)+'\n'
class FinanceTests(unittest.TestCase):
 def test_exact_column_indices_and_numeric_values(self):
  obj=parse_fec_text(row())
  self.assertEqual(obj['S4AR12345']['raised'],123000)
  self.assertEqual(obj['S4AR12345']['spent'],85000)
  self.assertEqual(obj['S4AR12345']['individualContributions'],75000)
  self.assertEqual(obj['S4AR12345']['committeeContributions'],22000)
  self.assertEqual(obj['S4AR12345']['partyContributions'],1800)
 def test_chamber_filter_and_unique_crosswalk(self):
  people=[{'id':{'bioguide':'B001236','fec':['H4AR12345','S4AR12345']},'terms':[{'type':'rep'},{'type':'sen'}]},
  {'id':{'bioguide':'C001234','fec':['H4AR12345','H6AR99110']},'terms':[{'type':'rep'}]}]
  mapping=crosswalk(people)
  self.assertEqual(mapping['B001236'],['S4AR12345'])
  report=parse_fec_text(row() + row('H4AR12345') + row('H6AR99110'))
  selected=select_candidates(mapping,report)
  self.assertIn('B001236',selected)
  self.assertNotIn('C001234',selected)
 def test_missing_financial_fields_are_not_synthesized(self):
  text=row().replace('123000','')
  self.assertIsNone(parse_fec_text(text)['S4AR12345']['raised'])
if __name__=='__main__':unittest.main()
