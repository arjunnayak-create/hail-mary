"""Load and normalize nflverse data into a few tidy tables keyed by one player_id.

player_id is the nflverse gsis_id when the player exists in players.parquet. Roster rows
before ~1990 often carry no IDs at all, so they are joined on name + birth date; anything
still unmatched gets a synthetic "syn-..." ID (these are obscure depth players).
"""

from __future__ import annotations

import glob
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache

import pandas as pd

import config as C

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def name_key(name: str | None) -> str:
    """Join key for names: lowercase ascii letters only, suffixes dropped."""
    if not isinstance(name, str):
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    tokens = re.sub(r"[^a-z0-9 ]+", " ", s.replace("'", "").replace(".", "")).split()
    tokens = [t for t in tokens if t not in SUFFIXES]
    return "".join(tokens)


# --------------------------------------------------------------------------- franchises
FRANCHISE_NAMES = {
    "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers",
    "CHI": "Bears", "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos",
    "DET": "Lions", "GB": "Packers", "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars",
    "KC": "Chiefs", "LAC": "Chargers", "LAR": "Rams", "LV": "Raiders", "MIA": "Dolphins",
    "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants", "NYJ": "Jets",
    "PHI": "Eagles", "PIT": "Steelers", "SEA": "Seahawks", "SF": "49ers", "TB": "Buccaneers",
    "TEN": "Titans", "WAS": "Commanders",
}


def franchise(team: str, season: int) -> str | None:
    """Map a raw nflverse roster team code + season to a current franchise code.

    Several codes are reused across eras (see scripts/README.md).
    """
    # draft_picks uses Pro Football Reference codes
    t = {"GNB": "GB", "KAN": "KC", "LVR": "LV", "NOR": "NO", "NWE": "NE", "SDG": "SD", "SFO": "SF",
         "TAM": "TB"}.get(team, team)
    if t in ("PHO", "ARZ") or (t == "STL" and season <= 1987):
        return "ARI"
    if t in ("RAM", "SL") or (t == "LA" and (season <= 1994 or season >= 2016)) or (
        t == "STL" and 1995 <= season <= 2015
    ):
        return "LAR"
    if t in ("OAK", "RAI", "LV"):
        return "LV"
    if t in ("SD", "LAC"):
        return "LAC"
    if t == "BAL" and season <= 1983:
        return "IND"
    if t in ("BLT",) or (t == "BAL" and season >= 1996):
        return "BAL"
    if t == "HOU" and season <= 1996:
        return "TEN"
    if t == "HST" or (t == "HOU" and season >= 2002):
        return "HOU"
    if t == "CLV":
        return "CLE"
    if t in FRANCHISE_NAMES:
        return t
    return None  # defunct pre-merger teams etc.


# --------------------------------------------------------------------------- loaders
@lru_cache(maxsize=None)
def latest_season() -> int:
    return int((C.NFLVERSE / "LATEST_SEASON").read_text())


@lru_cache(maxsize=None)
def raw_players() -> pd.DataFrame:
    pl = pd.read_parquet(C.NFLVERSE / "players" / "players.parquet")
    pl["birth_date"] = pd.to_datetime(pl["birth_date"], errors="coerce").dt.strftime("%Y-%m-%d")
    pl["nk"] = pl["display_name"].map(name_key)
    return pl


@lru_cache(maxsize=None)
def raw_rosters() -> pd.DataFrame:
    files = sorted(glob.glob(str(C.NFLVERSE / "rosters" / "roster_*.parquet")))
    rs = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    rs["birth_date"] = pd.to_datetime(rs["birth_date"], errors="coerce").dt.strftime("%Y-%m-%d")
    return rs


@dataclass
class Data:
    players: pd.DataFrame  # index player_id
    rosters: pd.DataFrame  # player_id, season, franchise, pos, group
    draft: pd.DataFrame  # player_id + draft_picks columns (1980+)
    stats: pd.DataFrame  # player_id, season, stat columns (1999+)
    starts_recent: pd.Series  # player_id -> starts in last RECENCY_SEASONS seasons
    join_report: dict


