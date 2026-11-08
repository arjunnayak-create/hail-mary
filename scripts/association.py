"""Association strength: how strongly a player is tied to a prompt (multiplies prompt fame).

Team prompts:  share of the player's career quality spent with that franchise, times a
    volume factor so a short stint (even a whole short career) is a weak tie.
    quality(season) = base + production * season_units + award * awards_that_season
    (split evenly across franchises in a traded season; seasons before the 1999 stats era
    use the player's average known season, or `base` if none)
    association = share ** exponent * min(1, quality_with_team / full_quality) ** volume_exponent

Stat-threshold prompts:  min(1, qualifying_seasons / full) ** exponent
    (repeat qualifiers are gimmes, one-timers are deep pulls)

Weights: config.ASSOC_TEAM / config.ASSOC_STAT.
"""

from __future__ import annotations

import pandas as pd

import config as C
from awards import AwardData
from nfl import Data


def season_units(data: Data) -> pd.Series:
    """Production units per (player_id, season), same per-stat weights as career fame."""
    F = C.FAME
    s = data.stats
    units = (
        s["passing_yards"] * F["per_pass_yards"]
        + (s["rushing_yards"] + s["receiving_yards"]).clip(lower=0) * F["per_scrimmage_yards"]
        + s["def_sacks"] * F["per_sack"]
        + s["def_interceptions"] * F["per_def_int"]
        + s["fg_made"] * F["per_fg_made"]
    )
    return units.groupby([s["player_id"], s["season"]]).sum()


_CACHE: dict[tuple[int, int], pd.DataFrame] = {}


def _team_quality(data: Data, aw: AwardData) -> pd.DataFrame:
    key = (id(data), id(aw))
    if key in _CACHE:
        return _CACHE[key]
    A = C.ASSOC_TEAM
    r = data.rosters.dropna(subset=["franchise"])[["player_id", "season", "franchise"]].drop_duplicates()
    units = season_units(data).rename("units")
    r = r.join(units, on=["player_id", "season"])
    # seasons without stats (pre-1999, or none recorded): the player's average known season
    avg = units.groupby(level="player_id").mean()
    pre = r["units"].isna() & (r["season"] < C.STATS_START)
    r.loc[pre, "units"] = r.loc[pre, "player_id"].map(avg)
    r["units"] = r["units"].fillna(0)
    wins = aw.wins.groupby(["player_id", "season"]).size().rename("awards")
    r = r.join(wins, on=["player_id", "season"])
    r["awards"] = r["awards"].fillna(0)
    teams_that_season = r.groupby(["player_id", "season"])["franchise"].transform("nunique")
    r["q"] = (A["base"] + A["production"] * r["units"] + A["award"] * r["awards"]) / teams_that_season
    _CACHE[key] = r
    return r


def team_components(data: Data, aw: AwardData, franchise: str) -> pd.DataFrame:
    r = _team_quality(data, aw)
    total = r.groupby("player_id")["q"].sum()
    with_team = r[r["franchise"] == franchise].groupby("player_id")["q"].sum()
    out = pd.DataFrame({"with_team": with_team, "total": total.reindex(with_team.index)})
    out["share"] = (out["with_team"] / out["total"]).clip(0, 1)
    # volume: a short stint (even a whole short career) is a weak tie to a franchise
    out["volume"] = (out["with_team"] / C.ASSOC_TEAM["full_quality"]).clip(upper=1) ** C.ASSOC_TEAM["volume_exponent"]
    out["association"] = out["share"] ** C.ASSOC_TEAM["exponent"] * out["volume"]
    return out


def team_association(data: Data, aw: AwardData, franchise: str) -> pd.Series:
    return team_components(data, aw, franchise)["association"]


def stat_association(qualifying_seasons: pd.Series) -> pd.Series:
    A = C.ASSOC_STAT
    return (qualifying_seasons / A["full_seasons"]).clip(upper=1) ** A["exponent"]
