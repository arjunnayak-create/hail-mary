"""Join scripts/data/college/{heisman,all_america}.csv to player ids.

A row matches a player with the same name (or a first-name/initial variant of it) who
attended that school and debuted in the NFL within a few seasons of the honor. Unmatched
rows are returned for the report; most are college stars who never played in the NFL.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

import config as C
from nfl import Data, college_key, name_key


@dataclass
class CollegeHonors:
    # player_id, honor ("heisman_win" | "heisman_finalist" | "all_american"), season, school_key
    rows: pd.DataFrame
    unmatched: list[dict]


def load(data: Data) -> CollegeHonors:
    p = data.players
    by_name: dict[str, list[str]] = {}
    for pid, n in p["name"].items():
        if isinstance(n, str):
            by_name.setdefault(name_key(n), []).append(pid)
    by_last: dict[str, list[str]] = {}
    for pid, n in p["last_name"].items():
        if isinstance(n, str):
            by_last.setdefault(name_key(n), []).append(pid)
    colleges = p["colleges"].map(lambda cs: {college_key(c) for c in cs or []})
    draft_col = p["draft_colleges"].map(college_key)

    def resolve(name: str, school: str, season: int) -> str | None:
        sk = college_key(school)

        def ok(pid: str) -> bool:
            at_school = sk in colleges.get(pid, set()) or draft_col.get(pid) == sk
            fs = p.at[pid, "first_season"]
            debut_ok = pd.isna(fs) or season - 1 <= fs <= season + 6
            return at_school and debut_ok

        cands = [c for c in by_name.get(name_key(name), []) if ok(c)]
        if not cands:  # nickname / middle initial: same surname + initial at that school
            parts = name.split()
            if len(parts) >= 2:
                init = name_key(parts[0])[:1]
                cands = [c for c in by_last.get(name_key(parts[-1]), []) if ok(c) and name_key(p.at[c, "name"])[:1] == init]
        if len(cands) > 1:  # prefer the debut closest to the season after the honor
            gap = {c: abs(p.at[c, "first_season"] - (season + 1)) if pd.notna(p.at[c, "first_season"]) else 99 for c in cands}
            best = sorted(cands, key=gap.get)
            if gap[best[0]] < gap[best[1]]:
                return best[0]
        return cands[0] if len(cands) == 1 else None

    rows, unmatched = [], []
    sources = []
    if (C.DATA / "college" / "heisman.csv").exists():
        h = pd.read_csv(C.DATA / "college" / "heisman.csv")
        sources += [("heisman_win" if r.place == 1 else "heisman_finalist", r) for r in h.itertuples()]
    if (C.DATA / "college" / "all_america.csv").exists():
        a = pd.read_csv(C.DATA / "college" / "all_america.csv")
        sources += [("all_american", r) for r in a.itertuples()]
    for honor, r in sources:
        pid = resolve(str(r.player), str(r.school), int(r.season))
        if pid is None:
            unmatched.append({"honor": honor, "season": int(r.season), "player": r.player, "school": r.school})
            continue
        rows.append({"player_id": pid, "honor": honor, "season": int(r.season), "school_key": college_key(str(r.school))})
    df = pd.DataFrame(rows, columns=["player_id", "honor", "season", "school_key"]).drop_duplicates()
    return CollegeHonors(df, unmatched)


def bonus_for_school(ch: CollegeHonors, school_names: set[str]) -> pd.Series:
    """Fame bonus (score points) per player for a college prompt covering `school_names`."""
    keys = {college_key(s) for s in school_names}
    r = ch.rows[ch.rows["school_key"].isin(keys)]
    pts = r["honor"].map(C.COLLEGE_HONOR_POINTS)
    by_player = pts.groupby([r["player_id"], r["honor"]]).sum().unstack(fill_value=0)
    # cap repeated All-America selections; a Heisman winner doesn't also need finalist points
    total = pd.Series(0.0, index=by_player.index)
    for honor, cap in C.COLLEGE_HONOR_CAPS.items():
        if honor in by_player:
            total += by_player[honor].clip(upper=cap)
    if "heisman_win" in by_player and "heisman_finalist" in by_player:
        total -= by_player["heisman_finalist"].where(by_player["heisman_win"] > 0, 0).clip(upper=C.COLLEGE_HONOR_CAPS["heisman_finalist"])
    return total