def _resolve_roster_ids(rs: pd.DataFrame, pl: pd.DataFrame) -> tuple[pd.Series, dict]:
    pid = pd.Series(pd.NA, index=rs.index, dtype="object")
    for col in ("gsis_id", "smart_id", "esb_id"):
        lookup = pl.dropna(subset=[col]).drop_duplicates(col).set_index(col, drop=False)["gsis_id"]
        missing = pid.isna() & rs[col].notna()
        pid[missing] = rs.loc[missing, col].map(lookup)
    report = {"by_id": int(pid.notna().sum())}

    # name + birth date
    rs_nk = rs["full_name"].map(name_key)
    pl_nb = pl.dropna(subset=["birth_date"]).drop_duplicates(["nk", "birth_date"])
    nb_lookup = dict(zip(zip(pl_nb["nk"], pl_nb["birth_date"]), pl_nb["gsis_id"]))
    miss = pid.isna()
    pid[miss] = [nb_lookup.get((k, b)) for k, b in zip(rs_nk[miss], rs.loc[miss, "birth_date"])]
    report["by_name_birthdate"] = int(pid.notna().sum()) - report["by_id"]

    # last name + first initial + birth date (Mike vs Michael, etc.)
    pl_l = pl.dropna(subset=["birth_date"]).copy()
    pl_l["lk"] = pl_l["last_name"].map(name_key) + "|" + pl_l["first_name"].fillna("").str[:1].str.lower()
    pl_l = pl_l.drop_duplicates(["lk", "birth_date"], keep=False)
    l_lookup = dict(zip(zip(pl_l["lk"], pl_l["birth_date"]), pl_l["gsis_id"]))
    rs_lk = rs["last_name"].map(name_key) + "|" + rs["first_name"].fillna("").str[:1].str.lower()
    miss = pid.isna()
    pid[miss] = [l_lookup.get((k, b)) for k, b in zip(rs_lk[miss], rs.loc[miss, "birth_date"])]
    report["by_lastname_birthdate"] = (
        int(pid.notna().sum()) - report["by_id"] - report["by_name_birthdate"]
    )

    # roster rows with a gsis_id that players.parquet lacks (recent practice-squad players)
    miss = pid.isna() & rs["gsis_id"].notna()
    pid[miss] = rs.loc[miss, "gsis_id"]
    report["roster_gsis_not_in_players"] = int(miss.sum())

    # synthetic: same name + birth date => same person; without birth date, same name + franchise
    miss = pid.isna()
    syn = []
    for k, b, fr in zip(rs_nk[miss], rs.loc[miss, "birth_date"], rs.loc[miss, "franchise"]):
        syn.append(f"syn-{k}-{b}" if isinstance(b, str) else f"syn-{k}-{fr or 'x'}")
    pid[miss] = syn
    report["synthetic_rows"] = int(miss.sum())
    return pid, report


def _mode(df: pd.DataFrame, key: str, col: str) -> pd.Series:
    """Most common non-null value of `col` per `key`."""
    counts = df.dropna(subset=[col]).groupby([key, col]).size().reset_index(name="n")
    counts = counts.sort_values(["n", col], ascending=[False, True])
    return counts.drop_duplicates(key).set_index(key)[col]


def _primary_position(rs: pd.DataFrame, pl: pd.DataFrame) -> pd.Series:
    """Most common fine-grained roster label, else players.position, else coarse label."""
    fine = rs[rs["depth_chart_position"].isin(C.POSITION_BUCKET)]
    pos = pd.Series(index=pd.Index(rs["player_id"].unique()), dtype="object")
    pos.update(_mode(rs, "player_id", "position"))
    pos.update(pl.set_index("gsis_id")["position"].reindex(pos.index).dropna())
    pos.update(_mode(fine, "player_id", "depth_chart_position"))
    return pos


def _mark(dp: pd.DataFrame, how: str) -> None:
    """Record which join step linked each draft row (for auditing)."""
    dp.loc[dp["player_id"].notna() & dp["link"].isna(), "link"] = how


