import unittest

from scripts.update_ca_statewide_results import parse_counties, parse_governor_results


class CaliforniaStatewideElectionUpdaterTests(unittest.TestCase):
    def test_county_codes_map_to_california_fips(self):
        text='''[S|CAS|2|1|Alameda]\n[S|CAS|3|10|Fresno]\n[S|CAS|4|58|Yuba]\n[S|CAS|5|59|Statewide]'''
        counties=parse_counties(text)
        self.assertEqual(counties[1],('06001','Alameda'))
        self.assertEqual(counties[10],('06019','Fresno'))
        self.assertEqual(counties[58],('06115','Yuba'))
        self.assertNotIn(59,counties)

    def test_governor_rows_extract_candidate_votes_shares_and_winner(self):
        counties={1:('06001','Alameda'),10:('06019','Fresno'),58:('06115','Yuba')}
        text='''[B|CAS|1|20261118|2258180]
[V|CAS|244|020000000000|1|627|627|U|3654|458215|100.0|81.0|3631|107463|100.0|19.0]
[V|CAS|999|020000000000|10|396|396|U|3654|149941|100.0|55.8|3631|118626|100.0|44.2]
[V|CAS|1111|020000000000|58|23|23|U|3654|10436|100.0|43.6|3631|13502|100.0|56.4]
'''
        result=parse_governor_results(text,counties)
        self.assertEqual(result['asOf'],'2026-11-18T22:58:18Z')
        self.assertEqual(result['counties']['06001']['party'],'democratic')
        self.assertEqual(result['counties']['06001']['winner'],'Xavier Becerra')
        self.assertEqual(result['counties']['06019']['demPct'],55.8)
        self.assertEqual(result['counties']['06115']['party'],'republican')
        self.assertEqual(result['counties']['06115']['winner'],'Steve Hilton')

    def test_parser_rejects_incomplete_county_set_for_publish(self):
        counties={1:('06001','Alameda')}
        text='''[B|CAS|1|20261118|2258180]
[V|CAS|244|020000000000|1|627|627|U|3654|458215|100.0|81.0|3631|107463|100.0|19.0]
'''
        result=parse_governor_results(text,counties)
        self.assertEqual(len(result['counties']),1)


if __name__=='__main__':
    unittest.main()
