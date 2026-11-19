import io
import json
import unittest
import zipfile

from scripts.update_fara_world import (
    parse_zip_csv, country_index, build_country_snapshot, build_summary,
    normalize_country, safe_fara_url, filing_date_order,
)


def zipped(name, csv_text):
    sink=io.BytesIO()
    with zipfile.ZipFile(sink,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(name,csv_text)
    return sink.getvalue()


CATALOG = [
    {'iso3':'SGP','iso2':'SG','name':'Singapore','atlasNames':['Singapore']},
    {'iso3':'ISR','iso2':'IL','name':'Israel','atlasNames':['Israel']},
    {'iso3':'KOR','iso2':'KR','name':'South Korea','atlasNames':['Republic of Korea']},
]


class FaraWorldTests(unittest.TestCase):
    def test_doj_bulk_filenames_and_legacy_encoding(self):
        raw=zipped('FARA_All_ForeignPrincipals.csv',
            'Registration_Number,Foreign_Principal,Country_Location,Registrant_Name,Termination_Date\n'
            '7794,Enterprise Singapore,SINGAPORE,Enterprise Singapore (Americas),\n')
        rows=parse_zip_csv(raw,'FARA_All_ForeignPrincipals')
        self.assertEqual(rows[0]['Country_Location'],'SINGAPORE')

    def test_country_resolution_uses_actual_iso_catalog_not_nationality_inference(self):
        index=country_index(CATALOG)
        self.assertEqual(normalize_country('SINGAPORE',index),'SG')
        self.assertEqual(normalize_country('REPUBLIC OF KOREA',index),'KR')
        self.assertEqual(normalize_country('Unrecognized disputed location',index),None)

    def test_country_report_preserves_real_registrants_and_source_doc_without_inventing_spending(self):
        principals=[
            {'Registration_Number':'7794','Foreign_Principal':'Enterprise Singapore',
             'Country_Location':'SINGAPORE','Registrant_Name':'Enterprise Singapore (Americas)',
             'Foreign_Principal_Registration_Date':'11/06/2026','Termination_Date':''}
        ]
        docs=[{'Registration_Number':'7794','Foreign_Principal_Name':'Enterprise Singapore',
            'Document_Type':'Exhibit AB','Document_URL':'https://efile.fara.gov/docs/7794-Exhibit-AB-20261106-2.pdf',
            'Date_Stamped':'11/06/2026'}]
        country=build_country_snapshot('SG',principals,docs,country_index(CATALOG),'2026-11-18T18:00:00Z')
        self.assertEqual(country['registeredPrincipals'],1)
        self.assertEqual(country['principals'][0]['registrantName'],'Enterprise Singapore (Americas)')
        self.assertEqual(country['principals'][0]['documents'][0]['type'],'Exhibit AB')
        self.assertIsNone(country['verifiedReceiptsUsd'])
        self.assertIsNone(country['verifiedDisbursementsUsd'])
        self.assertEqual(country['coverage']['financialStatus'],'not_extracted')
        self.assertEqual(country['principals'][0]['status'],'active')
        self.assertNotIn('foreignGovernment',country['principals'][0])

    def test_same_country_does_not_authorize_another_principals_documents(self):
        principals=[
            {'Registration_Number':'7794','Foreign_Principal':'Principal A',
             'Country_Location':'SINGAPORE','Registrant_Name':'Agency LLC'},
            {'Registration_Number':'7794','Foreign_Principal':'Principal B',
             'Country_Location':'SINGAPORE','Registrant_Name':'Agency LLC'},
        ]
        docs=[
            {'Registration_Number':'7794','Foreign_Principal_Name':'Principal B',
             'Foreign_Principal_Country':'SINGAPORE',
             'Document_Type':'Exhibit AB','Document_URL':'https://efile.fara.gov/docs/7794-B-20261106.pdf'},
            {'Registration_Number':'7794','Foreign_Principal_Name':'',
             'Document_Type':'Supplemental Statement','Document_URL':'https://efile.fara.gov/docs/7794-Supplement-20261106.pdf'},
        ]
        report=build_country_snapshot('SG',principals,docs,country_index(CATALOG),'2026-11-18T18:00:00Z')
        a=next(x for x in report['principals'] if x['principalName']=='Principal A')
        b=next(x for x in report['principals'] if x['principalName']=='Principal B')
        self.assertEqual(len(a['documents']),1)
        self.assertEqual(a['documents'][0]['type'],'Supplemental Statement')
        self.assertEqual(len(b['documents']),2)

    def test_doj_dates_are_ordered_by_year_not_alphabetic_month(self):
        self.assertGreater(filing_date_order('11/16/2026'),filing_date_order('12/31/2021'))
        self.assertEqual(filing_date_order('11/16/2026'),'2026-11-16')
        self.assertEqual(filing_date_order('not a date'),'')

    def test_malformed_documents_and_urls_are_excluded(self):
        self.assertIsNone(safe_fara_url('javascript:alert(1)'))
        self.assertIsNone(safe_fara_url('https://notdoj.example/123.pdf'))
        self.assertEqual(safe_fara_url('https://efile.fara.gov/docs/789-test.pdf'),
            'https://efile.fara.gov/docs/789-test.pdf')

    def test_empty_country_is_unmatched_instead_of_blocking_valid_records(self):
        rows=[
            {'Registration_Number':'1','Foreign_Principal':'Organization with no location',
             'Country_Location':'','Registrant_Name':'Agent A'},
            {'Registration_Number':'2','Foreign_Principal':'Enterprise Singapore',
             'Country_Location':'SINGAPORE','Registrant_Name':'Agent B'}
        ]
        index=country_index(CATALOG)
        summary=build_summary(rows,index,'2026-11-18T18:00:00Z')
        self.assertEqual(summary['unmatchedPrincipals'],1)
        self.assertEqual(summary['countries']['SG']['principals'],1)

    def test_summary_is_registries_not_spending_and_marks_unmatched(self):
        rows=[
            {'Registration_Number':'7794','Foreign_Principal':'Enterprise Singapore',
             'Country_Location':'SINGAPORE','Registrant_Name':'Enterprise Singapore (Americas)','Termination_Date':''},
            {'Registration_Number':'80','Foreign_Principal':'Someone',
             'Country_Location':'UNRESOLVED LOCATION','Registrant_Name':'Another LLC','Termination_Date':''},
        ]
        summary=build_summary(rows,country_index(CATALOG),'2026-11-18T18:00:00Z')
        self.assertEqual(summary['countries']['SG']['principals'],1)
        self.assertEqual(summary['unmatchedPrincipals'],1)
        self.assertIsNone(summary['countries']['SG']['verifiedDisbursementsUsd'])
        self.assertEqual(summary['source'],'U.S. Department of Justice FARA bulk registry')


if __name__=='__main__':
    unittest.main()
