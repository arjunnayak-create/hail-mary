"""Fill scripts/data/honors_override.csv (Pro Bowls, first-team All-Pro, HOF) from Wikipedia
for in-range players that nflverse's draft_picks file has no honors data for:

  * undrafted       - no draft record, career began 1980 or later (Warner, Gates, Romo)
  * pre1980_career  - drafted before 1980 or career began before 1980 (Montana, Payton);
                      draft_picks only starts in 1980

Notability filter: a player is fetched only if his name matches a member of a Wikipedia
Pro Bowl category (config.OVERRIDE_CATEGORIES), or he is a Hall of Famer / award winner.

Each player's Wikipedia page is only accepted when its infobox birth date equals the
nflverse birth date (status "ok"), or is within ~1 year of it when that is the only such
page (status "ok_approx_bd"; nflverse birth dates for older players are often slightly off).
Everything else is written with status "no_verified_page" and ignored by the build.
Rows with status "manual" are preserved across re-runs so hand edits are never overwritten.

Usage: scripts/.venv/bin/python scripts/fetch_honors_override.py [--refresh]
"""

from __future__ import annotations

import argparse
import datetime as dt
import re

import mwparserfromhell as mw
import pandas as pd

import awards
import config as C
import fame
import nfl
import wiki

POSITION_WORDS = {
    "QB": "quarterback", "RB": "running back", "WR": "wide receiver", "TE": "tight end",
    "EDGE": "defensive end", "LB": "linebacker", "CB": "cornerback", "S": "safety",
    "DB": "defensive back", "DT": "defensive tackle", "DL": "defensive lineman",
    "OL": "offensive lineman", "K": "placekicker", "P": "punter", "LS": "long snapper",
}
APPROX_BD_DAYS = 370
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september",
     "october", "november", "december"], start=1)}


def candidates(data: nfl.Data, aw: awards.AwardData, refresh: bool) -> tuple[pd.DataFrame, dict]:
    """Return (candidate rows with a `titles` column of pages to try, category sizes)."""
    p = data.players
    real = ~p.index.str.startswith(("syn-", "dp-"))
    pool = p[real & ~p["drafted_1980plus"] & (p["roster_seasons_in_range"] > 0)].copy()
    pool["reason"] = "pre1980_career"
    pool.loc[pool["draft_year"].isna() & (pool["first_season"] >= C.RANGE_START), "reason"] = "undrafted"

    by_base: dict[str, list[str]] = {}
    sizes = {}
    for cat in C.OVERRIDE_CATEGORIES:
        members = wiki.category_members(cat, refresh=refresh)
        sizes[cat] = len(members)
        for t in members:
            by_base.setdefault(nfl.name_key(re.sub(r"\s*\(.*\)$", "", t)), []).append(t)
    notable_ids = aw.hof_ids | set(aw.wins["player_id"])

    titles, keep = [], []
    for pid, r in pool.iterrows():
        cat_titles = list(dict.fromkeys(by_base.get(nfl.name_key(r["name"]), [])))
        if cat_titles or pid in notable_ids:
            keep.append(pid)
            titles.append(cat_titles + [t for t in title_guesses(r["name"], r["bucket"]) if t not in cat_titles])
    out = pool.loc[keep].copy()
    out["titles"] = titles
    out["notable"] = out.index.isin(notable_ids)
    return out, sizes


# --------------------------------------------------------------------------- infobox parsing
def _infobox(code) -> mw.wikicode.Template | None:
    for tpl in code.filter_templates(recursive=True):
        name = str(tpl.name).lower()
        if tpl.has("highlights") or tpl.has("stat_label1") or tpl.has("statlabel1") or (
            "football" in name and "infobox" in name
        ):
            return tpl
    return None


def _birth_date(code) -> str | None:
    """Birth date from any infobox on the page (the football infobox is sometimes embedded
    in an outer "Infobox person"/"officeholder" that carries the birth date)."""
    for tpl in code.filter_templates(recursive=True):
        if str(tpl.name).strip().lower().startswith("infobox") and tpl.has("birth_date"):
            bd = _parse_birth_date(tpl.get("birth_date").value)
            if bd:
                return bd
    return None


