"""Pull award winners from Wikipedia into scripts/data/awards/<award>.csv.

Re-runnable (pages are cached in scripts/.cache/wikipedia; pass --refresh to re-fetch).
The CSVs are committed so the build does not depend on Wikipedia being reachable;
they are joined to nflverse player IDs in build_prompts.py (unmatched names are reported).

Usage: scripts/.venv/bin/python scripts/fetch_awards.py [--refresh]
"""

from __future__ import annotations

import argparse
import csv
import re

from lxml import html as lxml_html

import config as C
import wiki

# key -> (page title, heading text of the section holding the winners table or None)
AWARDS = {
    "sb_mvp": ("Super Bowl Most Valuable Player", None),
    "mvp": ("AP NFL Most Valuable Player", None),
    "opoy": ("AP NFL Offensive Player of the Year", None),
    "dpoy": ("AP NFL Defensive Player of the Year", None),
    "oroy": ("AP NFL Rookie of the Year", "Offensive"),
    "droy": ("AP NFL Rookie of the Year", "Defensive"),
    "cpoy": ("AP NFL Comeback Player of the Year", None),
}
HOF_PAGE = "List of Pro Football Hall of Fame inductees"

NON_PERSON = re.compile(
    r"(NFL season|Super Bowl|Pro Bowl|All-Pro|Hall of Fame|football|^List of|Quarterback|"
    r"Running back|Wide receiver|Tight end|Linebacker|Cornerback|Safety|Defensive|Offensive|"
    r"Fullback|Kick returner|Punt returner|Return specialist|Placekicker|Punter)",
    re.I,
)
TEAM_WORDS = re.compile(
    r"(Packers|Bears|Lions|Vikings|Giants|Cowboys|Eagles|Redskins|Commanders|Washington|49ers|"
    r"Rams|Seahawks|Cardinals|Saints|Falcons|Buccaneers|Panthers|Patriots|Bills|Dolphins|Jets|"
    r"Steelers|Ravens|Browns|Bengals|Chiefs|Broncos|Raiders|Chargers|Colts|Titans|Oilers|"
    r"Texans|Jaguars)"
)


def _person_links(links: list[str]) -> list[str]:
    out = []
    for l in links:
        base = _strip_disambig(l)  # "Randy White (American football)" -> "Randy White"
        if not NON_PERSON.search(base) and not TEAM_WORDS.search(base):
            out.append(l)
    return out


def _strip_disambig(title: str) -> str:
    return re.sub(r"\s*\(.*?\)\s*$", "", title).strip()


def _season_from(cell) -> int | None:
    """NFL season of a row. Prefer the linked "YYYY NFL season" article: for Super Bowl
    MVP the visible year is the game's calendar year, one later than the season."""
    for l in cell.links:
        m = re.match(r"(\d{4}) (NFL|AFL) season", l)
        if m:
            return int(m.group(1))
    m = re.match(r"(\d{4})", cell.text)
    return int(m.group(1)) if m else None


def _tables_under_heading(html: str, heading: str | None) -> list:
    """Return parsed wikitables, optionally only those whose nearest preceding h2/h3 matches."""
    if heading is None:
        return wiki.parse_tables(html)
    doc = lxml_html.fromstring(html)
    keep = []
    for tb in doc.xpath("//table[contains(concat(' ', normalize-space(@class), ' '), ' wikitable ')]"):
        h = tb.xpath("preceding::*[self::h2 or self::h3][1]")
        keep.append(bool(h) and h[0].text_content().strip().lower().startswith(heading.lower()))
    tables = wiki.parse_tables(html)
    return [t for t, k in zip(tables, keep) if k]


def extract_award(key: str, refresh: bool) -> list[dict]:
    page, heading = AWARDS[key]
    title, html = wiki.fetch_parsed_html(page, refresh=refresh)
    rows = []
    for grid in _tables_under_heading(html, heading):
        header = [c.text.split("[")[0].strip().lower() for c in grid[0]]
        if not header or header[0] not in ("season", "year"):
            continue  # summary tables (multiple winners, by team ...)
        try:
            pcol = next(i for i, h in enumerate(header) if h in ("player", "winner"))
        except StopIteration:
            continue
        poscol = next((i for i, h in enumerate(header) if h == "position"), None)
        teamcol = next((i for i, h in enumerate(header) if h == "team"), None)
        for row in grid[1:]:
            season = _season_from(row[0])
            if season is None:
                continue
            people = _person_links(row[pcol].links)
            if not people:
                print(f"  [{key}] no player link in row: {[c.text for c in row]}")
                continue
            positions = [l for l in row[poscol].links] if poscol is not None else []
            for i, wt in enumerate(people):
                rows.append(
                    {
                        "season": season,
                        "player": _strip_disambig(wt),
                        "wiki_title": wt,
                        "position": positions[i] if i < len(positions) else (
                            row[poscol].text if poscol is not None else ""
                        ),
                        "team": row[teamcol].text if teamcol is not None else "",
                        "source": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                    }
                )
    # rowspans repeat identical rows; dedupe
    seen, out = set(), []
    for r in rows:
        k = (r["season"], r["wiki_title"])
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def extract_hof(refresh: bool) -> list[dict]:
    """Hall of Fame inductees (players only) with induction year."""
    title, html = wiki.fetch_parsed_html(HOF_PAGE, refresh=refresh)
    out = []
    for grid in wiki.parse_tables(html):
        header = [c.text.split("[")[0].strip().lower() for c in grid[0]]
        if "inductee" not in " ".join(header) and "name" not in header:
            continue
        ncol = next((i for i, h in enumerate(header) if h in ("inductee", "name", "inductees")), None)
        ycol = next((i for i, h in enumerate(header) if "year" in h or "class" in h), None)
        pcol = next((i for i, h in enumerate(header) if h.startswith("position")), None)
        if ncol is None:
            continue
        for row in grid[1:]:
            people = _person_links(row[ncol].links)
            if not people:
                continue
            year = None
            if ycol is not None:
                m = re.search(r"(\d{4})", row[ycol].text)
                year = int(m.group(1)) if m else None
            pos = row[pcol].text if pcol is not None else ""
            out.append(
                {
                    "inducted": year,
                    "player": _strip_disambig(people[0]),
                    "wiki_title": people[0],
                    "position": pos,
                    "source": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                }
            )
    seen, dedup = set(), []
    for r in out:
        if r["wiki_title"] not in seen:
            seen.add(r["wiki_title"])
            dedup.append(r)
    return dedup


def write_csv(path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    for key in AWARDS:
        rows = extract_award(key, args.refresh)
        write_csv(C.AWARDS_DIR / f"{key}.csv", rows)
        seasons = [r["season"] for r in rows]
        print(f"{key:7s} {len(rows):3d} winners, seasons {min(seasons)}-{max(seasons)}")
    hof = extract_hof(args.refresh)
    write_csv(C.AWARDS_DIR / "hof.csv", hof)
    print(f"hof     {len(hof):3d} inductees")


if __name__ == "__main__":
    main()