def _validate_fallback_links(dp: pd.DataFrame, players: pd.DataFrame, report: dict) -> None:
    """Undo name-based draft links that contradict PFR's own data about the draftee:
    age at the draft (vs birth date), last season played, or 'never played' when the
    linked player has a different name (Judd Garrett is not his brother Jason)."""
    fb = dp["link"].notna() & (dp["link"] != "id")
    pid = dp["player_id"]
    bd = pd.to_datetime(pid.map(players["birth_date"]), errors="coerce")
    age_bd = (pd.to_datetime(dp["season"].astype(str) + "-09-01") - bd).dt.days / 365.25
    bad_age = dp["age"].notna() & age_bd.notna() & ~(age_bd - dp["age"]).between(-0.25, 1.5)
    last = pid.map(players["last_roster_season"])
    bad_last = dp["to"].notna() & last.notna() & ((last - dp["to"]).abs() > 3)
    renamed = pid.map(players["name"]).map(name_key) != dp["pfr_player_name"].map(name_key)
    never_played = dp["games"].fillna(0) <= 0
    bad = fb & (bad_age | bad_last | (renamed & never_played))
    report["draft_fallback_links_rejected"] = int(bad.sum())
    report["draft_fallback_rejected_names"] = sorted(dp.loc[bad, "pfr_player_name"].tolist())
    dp.loc[bad, "player_id"] = None
    dp.loc[bad, "link"] = None


def college_key(c: str | None) -> str:
    """'Jackson St.' == 'Jackson State University', 'Miami (FL)' == 'Miami'."""
    if not isinstance(c, str):
        return ""
    s = re.sub(r"\bcol\.?$", "college", c.lower().strip())  # "Boston Col."
    s = re.sub(r"\buniversity of\b|\buniversity\b|\bcollege\b|,", " ", s)
    s = re.sub(r"\bst\.?(\s|$)", r"state\1", s)
    s = s.replace("(fl)", "").replace("(fla.)", "").replace("(ohio)", "(oh)")
    k = name_key(s)
    return COLLEGE_ALIASES.get(k, k)


# spellings that differ between draft_picks (PFR) and players.parquet
COLLEGE_ALIASES = {
    "sfaustin": "stephenfaustinstate", "stephenfaustin": "stephenfaustinstate",
    "ncstate": "northcarolinastate", "southernmiss": "southernmississippi",
}


def _last_names_compatible(a: str, b: str) -> bool:
    """Same, one a prefix of the other (Ifeanyi / Ifeanyichukwu), or a shared 5+ letter
    ending (Abdul-Jabbar / al-Jabbar)."""
    if not a or not b:
        return False
    return a == b or a.startswith(b) or b.startswith(a) or (len(a) >= 5 and len(b) >= 5 and a[-5:] == b[-5:])


def _split_colleges(s: str | None) -> list[str]:
    if not isinstance(s, str) or not s.strip():
        return []
    return [c.strip() for c in s.split(";") if c.strip()]


