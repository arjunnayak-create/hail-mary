"""Minimal Wikipedia helpers: polite API fetches with an on-disk cache, plus an HTML
table parser that expands rowspan/colspan and keeps each cell's link targets.

Fetched pages are untrusted data; they are only ever parsed, never executed.
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path

import requests
from lxml import html as lxml_html

API = "https://en.wikipedia.org/w/api.php"
# Wikimedia requires a descriptive agent with contact info (otherwise: HTTP 403)
USER_AGENT = "HailMaryTrivia/0.2 (https://github.com/arjunnayak-create/hail-mary)"
CACHE = Path(__file__).resolve().parent / ".cache" / "wikipedia"

_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT
_last_request = 0.0


def _get(params: dict) -> dict:
    global _last_request
    wait = 0.2 - (time.time() - _last_request)
    if wait > 0:
        time.sleep(wait)
    params = {**params, "format": "json", "formatversion": 2}
    for attempt in range(4):
        r = _session.get(API, params=params, timeout=60)
        _last_request = time.time()
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        r.raise_for_status()
        return r.json()
    r.raise_for_status()
    return r.json()


def _cache_path(kind: str, title: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", title)[:150]
    return CACHE / kind / f"{safe}.json"


def fetch_parsed_html(title: str, refresh: bool = False) -> tuple[str, str]:
    """Return (resolved_title, rendered_html) for a page, following redirects."""
    path = _cache_path("html", title)
    if path.exists() and not refresh:
        d = json.loads(path.read_text())
    else:
        d = _get({"action": "parse", "page": title, "prop": "text", "redirects": 1})
        if "error" in d:
            raise RuntimeError(f"Wikipedia error for {title!r}: {d['error']}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(d))
    return d["parse"]["title"], d["parse"]["text"]


def fetch_wikitext(title: str, refresh: bool = False) -> tuple[str, str] | None:
    """Return (resolved_title, wikitext) or None if the page does not exist."""
    path = _cache_path("wikitext", title)
    if path.exists() and not refresh:
        d = json.loads(path.read_text())
    else:
        d = _get({"action": "parse", "page": title, "prop": "wikitext", "redirects": 1})
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(d))
    if "error" in d:
        return None
    return d["parse"]["title"], d["parse"]["wikitext"]


@dataclass
class Cell:
    text: str
    links: list[str] = field(default_factory=list)  # article titles linked from the cell
    is_header: bool = False


def _link_title(href: str) -> str | None:
    if not href.startswith("/wiki/"):
        return None
    name = urllib.parse.unquote(href[len("/wiki/"):]).split("#")[0]
    if ":" in name:  # File:, Help:, Category: ...
        return None
    return name.replace("_", " ")


def _span(el, attr: str) -> int:
    raw = el.get(attr) or "1"
    digits = re.sub(r"[^0-9]", "", raw)
    return max(1, int(digits)) if digits else 1


def _cell_text(el) -> str:
    for sup in el.xpath(".//sup"):  # footnote markers like [a] or [12]
        sup.drop_tree()
    for hidden in el.xpath(".//*[contains(@style,'display:none')]"):
        hidden.drop_tree()
    text = " ".join(el.text_content().split())
    return text


def parse_tables(html: str, css_class: str = "wikitable") -> list[list[list[Cell]]]:
    """Parse every <table class="...wikitable..."> into a rectangular grid of Cells."""
    doc = lxml_html.fromstring(html)
    out = []
    for table in doc.xpath(f"//table[contains(concat(' ', normalize-space(@class), ' '), ' {css_class} ')]"):
        grid: list[list[Cell | None]] = []
        pending: dict[tuple[int, int], Cell] = {}  # (row, col) -> cell carried by rowspan
        for r_idx, tr in enumerate(table.xpath("./tr | ./thead/tr | ./tbody/tr | ./tfoot/tr")):
            row: list[Cell | None] = []
            col = 0
            for td in tr.xpath("./td | ./th"):
                while (r_idx, col) in pending:
                    row.append(pending.pop((r_idx, col)))
                    col += 1
                links = [t for a in td.xpath(".//a[@href]") if (t := _link_title(a.get("href")))]
                cell = Cell(_cell_text(td), links, td.tag == "th")
                rs, cs = _span(td, "rowspan"), _span(td, "colspan")
                for c in range(cs):
                    row.append(cell)
                    for r in range(1, rs):
                        pending[(r_idx + r, col + c)] = cell
                col += cs
            while (r_idx, col) in pending:
                row.append(pending.pop((r_idx, col)))
                col += 1
            grid.append(row)
        width = max((len(r) for r in grid), default=0)
        out.append([r + [Cell("")] * (width - len(r)) for r in grid])
    return out


def fetch_wikitexts(titles: list[str], refresh: bool = False) -> dict[str, tuple[str, str] | None]:
    """Batch version of fetch_wikitext (50 titles per API call). Returns
    {requested_title: (resolved_title, wikitext) or None if missing}."""
    out: dict[str, tuple[str, str] | None] = {}
    todo = []
    for t in dict.fromkeys(titles):
        path = _cache_path("wikitext_q", t)
        if path.exists() and not refresh:
            d = json.loads(path.read_text())
            out[t] = tuple(d) if d else None
        else:
            todo.append(t)
    for i in range(0, len(todo), 50):
        chunk = todo[i : i + 50]
        d = _get(
            {
                "action": "query",
                "prop": "revisions",
                "rvprop": "content",
                "rvslots": "main",
                "titles": "|".join(chunk),
                "redirects": 1,
            }
        )
        q = d.get("query", {})
        rename = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redirect = {n["from"]: n["to"] for n in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in chunk:
            final = rename.get(t, t)
            final = redirect.get(final, final)
            page = pages.get(final)
            if page and not page.get("missing") and page.get("revisions"):
                res = (final, page["revisions"][0]["slots"]["main"]["content"])
            else:
                res = None
            out[t] = res
            path = _cache_path("wikitext_q", t)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(list(res) if res else None))
    return out


def search_titles(query: str, limit: int = 5) -> list[str]:
    path = _cache_path("search", query)
    if path.exists():
        return json.loads(path.read_text())
    d = _get({"action": "query", "list": "search", "srsearch": query, "srlimit": limit})
    titles = [r["title"] for r in d.get("query", {}).get("search", [])]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(titles))
    return titles


def category_members(category: str, refresh: bool = False) -> list[str]:
    """All article titles in a category (namespace 0), following API continuation."""
    path = _cache_path("category", category)
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    titles: list[str] = []
    params = {"action": "query", "list": "categorymembers", "cmtitle": category, "cmlimit": 500, "cmnamespace": 0}
    while True:
        d = _get(params)
        titles += [m["title"] for m in d.get("query", {}).get("categorymembers", [])]
        if "continue" not in d:
            break
        params = {**params, **d["continue"]}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(titles))
    return titles
