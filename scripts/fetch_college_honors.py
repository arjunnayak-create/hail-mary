"""Pull college honors from Wikipedia into scripts/data/college/*.csv:

  heisman.csv       season, player, school, place   (place 1 = winner; top-N vote-getters
                                                     from each season's Heisman voting table)
  all_america.csv   season, player, school, position (consensus All-America teams)

Used for the college-prompt fame bump (a school's Heisman winners and All-Americans are the
names its fans know). Re-runnable; pages are cached in scripts/.cache/wikipedia.

Usage: scripts/.venv/bin/python scripts/fetch_college_honors.py [--refresh] [--from 1975]
"""

from __future__ import annotations

import argparse
import csv
import re

from lxml import html as lxml_html

import config as C
import wiki

OUT = C.DATA / "college"
CLEAN = re.compile(r"[*†‡§#^]+|\(\d+\)|\[.*?\]")


def clean_name(s: str) -> str:
    return " ".join(CLEAN.sub("", s).split()).strip()


def clean_school(s: str) -> str:
    return " ".join(re.sub(r"\(.*?\)|\[.*?\]|[*†‡§#^]", "", s).split()).strip()


def season_page(year: int) -> str:
    if year >= 2006:
        return f"{year} NCAA Division I FBS football season"
    if year >= 1978:
        return f"{year} NCAA Division I-A football season"
    return f"{year} NCAA University Division football season" if year < 1973 else f"{year} NCAA Division I football season"


def tables_with_headings(html: str):
    doc = lxml_html.fromstring(html)
    heads = []
    for tb in doc.xpath("//table[contains(concat(' ', normalize-space(@class), ' '), ' wikitable ')]"):
        h = tb.xpath("preceding::*[self::h2 or self::h3 or self::h4][1]")
        heads.append(h[0].text_content().strip() if h else "")
    return list(zip(heads, wiki.parse_tables(html)))


def col(header: list[str], *names: str) -> int | None:
    for i, h in enumerate(header):
        if any(h.lower().startswith(n) for n in names):
            return i
    return None


def heisman(start: int, refresh: bool) -> list[dict]:
    rows: dict[tuple[int, str], dict] = {}
    # winners (authoritative list)
    _, html = wiki.fetch_parsed_html("List of Heisman Trophy winners", refresh=refresh)
    for _, g in tables_with_headings(html):
        hdr = [c.text.split("[")[0].strip() for c in g[0]]
        yi, ni, si = col(hdr, "year"), col(hdr, "name"), col(hdr, "school")
        if None in (yi, ni, si) or col(hdr, "points") is None:
            continue
        for r in g[1:]:
            m = re.match(r"(\d{4})", r[yi].text)
            if m and int(m.group(1)) >= start:
                y, n = int(m.group(1)), clean_name(r[ni].text)
                rows[(y, n)] = {"season": y, "player": n, "school": clean_school(r[si].text), "place": 1}
    # finalists: top vote-getters from each season page
    for y in range(start, C.COLLEGE_HONORS_LAST_SEASON + 1):
        try:
            _, html = wiki.fetch_parsed_html(season_page(y), refresh=refresh)
        except RuntimeError:
            print(f"  no season page for {y}")
            continue
        for head, g in tables_with_headings(html):
            hdr = [c.text.split("[")[0].strip() for c in g[0]]
            if "heisman" not in head.lower() or col(hdr, "player") is None:
                continue
            pi, si = col(hdr, "player"), col(hdr, "school", "team")
            for place, r in enumerate(g[1:], start=1):
                if place > C.HEISMAN_FINALIST_PLACES:
                    break
                n = clean_name(r[pi].text)
                if n and (y, n) not in rows:
                    rows[(y, n)] = {"season": y, "player": n, "school": clean_school(r[si].text) if si is not None else "", "place": place}
            break
    return sorted(rows.values(), key=lambda r: (r["season"], r["place"]))


def all_america(start: int, refresh: bool) -> list[dict]:
    out = []
    for y in range(start, C.COLLEGE_HONORS_LAST_SEASON + 1):
        try:
            _, html = wiki.fetch_parsed_html(f"{y} College Football All-America Team", refresh=refresh)
        except RuntimeError:
            print(f"  no All-America page for {y}")
            continue
        n_before = len(out)
        for head, g in tables_with_headings(html):
            hdr = [c.text.split("[")[0].strip() for c in g[0]]
            ni, si, pi = col(hdr, "name", "player"), col(hdr, "school", "university", "college"), col(hdr, "position")
            if ni is None or si is None:
                continue
            if head and re.search(r"second|third|honorable|freshman", head, re.I):
                continue
            for r in g[1:]:
                n = clean_name(r[ni].text)
                if n:
                    out.append({"season": y, "player": n, "school": clean_school(r[si].text), "position": r[pi].text if pi is not None else ""})
        if len(out) == n_before:
            out.extend(consensus_from_lists(y, html))
        if len(out) == n_before:
            print(f"  {y}: no consensus selections parsed")
    return out


def consensus_from_lists(year: int, html: str) -> list[dict]:
    """Older/list-style pages: one bullet per selection under each position heading,
    "Name, School (selectors)". Consensus All-Americans have their NAME in bold."""
    doc = lxml_html.fromstring(html)
    out = []
    for h in doc.xpath("//h3 | //h4"):
        pos = h.text_content().strip()
        if re.search(r"see also|references|notes|footnote|selector|key", pos, re.I):
            continue
        for li in h.xpath("following-sibling::*[1][self::ul]/li | following::ul[1]/li"):
            text = " ".join(li.text_content().split())
            name = clean_name(text.split(",")[0])
            bold = [" ".join(b.text_content().split()) for b in li.xpath(".//b")]
            if not name or not any(clean_name(b) == name for b in bold):
                continue
            school = clean_school(text.split(",", 1)[1]) if "," in text else ""
            out.append({"season": year, "player": name, "school": school, "position": pos})
    seen, dedup = set(), []
    for r in out:
        k = (r["player"], r["school"])
        if k not in seen:
            seen.add(k)
            dedup.append(r)
    return dedup


def write(name: str, rows: list[dict]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / name, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--from", dest="start", type=int, default=C.COLLEGE_HONORS_FIRST_SEASON)
    args = ap.parse_args()
    h = heisman(args.start, args.refresh)
    write("heisman.csv", h)
    print(f"heisman: {sum(r['place'] == 1 for r in h)} winners, {len(h)} rows")
    a = all_america(args.start, args.refresh)
    write("all_america.csv", a)
    print(f"all-america: {len(a)} rows over {len({r['season'] for r in a})} seasons")


if __name__ == "__main__":
    main()
