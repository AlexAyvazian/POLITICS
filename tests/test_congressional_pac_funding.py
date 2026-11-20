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
            "ALZHEIMERS IMPACT MOVEMENT POLITICAL ACTION COMMITTEE": "Healthcare & Pharmaceuticals",
            "HUMAN RIGHTS CAMPAIGN PAC": "Advocacy & Civic Organizations",
        }
        for name, sector in expected.items():
            with self.subTest(name=name):
                self.assertEqual(classify_sector(name), sector)
        self.assertEqual(classify_sector("EXAMPLE CIVIC ACTION PAC"), "Other / Unclassified")


class ContributionAggregationTests(unittest.TestCase):
    def test_amendments_replace_old_rows_and_independent_expenditures_do_not_become_contributions(self):
        rows = [
            ["C00000001", "N", "Q2", "P2026", "img", "24K", "CAN", "Recipient Candidate", "", "", "", "", "", "01012026", "5000", "C00999999", "H2CA00001", "TX-1", "100", "", "", "1"],
            ["C00000001", "A", "Q2", "P2026", "img", "24K", "CAN", "Recipient Candidate", "", "", "", "", "", "01012026", "7500", "C00999999", "H2CA00001", "TX-1", "200", "", "", "2"],
            ["C00000002", "N", "Q2", "G2026", "img", "24Z", "CCM", "Recipient Campaign", "", "", "", "", "", "02012026", "5000", "C00999999", "H2CA00001", "TX-2", "100", "", "", "3"],
            ["C00000003", "N", "Q2", "G2026", "img", "24A", "CAN", "Recipient Candidate", "", "", "", "", "", "03012026", "90000", "C00999999", "H2CA00001", "TX-3", "100", "", "", "4"],
            ["C00000004", "N", "Q2", "G2026", "img", "24K", "CAN", "Recipient Candidate", "", "", "", "", "", "04012026", "10000", "C00999999", "H2CA00001", "TX-4", "100", "X", "memo", "5"],
            ["C00000005", "N", "Q2", "G2026", "img", "24K", "CAN", "Recipient Candidate", "", "", "", "", "", "05012026", "2500", "C00999999", "H2CA00001", "TX-5", "100", "", "", "6"],
        ]
        leadership = {"C00000002": {"committeeId": "C00000002", "name": "Workers Leadership PAC", "sponsorName": "DOE, JANE"}}
        committees = {
            "C00000001": {"name": "Example Bank PAC", "connectedOrganization": "Example Bank"},
            "C00000002": {"name": "Workers Leadership PAC", "connectedOrganization": None},
            "C00000004": {"name": "Memo PAC", "connectedOrganization": None},
            "C00000005": {"name": "FEC Designated Leadership PAC", "connectedOrganization": None, "designation": "D"},
        }
        out = aggregate_candidate_rows(rows, leadership, committees)
        self.assertEqual(out["directTotal"], 15000.0)
        self.assertEqual([x["committeeId"] for x in out["contributors"]], ["C00000001", "C00000002", "C00000005"])
        self.assertEqual(out["contributors"][0]["name"], "Example Bank PAC")
        self.assertEqual(out["contributors"][0]["total"], 7500.0)
        self.assertTrue(out["contributors"][1]["leadershipPac"])
        self.assertEqual(out["contributors"][1]["name"], "Workers Leadership PAC")
        designated = next(x for x in out["contributors"] if x["committeeId"] == "C00000005")
        self.assertTrue(designated["leadershipPac"])
        self.assertEqual(designated["sector"], "Leadership PACs")
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
