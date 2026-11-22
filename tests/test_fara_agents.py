import unittest
from datetime import datetime, timezone
from scripts.update_fara_agents import build_agent_outputs

class FaraAgentsTests(unittest.TestCase):
    def test_short_forms_join_to_country_through_official_registration_relationship(self):
        shortforms=[
            {'Short_Form_First_Name':'Jane','Short_Form_Last_Name':'Doe','Registration_Number':'7000',
             'Short_Form_Date':'01/15/2026','Short_Form_Termination_Date':'','Registrant_Name':'Example Strategies LLC',
             'City':'Washington','State':'DC'},
        ]
        principals=[
            {'Registration_Number':'7000','Foreign_Principal':'Example Ministry','Country_Location':'FRANCE',
             'Registrant_Name':'Example Strategies LLC'},
        ]
        docs=[
            {'Registration_Number':'7000','Document_Type':'Short-Form','Short_Form_Name':'Doe, Jane',
             'URL':'https://efile.fara.gov/docs/7000-Short-Form-20260115-1.pdf','Date_Stamped':'01/15/2026'},
        ]
        catalog=[
            {'iso2':'FR','name':'France','atlasNames':['France']},
            {'iso2':'US','name':'United States of America','atlasNames':['United States']},
        ]
        summary,countries=build_agent_outputs(shortforms,principals,docs,catalog,'2026-11-22T00:00:00Z')
        self.assertEqual(summary['totalAgentRecords'],1)
        self.assertEqual(summary['countries']['FR']['agents'],1)
        self.assertEqual(countries['FR']['agents'][0]['name'],'Jane Doe')
        self.assertEqual(countries['FR']['agents'][0]['status'],'active')
        self.assertEqual(countries['FR']['agents'][0]['documentUrl'],'https://efile.fara.gov/docs/7000-Short-Form-20260115-1.pdf')

    def test_terminated_short_form_is_preserved(self):
        shortforms=[{'Short_Form_First_Name':'John','Short_Form_Last_Name':'Smith','Registration_Number':'7001',
                     'Short_Form_Date':'02/01/2024','Short_Form_Termination_Date':'03/01/2025',
                     'Registrant_Name':'Example LLC','City':'New York','State':'NY'}]
        principals=[{'Registration_Number':'7001','Foreign_Principal':'Example','Country_Location':'JAPAN',
                     'Registrant_Name':'Example LLC'}]
        summary,countries=build_agent_outputs(shortforms,principals,[],[
            {'iso2':'JP','name':'Japan','atlasNames':['Japan']}
        ],'2026-11-22T00:00:00Z')
        self.assertEqual(countries['JP']['agents'][0]['status'],'terminated')
        self.assertEqual(countries['JP']['activeAgents'],0)

    def test_one_registration_can_appear_under_multiple_official_country_relationships_without_duplicate_person_rows(self):
        shortforms=[{'Short_Form_First_Name':'A','Short_Form_Last_Name':'B','Registration_Number':'7002',
                     'Short_Form_Date':'01/01/2026','Short_Form_Termination_Date':'','Registrant_Name':'Firm'}]
        principals=[
            {'Registration_Number':'7002','Foreign_Principal':'One','Country_Location':'ARMENIA','Registrant_Name':'Firm'},
            {'Registration_Number':'7002','Foreign_Principal':'Two','Country_Location':'GEORGIA','Registrant_Name':'Firm'},
            {'Registration_Number':'7002','Foreign_Principal':'Two Again','Country_Location':'GEORGIA','Registrant_Name':'Firm'},
        ]
        summary,countries=build_agent_outputs(shortforms,principals,[],[
            {'iso2':'AM','name':'Armenia','atlasNames':['Armenia']},
            {'iso2':'GE','name':'Georgia','atlasNames':['Georgia']},
        ],'2026-11-22T00:00:00Z')
        self.assertEqual(countries['AM']['agentRecords'],1)
        self.assertEqual(countries['GE']['agentRecords'],1)
        self.assertEqual(summary['countries']['GE']['agents'],1)

if __name__=='__main__':
    unittest.main()
