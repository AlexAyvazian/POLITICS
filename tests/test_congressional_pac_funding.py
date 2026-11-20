import unittest

from scripts.update_congressional_pac_funding import (
    aggregate_candidate_rows,
    classify_sector,
    leadership_for_candidate,
    normalize_sponsor,
)


class SectorClassificationTests(unittest.TestCase):
    def test_reference_pac_names_land_in_user_facing_sectors(self):
        expected = {
            "UNITEDHEALTH GROUP INCORPORATED PAC": "Health Insurance",
            "AFLAC POLITICAL ACTION COMMITTEE": "Insurance & Employee Benefits",
            "JPMORGAN CHASE & CO. PAC": "Finance, Banking & Investment",
            "AMERICAN MEDICAL ASSOCIATION PAC": "Healthcare & Pharmaceuticals",
            "NATIONAL ASSOCIATION OF REALTORS PAC": "Housing, Real Estate & Construction",
            "VERIZON COMMUNICATIONS, INC. POLITICAL ACTION COMMITTEE": "Technology & Telecommunications",
            "WALMART INC. PAC FOR RESPONSIBLE GOVERNMENT": "Retail, Consumer & Media",
            "LOCKHEED MARTIN CORPORATION EMPLOYEES' POLITICAL ACTION COMMITTEE": "Defense & Federal Contracting",
            "TYSON FOODS PAC": "Industry, Energy & Agriculture",
            "DELTA AIR LINES PAC": "Transportation & Vehicles",
            "MCKINSEY & COMPANY PAC": "Legal, Lobbying & Professional",
        }
        for name, sector in expected.items():
            with self.subTest(name=name):
                self.assertEqual(classify_sector(name), sector)
        self.assertEqual(classify_sector("EXAMPLE CIVIC ACTION PAC"), "Other / Unclassified")


class ContributionAggregationTests(unittest.TestCase):
    def test_amendments_replace_old_rows_and_independent_expenditures_do_not_become_contributions(self):
        rows = [
            ["C00000001", "N", "Q2", "P2026", "img", "15K", "PAC", "Example Bank PAC", "", "", "", "", "", "01012026", "5000", "C00999999", "H2CA00001", "TX-1", "100", "", "", "1"],
            ["C00000001", "A", "Q2", "P2026", "img", "15K", "PAC", "Example Bank PAC", "", "", "", "", "", "01012026", "7500", "C00999999", "H2CA00001", "TX-1", "200", "", "", "2"],
            ["C00000002", "N", "Q2", "G2026", "img", "15K", "PAC", "Workers Leadership PAC", "", "", "", "", "", "02012026", "5000", "C00999999", "H2CA00001", "TX-2", "100", "", "", "3"],
            ["C00000003", "N", "Q2", "G2026", "img", "24A", "PAC", "Outside Spending PAC", "", "", "", "", "", "03012026", "90000", "C00999999", "H2CA00001", "TX-3", "100", "", "", "4"],
            ["C00000004", "N", "Q2", "G2026", "img", "15K", "PAC", "Memo PAC", "", "", "", "", "", "04012026", "10000", "C00999999", "H2CA00001", "TX-4", "100", "X", "memo", "5"],
        ]
        leadership = {"C00000002": {"committeeId": "C00000002", "name": "Workers Leadership PAC", "sponsorName": "DOE, JANE"}}
        out = aggregate_candidate_rows(rows, leadership)
        self.assertEqual(out["directTotal"], 12500.0)
        self.assertEqual([x["committeeId"] for x in out["contributors"]], ["C00000001", "C00000002"])
        self.assertEqual(out["contributors"][0]["total"], 7500.0)
        self.assertTrue(out["contributors"][1]["leadershipPac"])
        self.assertEqual(out["excludedIndependentExpenditureRows"], 1)
        self.assertEqual(out["excludedMemoRows"], 1)


class LeadershipPacTests(unittest.TestCase):
    def test_member_leadership_pac_matches_fec_sponsor_names_without_fuzzy_person_guessing(self):
        rows = [
            {"committeeId": "C00617803", "name": "JOBS, EDUCATION, & FAMILIES FIRST JEFF PAC", "sponsorName": "JEFFRIES, HAKEEM", "totalReceipts": 2090962.7, "totalDisbursements": 2216238.8, "cashOnHand": 770124.41, "coverageEnd": "14-OCT-26"},
            {"committeeId": "C00706630", "name": "POWER OF US PAC", "sponsorName": "PRESSLEY, AYANNA", "totalReceipts": 116000.0, "totalDisbursements": 83045.5, "cashOnHand": 154298.92, "coverageEnd": "14-OCT-26"},
        ]
        self.assertEqual(normalize_sponsor("JEFFRIES, HAKEEM"), normalize_sponsor("Jeffries, Hakeem"))
        match = leadership_for_candidate("JEFFRIES, HAKEEM", rows)
        self.assertEqual(len(match), 1)
        self.assertEqual(match[0]["committeeId"], "C00617803")
        self.assertEqual(leadership_for_candidate("JEFFRIES, H.", rows), [])


if __name__ == "__main__":
    unittest.main()
