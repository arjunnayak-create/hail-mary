"""Print a human sanity check of the built data.

  * N random prompts with their tier-1 and tier-5 answers
  * top 25 players overall by fame score
  * top 15 undrafted players by fame score
  * full tier breakdowns for selected prompts

Usage: scripts/.venv/bin/python scripts/sanity.py [--seed N] [--random 5] [--full team-nyg-wr award-sb-mvp]
"""

from __future__ import annotations

import argparse
import json
import random
import textwrap

import pandas as pd

import config as C
import nfl

TIER_NAMES = {t["tier"]: t["name"] for t in C.TIERS}


def wrap(names: list[str], indent: str = "      ") -> str:
    return textwrap.fill(", ".join(names), width=110, initial_indent=indent, subsequent_indent=indent)


def fame_table(fame: pd.DataFrame, rows: pd.DataFrame) -> str:
    cols = ["name", "position", "fame", "honors", "awards", "value", "recency", "pro_bowls", "all_pro", "hof", "award_list"]
    t = rows[cols].copy()
    for c in ("fame", "honors", "awards", "value", "recency"):
        t[c] = t[c].round(1)
    t["pro_bowls"] = t["pro_bowls"].astype(int)
    t["all_pro"] = t["all_pro"].astype(int)
    t.insert(0, "#", range(1, len(t) + 1))
    return t.to_string(index=False)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--random", type=int, default=5)
    ap.add_argument("--full", nargs="*", default=["team-nyg-wr", "award-sb-mvp"])
    ap.add_argument("--sample-from-tier", type=int, default=None,
                    help="in full breakdowns, show only a sample for this tier and below")
    ap.add_argument("--sample-size", type=int, default=10)
    args = ap.parse_args()

    data = json.loads(C.PROMPTS_JSON.read_text())
    prompts = {p["id"]: p for p in data["prompts"]}
    fame = pd.read_csv(C.OUT_DIR / "fame.csv", index_col=0)
    seed = args.seed if args.seed is not None else random.randrange(10_000)

    print(f"{len(prompts)} prompts, data through {data['dataThrough']}\n")
    print(f"=== {args.random} random prompts (seed {seed}) ===")
    for p in random.Random(seed).sample(list(prompts.values()), args.random):
        print(f"\n  {p['text']} ({p['qualifier']}) - {len(p['answers'])} answers, {len(p['outOfRange'])} out of range")
        for tier in (1, 5):
            names = [a["name"] for a in p["answers"] if a["tier"] == tier]
            print(f"    T{tier} {TIER_NAMES[tier]} ({len(names)}):")
            print(wrap(names))

    print("\n=== Top 25 players by fame score ===")
    print(fame_table(fame, fame.head(25)))

    print("\n=== Top 15 undrafted players by fame score ===")
    players = nfl.load().players
    undrafted = players.index[
        ~players["drafted_1980plus"] & players["draft_year"].isna()
        & (players["first_season"] >= C.RANGE_START)  # older careers lack draft info, not a draft
        & (players["roster_seasons_in_range"] > 0)
        & ~players.index.str.startswith(("syn-", "dp-"))
    ]
    print(fame_table(fame, fame[fame.index.isin(undrafted)].head(15)))

    for pid in args.full:
        p = prompts[pid]
        print(f"\n=== Full tier breakdown: {p['text']} ({p['qualifier']}) - {len(p['answers'])} answers ===")
        for tier in TIER_NAMES:
            names = [a["name"] for a in p["answers"] if a["tier"] == tier]
            label = f"  T{tier} {TIER_NAMES[tier]} ({len(names)})"
            if args.sample_from_tier is not None and tier >= args.sample_from_tier and len(names) > args.sample_size:
                names = random.Random(f"{seed}-{pid}-{tier}").sample(names, args.sample_size)
                label += f", random {args.sample_size}"
            print(label + ":")
            print(wrap(names, "    "))
        if p["outOfRange"]:
            print(f"  Out of range ({len(p['outOfRange'])}, 'before our time'):")
            print(wrap([o["name"] for o in p["outOfRange"]], "    "))


if __name__ == "__main__":
    main()
