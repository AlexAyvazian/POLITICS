"""Source-identity regressions for the free Issue Stances portrait importer."""
import unittest
from unittest.mock import patch
from scripts import update_issue_stances_portraits as photos


class PortraitIdentityTests(unittest.TestCase):
    def test_explicit_geography_not_guessed(self):
        self.assertEqual(photos.state_from({"jurisdictionId": "us.ca", "name": "Alex Example"}), "CA")
        self.assertEqual(photos.state_from({"electionId": "ny.2026.general"}), "NY")
        self.assertEqual(photos.state_from({"name": "Alex Example"}), "")

    def test_party_normalization(self):
        self.assertEqual(photos.party_kind("Democratic"), "dem")
        self.assertEqual(photos.party_kind("DEM/PROG"), "dem")
        self.assertEqual(photos.party_kind("REP"), "rep")
        self.assertEqual(photos.party_kind("Republican"), "rep")
        self.assertEqual(photos.party_kind("Independent"), "other")

    def test_exact_name_and_state_required_for_wikipedia_photo(self):
        p = {"name": "Jane Candidate", "state": "CA", "nameKey": "jane-candidate"}
        base = {
            "title": "Jane Candidate (politician)",
            "thumbnail": {"source": "https://upload.wikimedia.org/wikipedia/commons/thumb/J/Jane.jpg/480px-Jane.jpg"},
            "terms": {"description": ["American politician"]},
            "extract": "Jane Candidate served as a legislator in California and later became a governor."
        }
        self.assertTrue(photos.match_wikipedia_page(p, base))
        self.assertFalse(photos.match_wikipedia_page({**p, "state": "NY"}, base))
        self.assertFalse(photos.match_wikipedia_page({**p, "nameKey": "john-candidate"}, base))
        self.assertFalse(photos.match_wikipedia_page(p, {**base, "extract": "Jane Candidate was a software engineer."}))
        self.assertFalse(photos.match_wikipedia_page(p, {**base, "pageprops": {"disambiguation": ""}}))
        self.assertFalse(photos.match_wikipedia_page(p, {**base, "thumbnail": {"source": "https://example.com/placeholder.jpg"}}))

    def test_official_state_images_require_exact_candidate_and_party(self):
        csv_data = (
            "id,name,current_party,current_district,current_chamber,image\n"
            "ocd-person/a,Jane Candidate,Democratic,5,lower,https://legislature.ca.gov/jane.jpg\n"
            "ocd-person/b,Jane Candidate,Republican,1,upper,https://legislature.ca.gov/another.jpg\n"
            "ocd-person/c,John Sample,Independent,2,upper,javascript:alert(1)\n"
        )
        with patch.object(photos, "fetch", return_value=csv_data):
            _, result = photos.openstates_photos("CA")
        self.assertEqual(len(result["jane-candidate"]), 2)
        self.assertNotIn("john-sample", result)
        candidates = [
            {"slug": "jane", "state": "CA", "nameKey": "jane-candidate", "party": "dem"},
            {"slug": "john", "state": "CA", "nameKey": "john-sample", "party": "other"}
        ]
        with patch.object(photos, "openstates_photos", return_value=("CA", result)):
            output = photos.official_photos(candidates, ["CA"])
        self.assertIn("jane", output)
        self.assertNotIn("john", output)
        self.assertEqual(output["jane"]["url"], "https://legislature.ca.gov/jane.jpg")

    def test_congressional_bioguide_photos_require_exact_name_state_and_party(self):
        import json
        roster = {
            "states": {
                "CA": {"house": [
                    {"name": "Jane Candidate", "party": "Democrat", "bioguide": "C001234"}
                ], "senators": []},
                "NY": {"house": [
                    {"name": "Jane Candidate", "party": "Republican", "bioguide": "C005678"}
                ], "senators": []}
            }
        }
        people = [
            {"slug": "jane-dem-ca", "nameKey": "jane-candidate", "state": "CA", "party": "dem"},
            {"slug": "jane-dem-ny", "nameKey": "jane-candidate", "state": "NY", "party": "dem"},
            {"slug": "jane-rep-ny", "nameKey": "jane-candidate", "state": "NY", "party": "rep"}
        ]
        with patch.object(photos, "fetch", return_value=json.dumps(roster)):
            matched = photos.federal_member_photos(people)
        self.assertEqual(matched["jane-dem-ca"]["url"].split("/")[-1], "C001234.jpg")
        self.assertNotIn("jane-dem-ny", matched)
        self.assertEqual(matched["jane-rep-ny"]["url"].split("/")[-1], "C005678.jpg")

    def test_archived_images_require_unique_exact_state_name_and_party(self):
        import io
        import zipfile

        rows = [
            ("people-main/data/ca/retired/jane.yml",
             "id: ocd-person/jane\nname: Jane Candidate\nimage: https://ca.gov/jane.jpg\nparty:\n- name: Democratic\n"),
            ("people-main/data/ca/executive/john.yml",
             "id: ocd-person/john\nname: John Candidate\nimage: https://ca.gov/john.jpg\nparty:\n- name: Republican\n"),
            ("people-main/data/ny/retired/duplicate.yml",
             "id: ocd-person/other\nname: Jane Candidate\nimage: https://ny.gov/other.jpg\nparty:\n- name: Democratic\n"),
            ("people-main/data/ca/retired/mixed.yml",
             "id: ocd-person/mixed\nname: May Candidate\nimage: https://ca.gov/may.jpg\nparty:\n- name: Republican\n")
        ]
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            for filename, body in rows:
                archive.writestr(filename, body)
        people = [
            {"slug": "jane-ca", "nameKey": "jane-candidate", "state": "CA", "party": "dem"},
            {"slug": "jane-ny", "nameKey": "jane-candidate", "state": "NY", "party": "dem"},
            {"slug": "john-ca", "nameKey": "john-candidate", "state": "CA", "party": "rep"},
            {"slug": "may-ca", "nameKey": "may-candidate", "state": "CA", "party": "dem"}
        ]
        with patch.object(photos, "urlopen", return_value=io.BytesIO(output.getvalue())):
            found = photos.archived_official_photos(people)
        self.assertEqual(found["jane-ca"]["url"], "https://ca.gov/jane.jpg")
        self.assertEqual(found["jane-ny"]["url"], "https://ny.gov/other.jpg")
        self.assertIn("john-ca", found)
        self.assertNotIn("may-ca", found)



if __name__ == "__main__":
    unittest.main()
