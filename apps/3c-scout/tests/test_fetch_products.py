import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "fetch_products.py"
SPEC = importlib.util.spec_from_file_location("fetch_products", MODULE_PATH)
fetch_products = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(fetch_products)


class FeedParserTests(unittest.TestCase):
    def test_rss_deal_extracts_price_discount_image_and_merchant(self):
        payload = b"""<?xml version="1.0"?>
        <rss version="2.0"><channel><item>
          <title>USB-C desktop dock now $69.99, was $99.99 (30% off)</title>
          <link>https://example.com/deal/1</link>
          <pubDate>Tue, 25 Aug 2026 08:00:00 GMT</pubDate>
          <description><![CDATA[<p>A compact 10G hub for a clean desk setup.</p>
          <img src="https://images.example.com/dock.jpg" />
          <a href="https://www.amazon.com/dp/TEST">Buy it</a>]]></description>
        </item></channel></rss>"""
        entries = fetch_products.extract_entries(payload)
        source = {"name": "Fixture Deals", "stream": "deals", "language": "en", "trust": 8}
        item = fetch_products.build_item(entries[0], source)
        self.assertIsNotNone(item)
        self.assertEqual(item["category"], "桌面")
        self.assertEqual(item["price"], "$69.99")
        self.assertEqual(item["original_price"], "$99.99")
        self.assertEqual(item["discount_percent"], 30)
        self.assertEqual(item["product_url"], "https://www.amazon.com/dp/TEST")
        self.assertEqual(item["link_type"], "purchase")
        self.assertEqual(item["image_url"], "https://images.example.com/dock.jpg")

    def test_atom_new_product_is_classified(self):
        payload = b"""<?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom"><entry>
          <title>New handheld gaming controller announced</title>
          <link rel="alternate" href="https://example.com/new-controller" />
          <updated>2026-08-25T12:00:00Z</updated>
          <summary>A compact controller for Steam Deck and PC gaming.</summary>
        </entry></feed>"""
        entries = fetch_products.extract_entries(payload)
        source = {"name": "Fixture New", "stream": "new", "language": "en", "trust": 7}
        item = fetch_products.build_item(entries[0], source)
        self.assertIsNotNone(item)
        self.assertEqual(item["stream"], "new")
        self.assertEqual(item["category"], "游戏")
        self.assertGreater(item["relevance_score"], 10)

    def test_discovery_source_stays_in_discovery_stream(self):
        payload = b"""<?xml version="1.0"?>
        <rss version="2.0"><channel><item>
          <title>Modular USB-C desk hub with e-ink controls</title>
          <link>https://example.com/discovery/hub</link>
          <pubDate>Tue, 25 Aug 2026 08:00:00 GMT</pubDate>
          <description>A crowdfunding concept for a compact desktop dock and charging station.</description>
        </item></channel></rss>"""
        entries = fetch_products.extract_entries(payload)
        source = {"name": "Fixture Discovery", "stream": "discover", "language": "en", "trust": 6}
        item = fetch_products.build_item(entries[0], source)
        self.assertIsNotNone(item)
        self.assertEqual(item["stream"], "discover")
        self.assertEqual(item["category"], "桌面")
        self.assertIn("潜力", item["reason"])

    def test_url_in_source_field_falls_back_to_configured_source(self):
        payload = b"""<?xml version="1.0"?>
        <rss version="2.0"><channel><item>
          <title>New gaming handheld announced with OLED display</title>
          <link>https://example.com/new-handheld</link>
          <source>https://images.example.com/cover.jpg</source>
          <description>A new portable gaming controller and handheld computer.</description>
        </item></channel></rss>"""
        entry = fetch_products.extract_entries(payload)[0]
        source = {"name": "Hardware Feed", "stream": "new", "language": "en", "trust": 7}
        item = fetch_products.build_item(entry, source)
        self.assertIsNotNone(item)
        self.assertEqual(item["source"], "Hardware Feed")

    def test_youtube_roundup_splits_named_purchase_links(self):
        payload = b"""<?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
          <entry>
            <title>Top Amazon tech and home deals</title>
            <link rel="alternate" href="https://www.youtube.com/watch?v=TEST" />
            <updated>2026-08-25T12:00:00Z</updated>
            <media:group>
              <media:thumbnail url="https://images.example.com/video.jpg" />
              <media:description>MY MUST BUYS:
$29 USB-C Desktop Hub: https://bit.ly/usb-hub
AirPods Pro 3: https://bit.ly/airpods
Air Fryer: https://bit.ly/air-fryer
Free Audible Trial: https://bit.ly/audible
Running Shoes: https://bit.ly/shoes</media:description>
            </media:group>
          </entry>
        </feed>"""
        entry = fetch_products.extract_entries(payload)[0]
        source = {"name": "Video Deals", "stream": "deals", "language": "en", "trust": 7, "expand_product_links": True}
        items = fetch_products.build_items(entry, source)
        self.assertEqual(len(items), 3)
        self.assertEqual({item["title"] for item in items}, {"$29 USB-C Desktop Hub", "AirPods Pro 3", "Air Fryer"})
        self.assertTrue(all(item["link_type"] == "purchase" for item in items))
        self.assertTrue(all(item["source_url"].startswith("https://www.youtube.com/") for item in items))
        hub = next(item for item in items if "Hub" in item["title"])
        self.assertEqual(hub["product_url"], "https://bit.ly/usb-hub")
        self.assertEqual(hub["price"], "$29")

    def test_article_purchase_link_prefers_matching_store_anchor(self):
        payload = b"""<html><body>
          <a href="/privacy">Privacy</a>
          <a href="https://www.amazon.com/dp/WRONG">Shop unrelated cable</a>
          <a href="https://howl.link/airpods-pro">Buy AirPods Pro 3 at the lowest price</a>
        </body></html>"""
        link = fetch_products.purchase_link_from_html(
            payload,
            "https://example.com/review/airpods",
            "AirPods Pro 3 review and deal",
        )
        self.assertEqual(link, "https://howl.link/airpods-pro")

    def test_non_store_amazon_subdomain_is_not_a_purchase_link(self):
        payload = b'<html><a href="https://aws.amazon.com/what-is-cloud-computing">Learn about cloud</a></html>'
        link = fetch_products.purchase_link_from_html(payload, "https://example.com/article", "AI phone review")
        self.assertEqual(link, "https://example.com/article")


if __name__ == "__main__":
    unittest.main()