def _parse_birth_date(val) -> str | None:
    for t in val.filter_templates(recursive=True):
        n = str(t.name).strip().lower()
        if n.startswith(("birth date", "birth-date", "bda", "dob")):
            nums = [str(p.value).strip() for p in t.params if not p.showkey]
            nums = [x for x in nums if x.isdigit()]
            if len(nums) >= 3:
                try:
                    return dt.date(int(nums[0]), int(nums[1]), int(nums[2])).isoformat()
                except ValueError:
                    return None
    text = val.strip_code().strip().lower()
    m = re.search(r"([a-z]+) (\d{1,2}), (\d{4})", text)
    if m and m.group(1) in MONTHS:
        return dt.date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2))).isoformat()
    return None


CAREER_STATS = [  # (csv column, stat label pattern)
    ("career_pass_yds", r"^passing yards"),
    ("career_rush_yds", r"^rushing yards"),
    ("career_rec_yds", r"^receiving yards"),
    ("career_sacks", r"^sacks"),
    ("career_def_ints", r"^interceptions$"),
    ("career_fg_made", r"^field goals( made)?"),
]


def _career_stats(tpl) -> dict:
    """Career totals from the infobox stat_label/stat_value pairs (pre-1999 production)."""
    out = {}
    for i in range(1, 15):
        for lk, vk in ((f"stat_label{i}", f"stat_value{i}"), (f"statlabel{i}", f"statvalue{i}")):
            if not (tpl.has(lk) and tpl.has(vk)):
                continue
            label = tpl.get(lk).value.strip_code().strip().lower()
            m = re.search(r"\d[\d,]*(\.\d+)?", tpl.get(vk).value.strip_code())
            if not m:
                continue
            for col, pat in CAREER_STATS:
                if re.search(pat, label) and col not in out:
                    out[col] = float(m.group(0).replace(",", ""))
    return out


def _count(line: str, pattern: str) -> int | None:
    m = re.match(rf"^(?:(\d+)\s*[×x]\s*)?{pattern}", line, re.I)
    if not m:
        return None
    return int(m.group(1)) if m.group(1) else 1


def parse_honors(wikitext: str) -> dict | None:
    code = mw.parse(wikitext)
    tpl = _infobox(code)
    if tpl is None:
        return None
    highlights = str(tpl.get("highlights").value) if tpl.has("highlights") else ""
    lines = [
        mw.parse(l).strip_code().strip(" *;:\t")
        for l in re.split(r"\n|<br\s*/?>", highlights)
        if l.strip()
    ]
    pro_bowls = all_pro = 0
    for line in lines:
        pb = _count(line, r"Pro Bowl\b(?!\s*(MVP|Most|selection\s*\(AFL))")
        if pb is not None and not re.search(r"MVP|Most Valuable", line):
            pro_bowls = max(pro_bowls, pb)
        ap = _count(line, r"First[- ]team All[- ]Pro")
        if ap is not None:
            all_pro = max(all_pro, ap)
    hof = "Category:Pro Football Hall of Fame inductees" in wikitext or any(
        re.match(r"^Pro Football Hall of Fame", l, re.I) for l in lines
    )
    return {"pro_bowls": pro_bowls, "first_team_all_pro": all_pro, "hof": hof,
            "birth_date": _birth_date(code), **_career_stats(tpl)}


# --------------------------------------------------------------------------- page resolution
def title_guesses(name: str, bucket: str) -> list[str]:
    word = POSITION_WORDS.get(bucket)
    out = [f"{name} (American football)", name]
    if word:
        out.append(f"{name} ({word})")
    return out


def bd_match(page_bd: str | None, nfl_bd: str | None) -> str | None:
    """'exact', 'approx' (nflverse birth dates for older players are often off by a day or
    a year; Wikipedia footnotes some of these), or None."""
    if not page_bd or not nfl_bd:
        return None
    if page_bd == nfl_bd:
        return "exact"
    gap = abs((dt.date.fromisoformat(page_bd) - dt.date.fromisoformat(nfl_bd)).days)
    return "approx" if gap <= APPROX_BD_DAYS else None


