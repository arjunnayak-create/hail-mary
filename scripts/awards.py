"""Join the Wikipedia award / Hall of Fame CSVs to nflverse player IDs.

A winner is matched by name, then disambiguated by being on a roster in the award season
and by position. Anything that cannot be matched uniquely is returned in `unmatched` (and
written to the pipeline report) rather than guessed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import pandas as pd

import config as C
from fetch_awards import AWARDS
from nfl import Data, name_key

POSITION_WORDS = [
    (r"quarterback|\bqb\b", "QB"),
    (r"running back|fullback|halfback|\brb\b|\bfb\b", "RB"),
    (r"wide receiver|\bwr\b|split end|flanker", "WR"),
    (r"tight end|\bte\b", "TE"),
    (r"defensive end|defensive tackle|nose tackle|defensive line|\bde\b|\bdt\b|\bnt\b", "DL"),
    (r"linebacker|\blb\b", "LB"),
    (r"cornerback|safety|defensive back|\bcb\b|\bs\b|\bdb\b", "DB"),
    (r"offensive tackle|guard|center|offensive line|\bot\b|\bt\b|\bg\b|\bc\b", "OL"),
    (r"kicker|\bk\b", "K"),
    (r"punter|\bp\b", "P"),
]


# team text (full name, nickname or city as written on Wikipedia) -> franchise codes
TEAM_KEYWORDS = {
    "Cardinals": "ARI", "Arizona": "ARI", "Falcons": "ATL", "Atlanta": "ATL", "Ravens": "BAL",
    "Bills": "BUF", "Buffalo": "BUF", "Panthers": "CAR", "Carolina": "CAR", "Bears": "CHI",
    "Chicago": "CHI", "Bengals": "CIN", "Cincinnati": "CIN", "Browns": "CLE", "Cleveland": "CLE",
    "Cowboys": "DAL", "Dallas": "DAL", "Broncos": "DEN", "Denver": "DEN", "Lions": "DET",
    "Detroit": "DET", "Packers": "GB", "Green Bay": "GB", "Texans": "HOU", "Colts": "IND",
    "Indianapolis": "IND", "Jaguars": "JAX", "Jacksonville": "JAX", "Chiefs": "KC",
    "Kansas City": "KC", "Chargers": "LAC", "San Diego": "LAC", "Rams": "LAR", "St. Louis": "LAR",
    "Raiders": "LV", "Oakland": "LV", "Las Vegas": "LV", "Dolphins": "MIA", "Miami": "MIA",
    "Vikings": "MIN", "Minnesota": "MIN", "Patriots": "NE", "New England": "NE", "Saints": "NO",
    "New Orleans": "NO", "Giants": "NYG", "Jets": "NYJ", "Eagles": "PHI", "Philadelphia": "PHI",
    "Steelers": "PIT", "Pittsburgh": "PIT", "Seahawks": "SEA", "Seattle": "SEA", "49ers": "SF",
    "San Francisco": "SF", "Buccaneers": "TB", "Tampa Bay": "TB", "Titans": "TEN", "Oilers": "TEN",
    "Tennessee": "TEN", "Redskins": "WAS", "Commanders": "WAS", "Washington": "WAS",
}


def team_franchises(text: str) -> set[str]:
    return {code for kw, code in TEAM_KEYWORDS.items() if kw in str(text or "")}


def position_groups(text: str) -> set[str]:
    t = (text or "").lower()
    if "returner" in t or "return specialist" in t:
        return set()  # returners can be any position
    return {g for pat, g in POSITION_WORDS if re.search(pat, t)}


@dataclass
class AwardData:
    wins: pd.DataFrame  # player_id, award, season, name (in-range and pre-range)
    hof_ids: set[str]
    unmatched: list[dict]


def _name_index(data: Data) -> dict[str, list[str]]:
    p = data.players
    idx: dict[str, list[str]] = {}
    variants = [p["name"]]
    for first_col in ("football_name", "common_first_name", "first_name"):
        if first_col in p:
            variants.append(p[first_col].fillna("") + " " + p["last_name"].fillna(""))
    for series in variants:
        for pid, n in series.items():
            k = name_key(n)
            if k and pid not in idx.setdefault(k, []):
                idx[k].append(pid)
    return idx


def _groups_by_player(data: Data) -> dict[str, set[str]]:
    g = data.rosters.dropna(subset=["group"]).groupby("player_id")["group"].agg(set)
    return g.to_dict()


def _seasons_by_player(data: Data) -> dict[str, set[int]]:
    return data.rosters.groupby("player_id")["season"].agg(set).to_dict()


def _franchises_in(data: Data) -> dict[tuple[str, int], set[str]]:
    r = data.rosters.dropna(subset=["franchise"])
    return r.groupby(["player_id", "season"])["franchise"].agg(set).to_dict()


def _resolve(
    name, season, pos_text, idx, seasons, groups, data, team_text="", fr=None, inducted=None
) -> tuple[str | None, str]:
    cands = idx.get(name_key(name), [])
    want = position_groups(pos_text)

    def pos_ok(pid):
        return not want or not groups.get(pid) or bool(want & groups[pid])

    if season is not None:
        active = [p for p in cands if season in seasons.get(p, set()) and pos_ok(p)]
        if len(active) == 1:
            return active[0], "name+season"
        if len(active) > 1:
            teams = team_franchises(team_text)
            on_team = [p for p in active if teams & (fr or {}).get((p, season), set())]
            if len(on_team) == 1:
                return on_team[0], "name+season+team"
            return None, f"ambiguous: {active}"
        # last name + season + position (e.g. nflverse "Patrick Surtain" for "Patrick Surtain II")
        last = name_key(name.split()[-1]) if name.split() else ""
        first = name_key(name.split()[0])[:1] if name.split() else ""
        p = data.players
        same_last = p.index[(p["last_name"].map(name_key) == last)]
        active = [
            pid for pid in same_last
            if season in seasons.get(pid, set()) and pos_ok(pid)
            and name_key(p.at[pid, "name"])[:1] == first
        ]
        if len(active) == 1:
            return active[0], "lastname+initial+season"
        return None, "no roster match in season" if not active else f"ambiguous: {active}"
    # no season (Hall of Fame): unique name with compatible position, else most roster seasons
    cands = [p for p in cands if pos_ok(p) and seasons.get(p)]
    if inducted and len(cands) > 1:  # inductees have been retired for 5+ years
        cands = [p for p in cands if max(seasons[p]) <= inducted - 5]
    if len(cands) == 1:
        return cands[0], "name"
    if len(cands) > 1:
        best = sorted(cands, key=lambda p: -len(seasons.get(p, ())))
        if len(seasons[best[0]]) >= 2 * len(seasons[best[1]]):
            return best[0], "name (most seasons)"
        return None, f"ambiguous: {cands}"
    return None, "no name match"


def load(data: Data) -> AwardData:
    idx = _name_index(data)
    seasons = _seasons_by_player(data)
    groups = _groups_by_player(data)
    fr = _franchises_in(data)
    rows, unmatched = [], []
    for key in AWARDS:
        df = pd.read_csv(C.AWARDS_DIR / f"{key}.csv")
        for r in df.itertuples():
            pid, how = _resolve(
                r.player, int(r.season), r.position, idx, seasons, groups, data, r.team, fr
            )
            if pid is None:
                unmatched.append(
                    {"award": key, "season": int(r.season), "player": r.player, "reason": how,
                     "in_range": int(r.season) >= C.RANGE_START}
                )
                pid = f"wiki-{name_key(r.player)}"  # still usable for out-of-range lists
            rows.append({"player_id": pid, "award": key, "season": int(r.season), "name": r.player, "how": how})
    hof = pd.read_csv(C.AWARDS_DIR / "hof.csv")
    hof_ids = set()
    for r in hof.itertuples():
        if position_groups(str(r.position)) == set() and re.search(r"coach|contributor|owner|admin", str(r.position), re.I):
            continue
        inducted = int(r.inducted) if pd.notna(r.inducted) else None
        pid, how = _resolve(
            r.player, None, str(r.position), idx, seasons, groups, data, inducted=inducted
        )
        if pid:
            hof_ids.add(pid)
        else:
            in_range = any(max(seasons.get(c, {0})) >= C.RANGE_START for c in idx.get(name_key(r.player), []))
            unmatched.append(
                {"award": "hof", "season": r.inducted, "player": r.player, "reason": how, "in_range": in_range}
            )
    return AwardData(pd.DataFrame(rows), hof_ids, unmatched)
