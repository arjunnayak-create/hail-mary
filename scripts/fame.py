"""Per-player fame score. Weights are in config.py; the formula is documented in README.md.

    fame = honors + awards + max(career_value, production_value) + recency

Position multipliers are applied later, per prompt, only on prompts that mix positions.
"""

from __future__ import annotations

import pandas as pd

import config as C
from awards import AwardData
from nfl import Data


CAREER_COLS = {  # override CSV column -> nflverse season-stat column
    "career_pass_yds": "passing_yards",
    "career_rush_yds": "rushing_yards",
    "career_rec_yds": "receiving_yards",
    "career_sacks": "def_sacks",
    "career_def_ints": "def_interceptions",
    "career_fg_made": "fg_made",
}


def load_overrides() -> pd.DataFrame:
    cols = ["pro_bowls", "first_team_all_pro", "hof", *CAREER_COLS]
    if not C.HONORS_OVERRIDE.exists():
        return pd.DataFrame(columns=["player_id", *cols]).set_index("player_id")
    df = pd.read_csv(C.HONORS_OVERRIDE)
    df = df[df["status"].isin(["ok", "ok_approx_bd", "manual"])]
    for c in cols:
        if c not in df:
            df[c] = None
    return df.set_index("player_id")[cols]


def production_value(data: Data, overrides: pd.DataFrame | None) -> pd.Series:
    """Raw (uncalibrated) production: career totals from 1999+ season stats, or from the
    Wikipedia infobox for override players when larger (pre-1999 careers)."""
    F = C.FAME
    s = data.stats.groupby("player_id")[list(CAREER_COLS.values())].sum()
    if overrides is not None and len(overrides):
        wiki = overrides[list(CAREER_COLS)].rename(columns=CAREER_COLS).apply(pd.to_numeric, errors="coerce")
        wiki = wiki[wiki.index.isin(data.players.index)]
        s = s.reindex(s.index.union(wiki.index)).fillna(0)
        s = s.where(s >= wiki.reindex(s.index).fillna(0), wiki.reindex(s.index))
    s = s.reindex(data.players.index).fillna(0)
    is_qb = data.players["bucket"] == "QB"  # infobox "Interceptions" for QBs means thrown
    prod = (
        s["passing_yards"] * F["per_pass_yards"]
        + (s["rushing_yards"] + s["receiving_yards"]).clip(lower=0) * F["per_scrimmage_yards"]
        + s["def_sacks"] * F["per_sack"]
        + s["def_interceptions"].where(~is_qb, 0) * F["per_def_int"]
        + s["fg_made"] * F["per_fg_made"]
    )
    return prod + data.players["roster_seasons_in_range"] * F["per_roster_season"]


def calibration_factors(data: Data, career_value: pd.Series, production: pd.Series) -> dict[str, float]:
    """Per-bucket median of career_value / production for drafted players whose whole career
    is covered by the 1999+ stats (so both measures see the same career)."""
    p = data.players
    m = (
        p["drafted_1980plus"] & (p["first_season"] >= C.STATS_START)
        & (p["last_roster_season"] < data.stats["season"].max() - 1)  # finished careers
        & (career_value > 10) & (production > 3)
    )
    ratio = (career_value[m] / production[m])
    overall = float(ratio.median())
    by_bucket = ratio.groupby(p.loc[m, "bucket"]).agg(["median", "size"])
    factors = {b: (float(r["median"]) if r["size"] >= C.CALIBRATION_MIN_PLAYERS else overall)
               for b, r in by_bucket.iterrows()}
    factors["_overall"] = overall
    return factors


def compute(data: Data, aw: AwardData, overrides: pd.DataFrame | None = None) -> pd.DataFrame:
    """Return a DataFrame indexed by player_id with every fame component and the total."""
    F = C.FAME
    p = data.players
    out = pd.DataFrame(index=p.index)

    dp = data.draft.set_index("player_id")
    out["pro_bowls"] = dp["probowls"].reindex(p.index).fillna(0)
    out["all_pro"] = dp["allpro"].reindex(p.index).fillna(0)
    out["hof"] = dp["hof"].reindex(p.index).fillna(False).astype(bool)
    out["honors_source"] = pd.Series("draft_picks", index=p.index).where(p["drafted_1980plus"], "none")

    if overrides is not None and len(overrides):
        o = overrides[overrides.index.isin(p.index)]
        out.loc[o.index, "pro_bowls"] = o["pro_bowls"].astype(float)
        out.loc[o.index, "all_pro"] = o["first_team_all_pro"].astype(float)
        out.loc[o.index, "hof"] = out.loc[o.index, "hof"] | o["hof"].astype(bool)
        out.loc[o.index, "honors_source"] = "override"
    out["hof"] = out["hof"] | out.index.isin(aw.hof_ids)

    out["honors"] = (
        out["all_pro"] * F["all_pro"] + out["pro_bowls"] * F["pro_bowl"] + out["hof"] * F["hof"]
    )

    wins = aw.wins[aw.wins["player_id"].isin(p.index)]
    pts = wins["award"].map(C.AWARD_POINTS)
    out["awards"] = pts.groupby(wins["player_id"]).sum().reindex(p.index).fillna(0)
    out["award_list"] = (
        wins.groupby("player_id")["award"].agg(lambda s: ",".join(sorted(s))).reindex(p.index).fillna("")
    )

    out["w_av"] = dp["w_av"].reindex(p.index).fillna(0)
    out["seasons_started"] = dp["seasons_started"].reindex(p.index).fillna(0)
    out["career_value"] = out["w_av"] * F["w_av"] + out["seasons_started"] * F["seasons_started"]
    raw = production_value(data, overrides)
    factors = calibration_factors(data, out["career_value"], raw)
    out["production_value"] = raw * p["bucket"].map(factors).fillna(factors["_overall"])
    out.attrs["calibration"] = factors
    out["value"] = out[["career_value", "production_value"]].max(axis=1)

    starts = data.starts_recent.reindex(p.index).fillna(0)
    out["recent_starts"] = starts
    out["recency"] = C.RECENCY_MAX * (starts / C.RECENCY_FULL_STARTS).clip(upper=1)

    out["fame"] = out["honors"] + out["awards"] + out["value"] + out["recency"]
    out["name"] = p["name"]
    out["position"] = p["position"]
    out["bucket"] = p["bucket"]
    out["multiplier"] = p["bucket"].map(C.POSITION_MULTIPLIER).fillna(1.0)
    return out
