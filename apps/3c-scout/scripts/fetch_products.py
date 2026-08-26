#!/usr/bin/env python3
"""Build the static 3C Scout feed from public RSS/Atom sources.

The script intentionally uses only Python's standard library so the scheduled
GitHub Action stays fast and does not depend on a third-party package mirror.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "products.json"
NOW = datetime.now(timezone.utc)
USER_AGENT = "3C-Scout/1.0 (+https://github.com/XiminHu66/3C-scout)"

SOURCES = [
    # Deal sources
    {"name": "9to5Toys", "url": "https://9to5toys.com/feed/", "stream": "deals", "language": "en", "trust": 9},
    {"name": "DealNews", "url": "https://www.dealnews.com/?rss=1", "stream": "deals", "language": "en", "trust": 7},
    {"name": "DealNews Editors' Choice", "url": "https://www.dealnews.com/?rss=1&category=editors-choice", "stream": "deals", "language": "en", "trust": 8},
    {"name": "The Verge Good Deals", "url": "https://www.theverge.com/rss/good-deals/index.xml", "stream": "deals", "language": "en", "trust": 8},
    {"name": "The Deal Guy", "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UC5Qbo0AR3CwpmEq751BIy0g", "stream": "deals", "language": "en", "trust": 7, "expand_product_links": True},
    {"name": "Dealmoon 数码好价", "url": "https://news.google.com/rss/search?q=site%3Adealmoon.com%2Fcn+%28%E6%95%B0%E7%A0%81+OR+%E7%94%B5%E5%AD%90+OR+%E8%80%B3%E6%9C%BA+OR+%E7%94%B5%E8%84%91+OR+%E6%B8%B8%E6%88%8F%29+%28%E6%8A%98%E6%89%A3+OR+%E4%BC%98%E6%83%A0+OR+%E5%A5%BD%E4%BB%B7%29&hl=zh-CN&gl=US&ceid=US%3Azh-Hans", "stream": "deals", "language": "zh", "trust": 7},
    {"name": "Dealmoon 家居厨房", "url": "https://news.google.com/rss/search?q=site%3Adealmoon.com%2Fcn+%28%E5%AE%B6%E5%B1%85+OR+%E5%8E%A8%E6%88%BF+OR+%E6%94%B6%E7%BA%B3+OR+%E6%B8%85%E6%B4%81+OR+Costco%29+%28%E6%8A%98%E6%89%A3+OR+%E4%BC%98%E6%83%A0+OR+%E5%A5%BD%E4%BB%B7%29&hl=zh-CN&gl=US&ceid=US%3Azh-Hans", "stream": "deals", "language": "zh", "trust": 7},
    {"name": "中文好价搜索", "url": "https://news.google.com/rss/search?q=%28%E5%8C%97%E7%BE%8E+OR+Amazon+OR+Costco%29+%28%E6%95%B0%E7%A0%81+OR+%E5%8E%A8%E6%88%BF+OR+%E5%AE%B6%E5%B1%85%29+%28%E6%8A%98%E6%89%A3+OR+%E5%A5%BD%E4%BB%B7+OR+deal%29&hl=zh-CN&gl=US&ceid=US%3Azh-Hans", "stream": "deals", "language": "zh", "trust": 5},
    # New-product sources
    {"name": "少数派", "url": "https://sspai.com/feed", "stream": "new", "language": "zh", "trust": 8},
    {"name": "爱范儿", "url": "https://www.ifanr.com/feed", "stream": "new", "language": "zh", "trust": 8},
    {"name": "IT之家", "url": "https://www.ithome.com/rss/", "stream": "new", "language": "zh", "trust": 7},
    {"name": "UNWIRE.HK", "url": "https://unwire.hk/feed/", "stream": "new", "language": "zh", "trust": 7},
    {"name": "Cool3C", "url": "https://www.cool3c.com/rss", "stream": "new", "language": "zh", "trust": 7},
    {"name": "Engadget", "url": "https://www.engadget.com/rss.xml", "stream": "new", "language": "en", "trust": 8},
    {"name": "The Verge", "url": "https://www.theverge.com/rss/index.xml", "stream": "new", "language": "en", "trust": 8},
    {"name": "Tom's Hardware", "url": "https://www.tomshardware.com/feeds/all", "stream": "new", "language": "en", "trust": 7},
    {"name": "MacRumors", "url": "https://feeds.macrumors.com/MacRumors-All", "stream": "new", "language": "en", "trust": 7},
    {"name": "9to5Mac", "url": "https://9to5mac.com/feed/", "stream": "new", "language": "en", "trust": 7},
    {"name": "中文新品搜索", "url": "https://news.google.com/rss/search?q=%28%E6%96%B0%E5%93%81+OR+%E5%8F%91%E5%B8%83+OR+%E4%B8%8A%E5%B8%82%29+%28%E6%95%B0%E7%A0%81+OR+%E6%A1%8C%E9%9D%A2+OR+%E9%9F%B3%E9%A2%91+OR+%E5%8E%A8%E6%88%BF+OR+%E5%B0%8F%E7%89%A9%29&hl=zh-CN&gl=US&ceid=US%3Azh-Hans", "stream": "new", "language": "zh", "trust": 5},
    # Discovery sources: concepts, crowdfunding, independent hardware and unusual design
    {"name": "Product Hunt", "url": "https://www.producthunt.com/feed", "stream": "discover", "language": "en", "trust": 6},
    {"name": "New Atlas Technology", "url": "https://newatlas.com/technology/index.rss", "stream": "discover", "language": "en", "trust": 7},
    {"name": "Yanko Design", "url": "https://www.yankodesign.com/feed/", "stream": "discover", "language": "en", "trust": 6},
    {"name": "The Gadgeteer", "url": "https://the-gadgeteer.com/feed/", "stream": "discover", "language": "en", "trust": 6},
    {"name": "Crowdfunding Radar", "url": "https://news.google.com/rss/search?q=%28Kickstarter+OR+Indiegogo+OR+crowdfunding%29+%28gadget+OR+hardware+OR+desk+OR+kitchen+OR+smart+home%29&hl=en-US&gl=US&ceid=US%3Aen", "stream": "discover", "language": "en", "trust": 5},
    {"name": "中文潜力新品", "url": "https://news.google.com/rss/search?q=%28%E4%BC%97%E7%AD%B9+OR+%E6%A6%82%E5%BF%B5%E4%BA%A7%E5%93%81+OR+%E7%8B%AC%E7%AB%8B%E7%A1%AC%E4%BB%B6%29+%28%E6%95%B0%E7%A0%81+OR+%E6%A1%8C%E9%9D%A2+OR+%E5%AE%B6%E5%B1%85+OR+%E5%8E%A8%E6%88%BF%29&hl=zh-CN&gl=US&ceid=US%3Azh-Hans", "stream": "discover", "language": "zh", "trust": 5},
]

CATEGORIES = {
    "音频": ["headphone", "earbud", "airpods", "speaker", "soundbar", "audio", "dac", "microphone", "inzone", "fiio", "耳机", "音箱", "音响", "麦克风", "解码器"],
    "桌面": ["desk", "desktop", "monitor arm", "hub", "dock", "charger", "charging", "cable", "keyboard", "mouse", "lamp", "fan", "桌面", "显示器支架", "拓展坞", "扩展坞", "充电", "理线", "键盘", "鼠标", "台灯", "风扇", "收纳"],
    "游戏": ["gaming", "gamepad", "controller", "handheld", "steam deck", "switch", "playstation", "xbox", "hitbox", "arcade", "xreal", "游戏", "掌机", "手柄", "主机", "街机", "摇杆"],
    "厨房": ["kitchen", "air fryer", "microwave", "coffee", "espresso", "rice cooker", "cookware", "knife", "blender", "oven", "toaster", "厨房", "空气炸锅", "微波炉", "咖啡", "电饭煲", "锅", "刀具", "烤箱", "厨具"],
    "生活": ["home", "vacuum", "garden", "cleaning", "storage", "organizer", "smart home", "light", "power tool", "power station", "backyard", "e-bike", "electric bike", "hedge trimmer", "tv stand", "costco", "dollar tree", "家居", "生活", "清洁", "吸尘器", "园艺", "后院", "工具", "智能家居", "灯", "置物", "电视柜", "电助力", "电动自行车"],
    "Maker": ["m5stack", "esp32", "raspberry pi", "arduino", "3d printer", "maker", "solder", "development board", "robot", "开发板", "树莓派", "3d打印", "机器人", "创客", "焊接"],
    "3C 数码": ["laptop", "computer", "mini pc", "tablet", "ipad", "phone", "iphone", "android", "apple watch", "airtag", "tracker", "monitor", "ssd", "hard drive", "nas", "router", "wi-fi", "usb", "power bank", "camera", "e-reader", "kindle", "boox", "电脑", "笔记本", "平板", "手机", "显示器", "硬盘", "路由器", "相机", "阅读器", "数码", "存储", "智能手表", "追踪器"],
}

PERSONAL_KEYWORDS = [
    "m5stack", "mini pc", "nas", "ssd", "usb hub", "dock", "charger", "charging station", "desk", "cable management",
    "headphone", "earbud", "dac", "inzone", "fiio", "sony", "airpods", "steam deck", "handheld", "controller", "hitbox",
    "xreal", "e-reader", "boox", "kindle", "organizer", "storage", "fan", "air fryer", "microwave", "garden", "smart home",
    "拓展坞", "充电站", "桌面", "理线", "收纳", "耳机", "掌机", "手柄", "硬盘", "阅读器", "空气炸锅", "微波炉", "后院", "智能家居",
]

NEW_SIGNALS = ["launch", "announc", "introduc", "unveil", "new ", "debut", "hands-on", "review", "first look", "pre-order", "新品", "发布", "上市", "推出", "上手", "体验", "评测", "首发", "曝光", "亮相", "众筹", "开售", "预售", "首款", "实测"]
DEAL_SIGNALS = ["deal", "% off", "on sale", "lowest", "discount", "clearance", "coupon", "折扣", "好价", "降价", "立减", "优惠", "低价", "到手", "$", "¥", "￥"]
MERCHANT_HOSTS = ["amazon.", "bestbuy.", "walmart.", "target.", "costco.", "homedepot.", "lowes.", "ebay.", "woot.", "newegg.", "aliexpress.", "temu.", "jd.com", "taobao.", "tmall.", "suning."]
AFFILIATE_HOSTS = ["amzn.to", "geni.us", "howl.link", "redirectingat.com", "shop-links.co", "rstyle.me", "sjv.io", "anrdoezrs.net", "tkqlhce.com", "dpbolvw.net", "jdoqocy.com", "kqzyfj.com", "linksynergy.com", "avantlink.com"]
NON_PURCHASE_HOSTS = ["aws.amazon.com", "developer.amazon.com", "advertising.amazon.com", "affiliate-program.amazon.com"]
OFF_TOPIC_SIGNALS = ["men's clothing", "women's clothing", "sweater", "polo shirt", "work pants", "shoes", "makeup", "skincare", "jewelry", "musician's friend", "sweetwater labor day"]
NON_PRODUCT_LINK_SIGNALS = ["free trial", "audible", "frequent purchases", "all the deals", "rest of the", "ad here", "gift card", "beauty sale", "travel deals"]
URL_PATTERN = re.compile(r"h?https?://[^\s<>\]\[\)\(\"']+", re.I)


class FragmentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.images: list[str] = []
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "img" and values.get("src"):
            self.images.append(values["src"] or "")
        if tag == "a" and values.get("href"):
            self.links.append(values["href"] or "")

    def handle_data(self, data: str) -> None:
        self.text_parts.append(data)


class PageLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.current_href = ""
        self.current_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self.current_href = dict(attrs).get("href") or ""
            self.current_text = []

    def handle_data(self, data: str) -> None:
        if self.current_href:
            self.current_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.current_href:
            text = re.sub(r"\s+", " ", " ".join(self.current_text)).strip()
            self.links.append((self.current_href, text))
            self.current_href = ""
            self.current_text = []


def clean_fragment(raw: str | None) -> tuple[str, list[str], list[str]]:
    parser = FragmentParser()
    try:
        parser.feed(html.unescape(raw or ""))
    except Exception:
        pass
    text = re.sub(r"\s+", " ", " ".join(parser.text_parts)).strip()
    return text, parser.images, parser.links


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def child_text(element: ET.Element, *names: str) -> str:
    wanted = {name.lower() for name in names}
    for child in list(element):
        if local_name(child.tag) in wanted and child.text:
            return child.text.strip()
    return ""


def descendant_text(element: ET.Element, *names: str) -> str:
    """Read namespaced nested fields such as YouTube media:description."""
    direct = child_text(element, *names)
    if direct:
        return direct
    wanted = {name.lower() for name in names}
    for child in element.iter():
        if child is not element and local_name(child.tag) in wanted and child.text:
            return child.text.strip()
    return ""


def first_link(element: ET.Element) -> str:
    for child in list(element):
        if local_name(child.tag) != "link":
            continue
        href = child.attrib.get("href", "").strip()
        rel = child.attrib.get("rel", "alternate")
        if href and rel in ("alternate", ""):
            return href
        if child.text and child.text.strip().startswith("http"):
            return child.text.strip()
    return child_text(element, "guid")


def parse_date(raw: str) -> datetime:
    if not raw:
        return NOW
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        pass
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return NOW


def fetch(url: str, attempts: int = 2) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
            with urllib.request.urlopen(request, timeout=22) as response:
                return response.read(6_000_000)
        except Exception as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(1.2)
    raise RuntimeError(str(last_error))


def fetch_page(url: str) -> bytes:
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
    })
    with urllib.request.urlopen(request, timeout=14) as response:
        return response.read(2_500_000)


def extract_entries(payload: bytes) -> list[ET.Element]:
    root = ET.fromstring(payload)
    entries = [element for element in root.iter() if local_name(element.tag) in {"item", "entry"}]
    return entries[:45]


def source_name(entry: ET.Element, fallback: str) -> str:
    value = child_text(entry, "source")
    value = re.sub(r"\s+", " ", value).strip()
    if not value or value.startswith(("http://", "https://")):
        return fallback
    return value


def entry_media(entry: ET.Element, fragment_images: list[str]) -> str:
    for element in entry.iter():
        name = local_name(element.tag)
        if name in {"thumbnail", "enclosure", "content"}:
            url = element.attrib.get("url", "")
            medium = element.attrib.get("medium", "")
            mime = element.attrib.get("type", "")
            if url and (name == "thumbnail" or medium == "image" or mime.startswith("image/")):
                return url
    return next((url for url in fragment_images if url.startswith("http")), "")


def category_for(text: str) -> tuple[str, int]:
    lowered = text.lower()
    scored = [(category, sum(2 if len(keyword) > 7 else 1 for keyword in words if keyword in lowered)) for category, words in CATEGORIES.items()]
    category, score = max(scored, key=lambda pair: pair[1])
    return (category, score) if score else ("其他", 0)


def extract_prices(text: str) -> dict[str, Any]:
    matches: list[tuple[str, float, int]] = []
    pattern = re.compile(r"(?P<symbol>US\$|\$|USD\s*|CN¥|RMB\s*|[¥￥])\s*(?P<num>\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)", re.I)
    for match in pattern.finditer(text):
        value = float(match.group("num").replace(",", ""))
        if re.match(r"\s*off\b", text[match.end():match.end() + 9], re.I):
            continue
        if 0 < value < 1_000_000:
            symbol = "¥" if match.group("symbol").lower() in {"cn¥", "rmb", "¥", "￥"} else "$"
            matches.append((symbol, value, match.start()))
    current_symbol = matches[0][0] if matches else ""
    current = matches[0][1] if matches else None
    original = None
    if current is not None:
        same_currency = [value for symbol, value, _ in matches[1:] if symbol == current_symbol and value > current * 1.03]
        if same_currency:
            original = max(same_currency)

    discount = 0
    percent = re.search(r"(?:save\s*)?(\d{1,2})\s*%\s*(?:off)?|(?:减|省)\s*(\d{1,2})\s*%", text, re.I)
    if percent:
        discount = int(next(group for group in percent.groups() if group))
    zhe = re.search(r"(?<!\d)([1-9](?:\.\d)?)\s*折", text)
    if zhe:
        discount = max(discount, round(100 - float(zhe.group(1)) * 10))
    if not discount and current and original:
        discount = round((1 - current / original) * 100)
    discount = max(0, min(discount, 95))

    def display(symbol: str, value: float | None) -> str:
        if value is None:
            return ""
        rendered = f"{value:,.2f}".rstrip("0").rstrip(".")
        return f"{symbol}{rendered}"

    return {
        "price": display(current_symbol, current),
        "price_value": current,
        "original_price": display(current_symbol, original),
        "discount_percent": discount,
    }


def merchant_link(links: list[str], source_url: str) -> str:
    for link in links:
        absolute = urllib.parse.urljoin(source_url, link)
        host = urllib.parse.urlparse(absolute).netloc.lower()
        if any(merchant in host for merchant in MERCHANT_HOSTS):
            return absolute
    return source_url


def is_purchase_host(url: str) -> bool:
    host = urllib.parse.urlparse(url).netloc.lower()
    if any(host == blocked or host.endswith(f".{blocked}") for blocked in NON_PURCHASE_HOSTS):
        return False
    return any(part in host for part in [*MERCHANT_HOSTS, *AFFILIATE_HOSTS])


def purchase_link_from_html(payload: bytes, source_url: str, title: str) -> str:
    parser = PageLinkParser()
    try:
        parser.feed(payload.decode("utf-8", "ignore"))
    except Exception:
        return source_url

    title_tokens = {token for token in re.findall(r"[a-z0-9]{3,}", title.lower()) if token not in {"the", "and", "for", "with", "new", "deal", "deals"}}
    candidates: list[tuple[int, int, str]] = []
    for index, (href, anchor) in enumerate(parser.links):
        absolute = urllib.parse.urljoin(source_url, html.unescape(href))
        if not is_purchase_host(absolute):
            continue
        anchor_lower = anchor.lower()
        if any(word in anchor_lower for word in ["privacy", "advertise", "newsletter", "terms of use"]):
            continue
        overlap = sum(token in anchor_lower for token in title_tokens)
        action = 2 if any(word in anchor_lower for word in ["buy", "shop", "amazon", "best buy", "walmart", "price", "coupon"]) else 0
        candidates.append((overlap * 3 + action, -index, absolute))
    if not candidates:
        return source_url
    return max(candidates)[2]


def plain_links(raw: str) -> list[str]:
    links: list[str] = []
    for match in URL_PATTERN.finditer(html.unescape(raw or "")):
        url = match.group(0)
        if url.lower().startswith("hhttp"):
            url = url[1:]
        links.append(url.rstrip(".,;:!?}"))
    return links


def product_lines(raw: str) -> list[tuple[str, str]]:
    """Extract `product name: URL` pairs from roundup descriptions."""
    found: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for raw_line in html.unescape(raw or "").splitlines():
        match = URL_PATTERN.search(raw_line)
        if not match:
            continue
        url = match.group(0)
        if url.lower().startswith("hhttp"):
            url = url[1:]
        url = url.rstrip(".,;:!?}")
        label, _, _ = clean_fragment(raw_line[:match.start()])
        label = re.sub(r"^[^\w$¥￥]+", "", label, flags=re.UNICODE)
        label = re.sub(r"^\d+[.)、]\s*", "", label)
        label = re.sub(r"\s+", " ", label).strip(" :-–—|•*\t")
        lowered = label.lower()
        if len(label) < 3 or any(signal in lowered for signal in NON_PRODUCT_LINK_SIGNALS):
            continue
        key = (label.lower(), url)
        if key not in seen:
            seen.add(key)
            found.append((label[:180], url))
    return found[:80]


def reason_for(category: str, personal_hits: list[str], discount: int, stream: str) -> str:
    if stream == "discover":
        match = f"，匹配你的偏好：{personal_hits[0]}" if personal_hits else ""
        return f"来自设计、众筹或独立硬件渠道的潜力{category}产品{match}"
    if personal_hits:
        return f"匹配你的偏好：{personal_hits[0]}" + (f"，并有 {discount}% 折扣" if discount else "")
    if stream == "deals" and discount:
        return f"{category}分类中折扣力度较高（{discount}%）"
    if stream == "new":
        return f"近期发布的{category}相关新品"
    return f"与你关注的{category}用品相关"


def build_item(entry: ET.Element, source: dict[str, Any]) -> dict[str, Any] | None:
    title, _, title_links = clean_fragment(child_text(entry, "title"))
    raw_summary = descendant_text(entry, "description", "summary", "content", "encoded")
    summary, images, links = clean_fragment(raw_summary)
    source_url = first_link(entry)
    if not title or not source_url.startswith("http"):
        return None

    title_lower = title.lower()
    combined = f"{title} {summary}".lower()
    title_category, title_score = category_for(title_lower)
    body_category, body_score = category_for(combined)
    category, category_score = (title_category, title_score) if title_score else (body_category, body_score)
    has_new_signal = any(signal in combined for signal in NEW_SIGNALS)
    has_new_title_signal = any(signal in title_lower for signal in NEW_SIGNALS)
    has_deal_signal = any(signal in combined for signal in DEAL_SIGNALS)
    stream = source["stream"]
    if stream == "new" and has_deal_signal and not has_new_signal:
        stream = "deals"
    elif stream == "deals" and not has_deal_signal and has_new_signal:
        stream = "new"

    # General tech feeds need a product/category signal. Curated deal feeds may
    # pass through with a lower score so useful roundups are not lost.
    if category_score == 0 and not (source["name"] == "The Deal Guy" and stream == "deals"):
        return None
    if title_score == 0 and any(signal in title_lower for signal in OFF_TOPIC_SIGNALS):
        return None
    if title_score == 0 and body_score < 2 and source["name"] != "The Deal Guy":
        return None
    if stream == "new" and not has_new_title_signal and source["name"] not in {"少数派"}:
        return None

    price_text = title if stream in {"new", "discover"} else f"{title} {summary[:260]}"
    prices = extract_prices(price_text)
    personal_hits = [keyword for keyword in PERSONAL_KEYWORDS if keyword in combined][:3]
    published = parse_date(child_text(entry, "pubdate", "published", "updated", "date"))
    age_hours = max(0, (NOW - published).total_seconds() / 3600)
    freshness = max(0, 24 - min(age_hours, 24)) / 6
    relevance = source["trust"] + category_score * 2 + len(personal_hits) * 4 + freshness
    if source["language"] == "zh":
        relevance += 6
    if stream == "deals":
        relevance += min(prices["discount_percent"], 60) / 6

    product_url = merchant_link([*links, *title_links, *plain_links(raw_summary)], source_url)

    canonical = re.sub(r"\W+", " ", title.lower()).strip()
    item_id = hashlib.sha1(f"{canonical}|{source_url}".encode("utf-8")).hexdigest()[:16]
    actual_source = source_name(entry, source["name"])
    tags = list(dict.fromkeys([category, *personal_hits]))[:4]
    summary = summary[:360].rstrip()
    return {
        "id": item_id,
        "stream": stream,
        "title": title[:220],
        "summary": summary,
        "category": category,
        "tags": tags,
        "language": source["language"],
        "source": actual_source,
        "source_url": source_url,
        "product_url": product_url,
        "link_type": "purchase" if product_url != source_url or is_purchase_host(product_url) else "source",
        "image_url": entry_media(entry, images),
        "published_at": published.isoformat(),
        "fetched_at": NOW.isoformat(),
        "relevance_score": round(relevance, 2),
        "reason": reason_for(category, personal_hits, prices["discount_percent"], stream),
        "price_note": "抓取自标题或摘要；如有差异，请以商家结账页为准",
        **prices,
    }


def expanded_product_items(entry: ET.Element, source: dict[str, Any]) -> list[dict[str, Any]]:
    """Split roundup descriptions into one card per named purchase link."""
    raw_summary = descendant_text(entry, "description", "summary", "content", "encoded")
    pairs = product_lines(raw_summary)
    if not pairs:
        return []

    post_title, _, _ = clean_fragment(child_text(entry, "title"))
    source_url = first_link(entry)
    if not post_title or not source_url.startswith("http"):
        return []
    _, fragment_images, _ = clean_fragment(raw_summary)
    image_url = entry_media(entry, fragment_images)
    published = parse_date(child_text(entry, "pubdate", "published", "updated", "date"))
    age_hours = max(0, (NOW - published).total_seconds() / 3600)
    freshness = max(0, 24 - min(age_hours, 24)) / 6

    items: list[dict[str, Any]] = []
    for label, product_url in pairs:
        lowered = label.lower()
        category, category_score = category_for(lowered)
        if not category_score or any(signal in lowered for signal in OFF_TOPIC_SIGNALS):
            continue
        prices = extract_prices(label)
        personal_hits = [keyword for keyword in PERSONAL_KEYWORDS if keyword in lowered][:3]
        relevance = source["trust"] + category_score * 2 + len(personal_hits) * 4 + freshness + 4
        relevance += min(prices["discount_percent"], 60) / 6
        canonical = re.sub(r"\W+", " ", label.lower()).strip()
        item_id = hashlib.sha1(f"{canonical}|{product_url}|{source_url}".encode("utf-8")).hexdigest()[:16]
        items.append({
            "id": item_id,
            "stream": source["stream"],
            "title": label,
            "summary": f"来自《{post_title}》商品清单；购买链接取自视频详情。",
            "category": category,
            "tags": list(dict.fromkeys([category, *personal_hits]))[:4],
            "language": source["language"],
            "source": source["name"],
            "source_url": source_url,
            "product_url": product_url,
            "link_type": "purchase",
            "image_url": image_url,
            "published_at": published.isoformat(),
            "fetched_at": NOW.isoformat(),
            "relevance_score": round(relevance, 2),
            "reason": reason_for(category, personal_hits, prices["discount_percent"], source["stream"]),
            "price_note": "价格来自商品名称；购买前请在商家页面确认实时价格与优惠码",
            **prices,
        })
    items.sort(key=lambda item: item["relevance_score"], reverse=True)
    return items[:50]


def build_items(entry: ET.Element, source: dict[str, Any]) -> list[dict[str, Any]]:
    if source.get("expand_product_links"):
        expanded = expanded_product_items(entry, source)
        if expanded:
            return expanded
    item = build_item(entry, source)
    return [item] if item else []


def enrich_purchase_link(item: dict[str, Any]) -> dict[str, Any]:
    if item.get("link_type") == "purchase" or item.get("product_url") != item.get("source_url"):
        return item
    source_url = item.get("source_url", "")
    if not source_url.startswith("http") or "youtube.com/" in source_url or "youtu.be/" in source_url:
        return item
    try:
        product_url = purchase_link_from_html(fetch_page(source_url), source_url, item.get("title", ""))
    except Exception:
        return item
    if product_url == source_url:
        return item
    enriched = dict(item)
    enriched["product_url"] = product_url
    enriched["link_type"] = "purchase"
    return enriched


def enrich_purchase_links(items: list[dict[str, Any]], max_pages: int = 90) -> list[dict[str, Any]]:
    """Inspect top source articles for merchant links without blocking the feed on failures."""
    candidates = [
        index for index, item in enumerate(items)
        if item.get("link_type") != "purchase" and item.get("product_url") == item.get("source_url")
    ]
    candidates.sort(key=lambda index: (
        items[index].get("stream") == "deals",
        items[index].get("language") == "zh",
        items[index].get("relevance_score", 0),
    ), reverse=True)
    candidates = candidates[:max_pages]
    enriched = list(items)
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(enrich_purchase_link, items[index]): index for index in candidates}
        for future in concurrent.futures.as_completed(futures):
            index = futures[future]
            try:
                enriched[index] = future.result()
            except Exception:
                pass
    return enriched


def load_existing() -> dict[str, Any]:
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except Exception:
        return {"items": [], "sources": []}


def canonical_key(item: dict[str, Any]) -> str:
    title = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", item.get("title", "").lower())
    return title[:100]


def merge_items(fresh: list[dict[str, Any]], existing: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cutoff = NOW - timedelta(days=14)
    merged: dict[str, dict[str, Any]] = {}
    for item in [*fresh, *existing]:
        try:
            published = parse_date(item.get("published_at", ""))
        except Exception:
            continue
        if published < cutoff:
            continue
        key = canonical_key(item) or item.get("id", "")
        if key and key not in merged:
            merged[key] = item
    result = list(merged.values())
    for item in result:
        source_url = item.get("source_url", "")
        product_url = item.get("product_url") or source_url
        item["product_url"] = product_url
        if item.get("link_type") != "purchase":
            item["link_type"] = "purchase" if product_url != source_url or is_purchase_host(product_url) else "source"
    result.sort(key=lambda item: (item.get("relevance_score", 0), item.get("published_at", "")), reverse=True)
    deals = [item for item in result if item.get("stream") == "deals"][:72]
    new = [item for item in result if item.get("stream") == "new"][:72]
    discover = [item for item in result if item.get("stream") == "discover"][:60]
    return new + deals + discover


def process_source(index: int, source: dict[str, Any], fixture_dir: Path | None) -> tuple[int, list[dict[str, Any]], dict[str, Any]]:
    items: list[dict[str, Any]] = []
    error = ""
    try:
        if fixture_dir:
            fixture = fixture_dir / f"{index}.xml"
            if not fixture.exists():
                raise FileNotFoundError(f"fixture not found: {fixture.name}")
            payload = fixture.read_bytes()
        else:
            payload = fetch(source["url"])
        for entry in extract_entries(payload):
            items.extend(build_items(entry, source))
    except Exception as exc:
        error = re.sub(r"\s+", " ", str(exc))[:160]
        print(f"WARN {source['name']}: {error}", file=sys.stderr)
    status = {"name": source["name"], "ok": not error, "item_count": len(items), "error": error}
    return index, items, status


def run(fixture_dir: Path | None = None) -> dict[str, Any]:
    existing = load_existing()
    fresh: list[dict[str, Any]] = []
    ordered_statuses: dict[int, dict[str, Any]] = {}
    worker_count = 1 if fixture_dir else 8
    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = [executor.submit(process_source, index, source, fixture_dir) for index, source in enumerate(SOURCES)]
        for future in concurrent.futures.as_completed(futures):
            index, items, status = future.result()
            fresh.extend(items)
            ordered_statuses[index] = status
    statuses = [ordered_statuses[index] for index in sorted(ordered_statuses)]

    items = enrich_purchase_links(merge_items(fresh, existing.get("items", [])))
    result = {
        "generated_at": NOW.isoformat(),
        "retention_days": 14,
        "purchase_link_count": sum(item.get("link_type") == "purchase" for item in items),
        "items": items,
        "sources": statuses,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-dir", type=Path, help="Read numbered XML fixtures instead of the network")
    args = parser.parse_args()
    result = run(args.fixture_dir)
    successful = sum(1 for source in result["sources"] if source["ok"])
    print(f"Wrote {len(result['items'])} items from {successful}/{len(result['sources'])} sources to {OUTPUT}")


if __name__ == "__main__":
    main()
