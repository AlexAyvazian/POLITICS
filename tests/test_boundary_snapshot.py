"""Regression tests for the public Congressional Atlas boundary snapshot generator."""
import tempfile
import unittest
from pathlib import Path
from scripts import update_congressional_boundaries as source


class GeographySnapshotTests(unittest.TestCase):
    def test_census_requests_are_for_approved_layers_and_state(self):
        self.assertIn("/5/query?", source.endpoint("house", "53"))
        self.assertIn("returnCountOnly=true", source.endpoint("stateSenate", "53", count_only=True))
        self.assertNotIn("returnCountOnly", source.endpoint("stateHouse", "53"))
        with self.assertRaises(AssertionError):
            source.endpoint("invalid", "53")

    def test_no_unicameral_or_dc_nonexistent_chambers(self):
        self.assertIn(("stateHouse", "31"), source.NO_CHAMBER)
        self.assertIn(("stateHouse", "11"), source.NO_CHAMBER)
        self.assertIn(("stateSenate", "11"), source.NO_CHAMBER)

    def test_detect_incomplete_polygon_response(self):
        feature = {"type": "Feature", "geometry": {
            "type": "Polygon", "coordinates": [[[-124, 46], [-122, 46], [-122, 48], [-124, 46]]]},
            "properties": {"STATE": "53", "GEOID": "5303", "BASENAME": "3"}}
        payload = {"type": "FeatureCollection", "features": [feature]}
        self.assertEqual(source.validate("house", "53", payload, 1)["features"][0]["properties"]["GEOID"], "5303")
        with self.assertRaises(ValueError):
            source.validate("house", "53", payload, 10)
        with self.assertRaises(ValueError):
            source.validate("house", "06", payload, 1)

    def test_national_approximation_preserves_geometry_type_and_closed_rings(self):
        polygon = {"type": "MultiPolygon", "coordinates": [
            [[[-124, 46], [-122, 46], [-122, 48], [-124, 46]]],
            [[[-123, 47], [-122.9, 47], [-122.9, 47.1], [-123, 47]]],
        ]}
        result = source.overview_geometry(polygon)
        self.assertEqual(result["type"], "MultiPolygon")
        for ring_set in result["coordinates"]:
            self.assertEqual(ring_set[0][0], ring_set[0][-1])
            self.assertGreaterEqual(len(ring_set[0]), 4)
        self.assertEqual(polygon["coordinates"][0][0][0], [-124, 46])

    def test_static_file_write_does_not_change_content_if_identical(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "geo.json"
            doc = {"type": "FeatureCollection", "features": []}
            source.store(path, doc)
            a = path.read_text()
            source.store(path, doc)
            self.assertEqual(a, path.read_text())


if __name__ == "__main__":
    unittest.main()