@lru_cache(maxsize=None)
def load() -> Data:
    pl = raw_players()
    rs = raw_rosters().copy()
    rs["franchise"] = [franchise(t, s) for t, s in zip(rs["team"], rs["season"])]
    rs["player_id"], join_report = _resolve_roster_ids(rs, pl)

    # ---- players table (nflverse players + synthetic roster-only players)
    players = pl.set_index("gsis_id")[
        [
            "display_name", "first_name", "last_name", "football_name", "common_first_name",
            "birth_date", "college_name", "pfr_id", "draft_year", "draft_round", "draft_pick",
            "rookie_season", "last_season",
        ]
    ].rename(columns={"display_name": "name"})
    players = players[~players.index.duplicated()]
    syn = rs[~rs["player_id"].isin(players.index)].drop_duplicates("player_id").set_index("player_id")
    syn_players = pd.DataFrame(
        {
            "name": syn["full_name"],
            "first_name": syn["first_name"],
            "last_name": syn["last_name"],
            "birth_date": syn["birth_date"],
            "college_name": syn["college"],
        }
    )
    players = pd.concat([players, syn_players])
    players["colleges"] = players["college_name"].map(_split_colleges)

    # roster-derived attributes
    rosters = rs[["player_id", "season", "franchise", "position", "depth_chart_position"]].copy()
    rosters["group"] = rosters["depth_chart_position"].map(C.POSITION_GROUP).fillna(
        rosters["position"].map(C.POSITION_GROUP)
    )
    rosters = rosters.drop_duplicates(["player_id", "season", "franchise", "group"])
    seasons = rosters.groupby("player_id")["season"].agg(["min", "max"])
    in_range = rosters[rosters["season"] >= C.RANGE_START]
    players["first_season"] = seasons["min"]
    players["last_roster_season"] = seasons["max"]
    players["roster_seasons_in_range"] = in_range.groupby("player_id")["season"].nunique()
    players["roster_seasons_in_range"] = players["roster_seasons_in_range"].fillna(0).astype(int)
    players["position"] = _primary_position(rs, pl)
    players["position"] = players["position"].fillna(pl.set_index("gsis_id")["position"].reindex(players.index))
    players["bucket"] = players["position"].map(C.POSITION_BUCKET).fillna("OTHER")

    # ---- draft picks (1980+), joined to player_id
    dp = pd.read_parquet(C.NFLVERSE / "draft_picks" / "draft_picks.parquet")
    by_pfr = pl.dropna(subset=["pfr_id"]).drop_duplicates("pfr_id").set_index("pfr_id")["gsis_id"]
    dp["player_id"] = dp["gsis_id"].where(dp["gsis_id"].isin(players.index))
    miss = dp["player_id"].isna()
    dp.loc[miss, "player_id"] = dp.loc[miss, "pfr_player_id"].map(by_pfr)
    # nflverse occasionally points a draftee's ID at an older namesake (2026's Peter Woods ->
    # a Pete Woods who debuted in 1980): drop ID links to players who debuted before the draft
    debut = dp["player_id"].map(players["first_season"])
    bad_id = debut.notna() & (debut < dp["season"] - 1)
    join_report["draft_id_links_rejected"] = int(bad_id.sum())
    dp.loc[bad_id, "player_id"] = None
    dp["link"] = pd.Series("id", index=dp.index).where(dp["player_id"].notna())
    # name + draft year fallback
    pl_dy = pl.dropna(subset=["draft_year"]).drop_duplicates(["nk", "draft_year"], keep=False)
    pl_dy = pl_dy[~pl_dy["gsis_id"].isin(dp["player_id"].dropna())]  # already linked by ID
    dy_lookup = dict(zip(zip(pl_dy["nk"], pl_dy["draft_year"].astype(int)), pl_dy["gsis_id"]))
    miss = dp["player_id"].isna()
    dp.loc[miss, "player_id"] = [
        dy_lookup.get((name_key(n), int(s))) for n, s in zip(dp.loc[miss, "pfr_player_name"], dp.loc[miss, "season"])
    ]
    _mark(dp, "name+draft_year")
    # last name + first initial + college + first roster season within 4 years. Handles
    # namesakes (two "Henry Thomas" debuting in 1987) and first-name variants (Dan/Danny).
    cand = players.dropna(subset=["first_season"]).copy()
    cand = cand[~cand.index.isin(dp["player_id"].dropna())]
    cand["lk"] = cand["last_name"].map(name_key)
    cand["init"] = cand["name"].map(lambda n: name_key(n)[:1])
    cand["ckeys"] = cand["colleges"].map(lambda cs: {college_key(c) for c in cs or []})
    by_lk = {k: g for k, g in cand.groupby("lk")}
    by_college: dict[str, list] = {}
    for pid, ks in cand["ckeys"].items():
        for k in ks:
            by_college.setdefault(k, []).append(pid)
    miss = dp["player_id"].isna()
    fills = []
    for n, season, col, pos in zip(
        dp.loc[miss, "pfr_player_name"], dp.loc[miss, "season"], dp.loc[miss, "college"], dp.loc[miss, "position"]
    ):
        parts = n.split() if isinstance(n, str) else []
        hit = None
        g = by_lk.get(name_key(parts[-1])) if parts else None
        if g is not None and college_key(col):
            g = g[
                g["first_season"].between(season, season + 4)
                & (g["init"] == name_key(n)[:1])
                & g["ckeys"].map(lambda ks: college_key(col) in ks)
            ]
            exact = g[g["name"].map(name_key) == name_key(n)]
            if len(exact) == 1:
                hit = exact.index[0]
            elif len(exact) == 0 and len(g) == 1:
                hit = g.index[0]
        if hit is None and parts and college_key(col):
            # nicknames / name changes (Scoop -> Fernandars Gillespie, Karim Abdul-Jabbar ->
            # Abdul-Karim al-Jabbar): any first name, compatible last name, but college,
            # position group and debut window must agree and the candidate must be unique
            want = C.POSITION_GROUP.get(pos)
            lk = name_key(parts[-1])
            g = cand.loc[by_college.get(college_key(col), [])]  # same college only
            g = g[
                g["first_season"].between(season, season + 4)
                & g["lk"].map(lambda x: _last_names_compatible(x, lk))
                & (g["position"].map(C.POSITION_GROUP) == want)
            ]
            if len(g) == 1:
                hit = g.index[0]
        fills.append(hit)
    dp.loc[miss, "player_id"] = fills
    _mark(dp, "lastname+college")
    join_report["draft_joined_by_lastname_college"] = int(sum(f is not None for f in fills))

    # name + first roster season within 2 years of the draft (covers synthetic 1980s players)
    cand = players.dropna(subset=["first_season"]).copy()
    cand["nk"] = cand["name"].map(name_key)
    cand = cand[~cand.index.isin(dp["player_id"].dropna())]
    by_nk = {k: g for k, g in cand.groupby("nk")}
    miss = dp["player_id"].isna()
    fills = []
    for n, season, col in zip(dp.loc[miss, "pfr_player_name"], dp.loc[miss, "season"], dp.loc[miss, "college"]):
        g = by_nk.get(name_key(n))
        hit = None
        if g is not None:
            g = g[(g["first_season"] >= season) & (g["first_season"] <= season + 2)]
            ck = college_key(col)
            if ck:  # when both sides list a college it must agree
                g = g[g["colleges"].map(lambda cs: not cs or ck in {college_key(x) for x in cs})]
            if len(g) == 1:
                hit = g.index[0]
        fills.append(hit)
    dp.loc[miss, "player_id"] = fills
    _mark(dp, "name+first_season")
    join_report["draft_joined_by_name_first_season"] = int(sum(f is not None for f in fills))

    _validate_fallback_links(dp, players, join_report)
    miss = dp["player_id"].isna()
    join_report["draft_unjoined"] = int(miss.sum())
    join_report["draft_unjoined_with_games"] = int((miss & (dp["games"].fillna(0) > 0)).sum())
    # never-rostered draftees: keep them as their own players (valid draft answers)
    dp.loc[miss, "player_id"] = "dp-" + dp.loc[miss, "pfr_player_id"].fillna(
        dp.loc[miss, "pfr_player_name"].map(name_key) + "-" + dp.loc[miss, "season"].astype(str)
    )
    new = dp[miss & ~dp["player_id"].isin(players.index)].drop_duplicates("player_id").set_index("player_id")
    players = pd.concat(
        [
            players,
            pd.DataFrame(
                {
                    "name": new["pfr_player_name"],
                    "position": new["position"],
                    "bucket": new["position"].map(C.POSITION_BUCKET).fillna("OTHER"),
                    "colleges": new["college"].map(_split_colleges),
                    "roster_seasons_in_range": 0,
                }
            ),
        ]
    )
    dp = dp.sort_values(["season", "pick"]).drop_duplicates("player_id", keep="first")
    players["drafted_1980plus"] = players.index.isin(dp["player_id"])
    players["draft_colleges"] = dp.set_index("player_id")["college"].reindex(players.index)

    # ---- season stats (1999+)
    files = sorted(glob.glob(str(C.NFLVERSE / "stats_player" / "stats_player_reg_*.parquet")))
    cols = [
        "player_id", "season", "position", "recent_team", "games", "attempts", "passing_yards",
        "passing_tds", "carries", "rushing_yards", "rushing_tds", "receptions", "receiving_yards",
        "receiving_tds", "def_sacks", "def_interceptions", "fg_made",
    ]
    stats = pd.concat([pd.read_parquet(f, columns=cols) for f in files], ignore_index=True)
    stats = stats[stats["player_id"].isin(players.index)]
    num = [c for c in cols if c not in ("player_id", "season", "position", "recent_team")]
    stats[num] = stats[num].fillna(0)

    # ---- recent starts from snap counts
    last = latest_season()
    snaps = pd.concat(
        [
            pd.read_parquet(C.NFLVERSE / "snap_counts" / f"snap_counts_{y}.parquet")
            for y in range(last - C.RECENCY_SEASONS + 1, last + 1)
        ],
        ignore_index=True,
    )
    snaps = snaps[snaps["game_type"] == "REG"]
    started = (snaps["offense_pct"] >= C.START_SNAP_SHARE) | (snaps["defense_pct"] >= C.START_SNAP_SHARE)
    # specialists never reach 50% of offensive/defensive snaps; count games they played
    started |= snaps["position"].isin(["K", "P", "LS"]) & (snaps["st_snaps"] > 0)
    snaps["player_id"] = snaps["pfr_player_id"].map(by_pfr)
    starts_recent = snaps[started].groupby("player_id").size()

    return Data(players, rosters, dp, stats, starts_recent, join_report)