def name_ok(title: str, r: pd.Series, level: str) -> bool:
    """Page title must name the same person: same full name for approximate birth dates,
    at least the same last name for exact ones (nicknames: "Mean Joe", "Jimbo" ...)."""
    page = nfl.name_key(re.sub(r"\s*\(.*\)$", "", title))
    if page == nfl.name_key(r["name"]):
        return True
    last = nfl.name_key(r["last_name"]) if isinstance(r.get("last_name"), str) else ""
    return level == "exact" and bool(last) and page.endswith(last)


def resolve(rows: pd.DataFrame, refresh: bool) -> list[dict]:
    guesses = dict(zip(rows.index, rows["titles"]))
    pages = wiki.fetch_wikitexts([t for ts in guesses.values() for t in ts], refresh=refresh)
    results = []
    for pid, r in rows.iterrows():
        bd = r["birth_date"] if isinstance(r["birth_date"], str) else None
        parsed = []  # (title, honors) for every candidate page with a football infobox
        for t in guesses[pid]:
            page = pages.get(t)
            if page and (h := parse_honors(page[1])):
                parsed.append((page[0], h))
        if r["notable"] and not any(bd_match(h["birth_date"], bd) == "exact" for _, h in parsed):
            for t in wiki.search_titles(f'"{r["name"]}" American football'):
                if t in guesses[pid]:
                    continue
                page = wiki.fetch_wikitexts([t]).get(t)
                if page and (h := parse_honors(page[1])):
                    parsed.append((page[0], h))
        found = None
        for level in ("exact", "approx"):
            hits = {
                title: h for title, h in parsed
                if bd_match(h["birth_date"], bd) == level and name_ok(title, r, level)
            }
            if len(hits) == 1:  # a unique page at this confidence level
                found = (*next(iter(hits.items())), level)
                break
            if len(hits) > 1:
                break  # two different pages match: don't guess
        row = {
            "player_id": pid, "name": r["name"], "reason": r["reason"], "position": r["position"],
            "birth_date": bd or "",
        }
        if found:
            title, h, level = found
            row.update(
                pro_bowls=h["pro_bowls"], first_team_all_pro=h["first_team_all_pro"], hof=h["hof"],
                wiki_title=title, status="ok" if level == "exact" else "ok_approx_bd",
                wiki_birth_date=h["birth_date"],
                **{col: h.get(col, "") for col, _ in CAREER_STATS},
                source=f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
            )
        else:
            row.update(pro_bowls="", first_team_all_pro="", hof="", wiki_title="",
                       status="no_verified_page", wiki_birth_date="", source="")
        results.append(row)
    return results


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    data = nfl.load()
    aw = awards.load(data)
    cands, sizes = candidates(data, aw, args.refresh)
    for cat, n in sizes.items():
        print(f"  {cat}: {n} pages")
    print(f"{(cands.reason == 'undrafted').sum()} undrafted + {(cands.reason == 'pre1980_career').sum()} "
          f"pre-1980-career candidates")

    out = pd.DataFrame(resolve(cands, args.refresh))
    filled = out[out["status"] != "no_verified_page"]
    # name-only category matches that fail verification are usually namesakes of the real
    # Pro Bowler; keep them out of the committed CSV but write them for review
    C.OUT_DIR.mkdir(parents=True, exist_ok=True)
    out[out["status"] == "no_verified_page"].to_csv(C.OUT_DIR / "override_unverified.csv", index=False)
    if C.HONORS_OVERRIDE.exists():  # keep hand-edited rows
        old = pd.read_csv(C.HONORS_OVERRIDE, dtype=str)
        manual = old[old["status"] == "manual"]
        filled = pd.concat([filled[~filled["player_id"].isin(manual["player_id"])], manual])
    filled.sort_values(["reason", "name"]).to_csv(C.HONORS_OVERRIDE, index=False)
    print(f"wrote {C.HONORS_OVERRIDE.relative_to(C.ROOT)}: {len(filled)} filled "
          f"({(filled.reason == 'undrafted').sum()} undrafted, {(filled.reason == 'pre1980_career').sum()} pre-1980); "
          f"{(out.status == 'no_verified_page').sum()} unverified -> scripts/out/override_unverified.csv")

if __name__ == "__main__":
    main()
