"""The prompt pool. Each prompt is a builder that returns (valid_ids, out_of_range_ids).

  valid         - in-range answers (rosters / draft / awards since RANGE_START; season
                  stats since STATS_START)
  out_of_range  - players who fit the prompt but only before the range ("before our time")

`mixed=True` marks prompts whose answers span positions; only those get the position
fame multiplier (config.POSITION_MULTIPLIER).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import pandas as pd

import config as C
from awards import AwardData
from nfl import FRANCHISE_NAMES, Data, franchise

R = C.RANGE_START


@dataclass
class Ctx:
    data: Data
    fame: pd.DataFrame
    aw: AwardData


@dataclass
class Prompt:
    id: str
    category: str
    text: str
    qualifier: str  # shown under the prompt, e.g. "since 1980"
    mixed: bool
    build: Callable[[Ctx], tuple[set, set]] = field(repr=False)
    franchise: str | None = None  # team prompts: association strength with this franchise
    award_key: str | None = None  # award prompts: add award-specific fame (repeat + recent wins)
    schools: frozenset[str] | None = None  # college prompts: add that school's honors


# --------------------------------------------------------------------------- builders
def team_position(fr: str, group: str):
    def build(ctx: Ctx):
        r = ctx.data.rosters
        m = (r["franchise"] == fr) & (r["group"] == group)
        valid = set(r.loc[m & (r["season"] >= R), "player_id"])
        oor = set(r.loc[m & (r["season"] < R), "player_id"]) - valid
        return valid, oor
    return build


def drafted(cond: Callable[[pd.DataFrame], pd.Series], pre_cond: Callable[[pd.DataFrame], pd.Series] | None = None):
    """cond filters draft_picks rows (1980+). pre_cond filters players.parquet draft columns
    for pre-1980 draftees (out-of-range list; players.parquet only covers ~1974+ careers)."""
    def build(ctx: Ctx):
        dp = ctx.data.draft
        valid = set(dp.loc[cond(dp), "player_id"])
        oor = set()
        if pre_cond is not None:
            p = ctx.data.players
            old = p[p["draft_year"] < R]
            oor = set(old.index[pre_cond(old)]) - valid
        return valid, oor
    return build


def award(key: str, start: int = R):
    def build(ctx: Ctx):
        w = ctx.aw.wins[ctx.aw.wins["award"] == key]
        valid = set(w.loc[w["season"] >= start, "player_id"])
        oor = set(w.loc[w["season"] < start, "player_id"]) - valid
        return valid, oor
    return build


def honors(cond: Callable[[pd.DataFrame], pd.Series]):
    """cond over the fame table (pro_bowls, all_pro, hof, bucket ...). Played since 1980."""
    def build(ctx: Ctx):
        f = ctx.fame
        played = ctx.data.players["roster_seasons_in_range"].reindex(f.index).fillna(0) > 0
        hit = cond(f)
        return set(f.index[hit & played]), set(f.index[hit & ~played & f.index.isin(ctx.data.rosters["player_id"])])
    return build


def hall_of_fame():
    def build(ctx: Ctx):
        p = ctx.data.players
        ids = {i for i in ctx.aw.hof_ids if i in p.index}
        valid = {i for i in ids if p.at[i, "roster_seasons_in_range"] > 0}
        return valid, ids - valid
    return build


def season_stat(cond: Callable[[pd.DataFrame], pd.Series], positions: set[str] | None = None,
                seasons: tuple[int, int] | None = None):
    def qualifying(ctx: Ctx) -> pd.DataFrame:
        s = ctx.data.stats
        m = cond(s)
        if positions is not None:  # position listed that season, or the player's primary one
            row_bucket = s["position"].map(C.POSITION_BUCKET)
            player_bucket = s["player_id"].map(ctx.data.players["bucket"])
            m &= row_bucket.isin(positions) | player_bucket.isin(positions)
        if seasons is not None:
            m &= s["season"].between(*seasons)
        return s.loc[m, ["player_id", "season"]]

    def build(ctx: Ctx):
        return set(qualifying(ctx)["player_id"]), set()

    # qualifying seasons per player (stat-threshold association strength)
    build.counts = lambda ctx: qualifying(ctx).drop_duplicates().groupby("player_id").size()  # type: ignore[attr-defined]
    return build


def college(names: set[str]):
    def build(ctx: Ctx):
        p = ctx.data.players
        hit = p["colleges"].map(lambda cs: bool(names & set(cs or []))) | p["draft_colleges"].isin(names)
        played = p["roster_seasons_in_range"] > 0
        rostered = p["first_season"].notna()
        return set(p.index[hit & played]), set(p.index[hit & ~played & rostered])
    return build


# --------------------------------------------------------------------------- the pool
def _team_prompts() -> list[Prompt]:
    spec = {
        "QB": ["NYG", "DAL", "PHI", "WAS", "CHI", "GB", "SF", "NE", "PIT", "KC", "DEN", "MIA", "BUF", "NYJ", "CLE", "IND"],
        "WR": ["NYG", "DAL", "SF", "PIT", "MIN", "GB", "NE", "LAR", "DET", "CIN"],
        "RB": ["DAL", "CHI", "PIT", "SF", "DET", "NYG", "KC"],
        "TE": ["KC", "NE", "DAL", "LAC"],
        "LB": ["PIT", "CHI", "NYG"],
        "DB": ["SF", "SEA"],
        "DL": ["BUF", "MIN"],
    }
    label = {"QB": "QB", "WR": "WR", "RB": "RB", "TE": "TE", "LB": "linebacker", "DB": "defensive back", "DL": "defensive lineman"}
    out = []
    for group, teams in spec.items():
        for fr in teams:
            out.append(Prompt(
                id=f"team-{fr.lower()}-{group.lower()}", category="team",
                text=f"Name {'an' if FRANCHISE_NAMES[fr][0] in 'AEIOU' else 'a'} {FRANCHISE_NAMES[fr]} {label[group]}",
                qualifier=f"since {R}",
                mixed=False, build=team_position(fr, group), franchise=fr,
            ))
    return out


def _draft_team(fr: str):
    return lambda dp: (dp["round"] == 1) & (
        pd.Series([franchise(t, s) for t, s in zip(dp["team"], dp["season"])], index=dp.index) == fr
    )


DEF_POS = {"DE", "DT", "NT", "DL", "LB", "OLB", "ILB", "MLB", "CB", "S", "SS", "FS", "DB", "SAF"}

PROMPTS: list[Prompt] = _team_prompts() + [
    # ---- draft (draft_picks covers 1980+)
    Prompt("draft-first-overall", "draft", "Name a #1 overall pick", f"since {R}", True,
           drafted(lambda d: d["pick"] == 1, lambda p: p["draft_pick"] == 1)),
    Prompt("draft-qb-round1", "draft", "Name a QB drafted in the 1st round", f"since {R}", False,
           drafted(lambda d: (d["round"] == 1) & (d["position"] == "QB"))),
    Prompt("draft-qb-after-round3", "draft", "Name a QB drafted after round 3", f"since {R}", False,
           drafted(lambda d: (d["round"] > 3) & (d["position"] == "QB"))),
    Prompt("draft-wr-round1", "draft", "Name a WR drafted in the 1st round", f"since {R}", False,
           drafted(lambda d: (d["round"] == 1) & (d["position"] == "WR"))),
    Prompt("draft-rb-top10", "draft", "Name a RB drafted in the top 10", f"since {R}", False,
           drafted(lambda d: (d["pick"] <= 10) & (d["position"].isin(["RB", "FB"])))),
    Prompt("draft-defense-top5", "draft", "Name a defensive player drafted top 5", f"since {R}", True,
           drafted(lambda d: (d["pick"] <= 5) & (d["position"].isin(DEF_POS)))),
    Prompt("draft-late-pro-bowler", "draft", "Name a Pro Bowler drafted in round 5 or later", f"since {R}", True,
           drafted(lambda d: (d["round"] >= 5) & (d["probowls"] > 0))),
    Prompt("draft-nyg-round1", "draft", "Name a Giants 1st-round pick", f"since {R}", True, drafted(_draft_team("NYG"))),
    Prompt("draft-dal-round1", "draft", "Name a Cowboys 1st-round pick", f"since {R}", True, drafted(_draft_team("DAL"))),
    Prompt("draft-ne-round1", "draft", "Name a Patriots 1st-round pick", f"since {R}", True, drafted(_draft_team("NE"))),
    # ---- awards (Wikipedia)
    Prompt("award-sb-mvp", "award", "Name a Super Bowl MVP", f"since the {R} season", True, award("sb_mvp"), award_key="sb_mvp"),
    Prompt("award-mvp", "award", "Name an NFL MVP", f"AP, since {R}", True, award("mvp"), award_key="mvp"),
    Prompt("award-opoy", "award", "Name an Offensive Player of the Year", f"AP, since {R}", True, award("opoy"), award_key="opoy"),
    Prompt("award-dpoy", "award", "Name a Defensive Player of the Year", f"AP, since {R}", True, award("dpoy"), award_key="dpoy"),
    Prompt("award-oroy", "award", "Name an Offensive Rookie of the Year", f"AP, since {R}", True, award("oroy"), award_key="oroy"),
    Prompt("award-droy", "award", "Name a Defensive Rookie of the Year", f"AP, since {R}", True, award("droy"), award_key="droy"),
    Prompt("award-cpoy", "award", "Name a Comeback Player of the Year", "AP, since 1998", True, award("cpoy", 1998), award_key="cpoy"),
    # ---- honors (PFR via nflverse draft_picks + honors_override.csv; HOF from Wikipedia)
    Prompt("honor-hof", "honors", "Name a Hall of Famer", f"played since {R}", True, hall_of_fame()),
    Prompt("honor-qb-3pb", "honors", "Name a QB with 3+ Pro Bowls", f"played since {R}", False,
           honors(lambda f: (f["bucket"] == "QB") & (f["pro_bowls"] >= 3))),
    Prompt("honor-wr-allpro", "honors", "Name a first-team All-Pro WR", f"played since {R}", False,
           honors(lambda f: (f["bucket"] == "WR") & (f["all_pro"] >= 1))),
    Prompt("honor-8pb", "honors", "Name a player with 8+ Pro Bowls", f"played since {R}", True,
           honors(lambda f: f["pro_bowls"] >= 8)),
    Prompt("honor-ol-allpro", "honors", "Name a first-team All-Pro offensive lineman", f"played since {R}", False,
           honors(lambda f: (f["bucket"] == "OL") & (f["all_pro"] >= 1))),
    # ---- single-season stats (nflverse stats start in 1999)
    Prompt("stat-rb-1500", "stats", "Name a RB with a 1,500-yard rushing season", "since 1999", False,
           season_stat(lambda s: s["rushing_yards"] >= 1500, {"RB"})),
    Prompt("stat-rec-1400", "stats", "Name a player with a 1,400-yard receiving season", "since 1999", True,
           season_stat(lambda s: s["receiving_yards"] >= 1400)),
    Prompt("stat-qb-4500", "stats", "Name a QB with a 4,500-yard passing season", "since 1999", False,
           season_stat(lambda s: s["passing_yards"] >= 4500, {"QB"})),
    Prompt("stat-qb-35td", "stats", "Name a QB with 35+ TD passes in a season", "since 1999", False,
           season_stat(lambda s: s["passing_tds"] >= 35, {"QB"})),
    Prompt("stat-15-sacks", "stats", "Name a player with 15+ sacks in a season", "since 1999", True,
           season_stat(lambda s: s["def_sacks"] >= 15)),
    Prompt("stat-7-ints", "stats", "Name a player with 7+ interceptions in a season", "since 1999", True,
           season_stat(lambda s: s["def_interceptions"] >= 7)),
    Prompt("stat-te-1000", "stats", "Name a TE with a 1,000-yard receiving season", "since 1999", False,
           season_stat(lambda s: s["receiving_yards"] >= 1000, {"TE"})),
    Prompt("stat-100-catches", "stats", "Name a player with a 100-catch season", "since 1999", True,
           season_stat(lambda s: s["receptions"] >= 100)),
    Prompt("stat-15-rush-td", "stats", "Name a player with 15+ rushing TDs in a season", "since 1999", True,
           season_stat(lambda s: s["rushing_tds"] >= 15)),
    Prompt("stat-qb-600-rush", "stats", "Name a QB with a 600-yard rushing season", "since 1999", False,
           season_stat(lambda s: s["rushing_yards"] >= 600, {"QB"})),
    Prompt("stat-k-35-fg", "stats", "Name a kicker with 35+ field goals in a season", "since 1999", False,
           season_stat(lambda s: s["fg_made"] >= 35, {"K"})),
    # ---- eras ("starting QB" = 200+ pass attempts in a season)
    Prompt("era-qb-2000s", "era", "Name a starting QB from the 2000s", "200+ attempts in a season, 2000-09", False,
           season_stat(lambda s: s["attempts"] >= 200, {"QB"}, (2000, 2009))),
    Prompt("era-qb-2010s", "era", "Name a starting QB from the 2010s", "200+ attempts in a season, 2010-19", False,
           season_stat(lambda s: s["attempts"] >= 200, {"QB"}, (2010, 2019))),
    Prompt("era-qb-2020s", "era", "Name a starting QB from the 2020s", "200+ attempts in a season, 2020+", False,
           season_stat(lambda s: s["attempts"] >= 200, {"QB"}, (2020, 2029))),
    Prompt("era-1000-rusher-2000s", "era", "Name a 1,000-yard rusher from the 2000s", "2000-09", True,
           season_stat(lambda s: s["rushing_yards"] >= 1000, None, (2000, 2009))),
    # ---- colleges (any school a player attended; played since 1980)
    *[
        Prompt(f"college-{slug}", "college", f"Name an NFL player from {label}", f"played since {R}", True, college(names),
               schools=frozenset(names))
        for slug, label, names in [
            ("alabama", "Alabama", {"Alabama"}),
            ("ohio-state", "Ohio State", {"Ohio State", "Ohio St."}),
            ("usc", "USC", {"USC", "Southern California"}),
            ("lsu", "LSU", {"LSU", "Louisiana State"}),
            ("miami", "Miami (FL)", {"Miami", "Miami (FL)", "Miami (Fla.)"}),
            ("notre-dame", "Notre Dame", {"Notre Dame"}),
            ("florida", "Florida", {"Florida"}),
            ("georgia", "Georgia", {"Georgia"}),
            ("michigan", "Michigan", {"Michigan"}),
            ("texas", "Texas", {"Texas"}),
            ("penn-state", "Penn State", {"Penn State", "Penn St."}),
            ("clemson", "Clemson", {"Clemson"}),
        ]
    ],
]
