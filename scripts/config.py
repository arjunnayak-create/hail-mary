"""Every tunable number in the data pipeline lives here.

Tier names / points / shares / caps live in src/themes/nfl/tiers.json (shared with the
app) and are loaded below. See scripts/README.md for how these weights combine.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
CACHE = SCRIPTS / ".cache"
NFLVERSE = CACHE / "nflverse"
DATA = SCRIPTS / "data"
AWARDS_DIR = DATA / "awards"
HONORS_OVERRIDE = DATA / "honors_override.csv"
ALIASES = DATA / "aliases.csv"
BLURBS = DATA / "blurbs.csv"  # optional per-answer fun facts
FIRST_NAME_VARIANTS = DATA / "first_name_variants.csv"
OUT_DIR = SCRIPTS / "out"  # debug artifacts + reports (gitignored)
PROMPTS_JSON = ROOT / "public" / "data" / "prompts.json"
NAMES_JSON = ROOT / "public" / "data" / "names.json"

# --------------------------------------------------------------------------- tiers
TIERS = json.loads((ROOT / "src" / "themes" / "nfl" / "tiers.json").read_text())["tiers"]
HEAD_TIERS = [t for t in TIERS if "share" in t]  # top tiers: share of the list, capped
TAIL_TIERS = [t for t in TIERS if "restShare" in t]  # the rest, split by restShare
assert HEAD_TIERS + TAIL_TIERS == TIERS, "head tiers (share) must come before tail tiers (restShare)"
assert abs(sum(t["restShare"] for t in TAIL_TIERS) - 1.0) < 1e-9, "restShare must sum to 1"

# --------------------------------------------------------------------------- range
RANGE_START = 1980  # "since 1980": earlier players go to a prompt's out-of-range list
STATS_START = 1999  # first season of nflverse season stats
MIN_ANSWERS = 15  # prompts with fewer valid answers are cut

# --------------------------------------------------------------------------- fame
# fame = honors + awards + max(career_value, production_value) + recency
# then, on prompts that mix positions only: fame *= POSITION_MULTIPLIER[bucket]
FAME = {
    # honors (PFR career totals via nflverse draft_picks, or honors_override.csv)
    "all_pro": 8.0,  # per first-team All-Pro selection
    "pro_bowl": 4.0,  # per Pro Bowl
    "hof": 30.0,  # Pro Football Hall of Fame
    # career value (draft_picks only; PFR weighted approximate value + seasons as starter)
    "w_av": 0.30,
    "seasons_started": 1.5,
    # production fallback for players without draft_picks value (undrafted, pre-1980 draftees,
    # players whose wAV is missing). Career totals from 1999+ season stats + roster longevity.
    "per_pass_yards": 1 / 2500,
    "per_scrimmage_yards": 1 / 600,
    "per_sack": 1 / 5,
    "per_def_int": 1 / 2,
    "per_fg_made": 1 / 25,
    "per_roster_season": 0.75,  # seasons on an NFL roster since RANGE_START
}
# The production fallback is then rescaled per position bucket so that, for drafted players
# whose whole career is in the 1999+ stats era, its median equals their career value
# (factors are computed each build and printed in scripts/out/report.md). Buckets with fewer
# than this many calibration players use the overall median.
CALIBRATION_MIN_PLAYERS = 20

# Major awards (from Wikipedia CSVs in scripts/data/awards/), points per win.
AWARD_POINTS = {
    "mvp": 12.0,
    "sb_mvp": 8.0,
    "opoy": 8.0,
    "dpoy": 8.0,
    "oroy": 4.0,
    "droy": 4.0,
    "cpoy": 3.0,
}

# Award prompts ("Name a Super Bowl MVP") rank by award-specific fame:
#   score = fame * position multiplier
#         + AWARD_EXTRA_WIN * (wins of this award - 1)               Brady's 5 SB MVPs, Mahomes' 3
#         + AWARD_RECENT_BONUS * (N - age) / N   for age < N          last year's winner is memorable
# where age = seasons between the player's latest win and the award's latest season in the
# data (0 = most recent winner) and N = AWARD_RECENT_SEASONS.
AWARD_EXTRA_WIN = 60.0
AWARD_RECENT_SEASONS = 3
AWARD_RECENT_BONUS = 150.0
# Per-award scale on the recency bonus: rookies have little career fame, so a full bonus
# would put last year's ROY above established stars.
AWARD_RECENT_SCALE = {"oroy": 0.25, "droy": 0.25}

# Recency: small bump for current starters, capped so a recent backup never outranks
# a decorated veteran. bump = RECENCY_MAX * min(1, starts_in_last_N / RECENCY_FULL_STARTS)
RECENCY_MAX = 4.0
RECENCY_SEASONS = 3  # the last N seasons in the data (including the in-progress one)
RECENCY_FULL_STARTS = 34  # starts needed for the full bump (two full seasons)
START_SNAP_SHARE = 0.5  # a game counts as a "start" at >= 50% of offensive or defensive snaps

# Team prompts ("Name a Giants WR"): a star who spent one late-career season with the team is
# a deep cut *for that team*. score = fame * min(1, seasons_with_franchise / FULL) ** EXPONENT
TEAM_FULL_TENURE_SEASONS = 4
TEAM_TENURE_EXPONENT = 2.0

# Applied only on prompts whose answers span positions (no position filter).
POSITION_MULTIPLIER = {
    "QB": 1.4,
    "RB": 1.1,
    "WR": 1.1,
    "TE": 1.1,
    "EDGE": 1.0,
    "LB": 1.0,
    "CB": 1.0,
    "S": 1.0,
    "DB": 1.0,
    "DT": 0.9,
    "DL": 0.95,  # generic DL label (old rosters) where DE vs DT is unknown
    "OL": 0.6,
    "K": 0.5,
    "P": 0.5,
    "LS": 0.5,
    "OTHER": 1.0,
}

# Raw nflverse position label -> multiplier bucket.
POSITION_BUCKET = {
    "QB": "QB",
    "RB": "RB", "HB": "RB", "FB": "RB",
    "WR": "WR",
    "TE": "TE",
    "DE": "EDGE", "OLB": "EDGE", "EDGE": "EDGE",
    "LB": "LB", "ILB": "LB", "MLB": "LB",
    "CB": "CB",
    "S": "S", "SS": "S", "FS": "S", "SAF": "S",
    "DB": "DB",
    "DT": "DT", "NT": "DT",
    "DL": "DL",
    "OL": "OL", "T": "OL", "OT": "OL", "G": "OL", "OG": "OL", "C": "OL",
    "K": "K", "P": "P", "LS": "LS",
}

# Roster position label -> prompt position group ("Name a Giants LB" etc.).
POSITION_GROUP = {
    "QB": "QB",
    "RB": "RB", "HB": "RB", "FB": "RB",
    "WR": "WR",
    "TE": "TE",
    "DE": "DL", "DT": "DL", "NT": "DL", "DL": "DL",
    "LB": "LB", "OLB": "LB", "ILB": "LB", "MLB": "LB",
    "CB": "DB", "S": "DB", "SS": "DB", "FS": "DB", "SAF": "DB", "DB": "DB",
    "OL": "OL", "T": "OL", "OT": "OL", "G": "OL", "OG": "OL", "C": "OL",
    "K": "K", "P": "P", "LS": "LS",
}

# --------------------------------------------------------------------------- honors override
# scripts/fetch_honors_override.py fills Pro Bowl / All-Pro / HOF from Wikipedia infoboxes for
# in-range players with no draft_picks row (undrafted, or careers that began before 1980).
# Candidates = those whose name matches a member of these Wikipedia categories, or who are
# Hall of Famers / award winners.
OVERRIDE_CATEGORIES = [
    "Category:American Conference Pro Bowl players",
    "Category:National Conference Pro Bowl players",
    "Category:Unconferenced Pro Bowl players",
]
