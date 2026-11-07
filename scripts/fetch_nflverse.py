"""Download the nflverse release files the pipeline needs into scripts/.cache/nflverse.

Re-runnable: files already on disk are skipped unless --refresh is passed. The
current (possibly in-progress) season is always re-downloaded so weekly stats stay
fresh.

Usage: scripts/.venv/bin/python scripts/fetch_nflverse.py [--refresh]
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

import requests

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
CACHE = Path(__file__).resolve().parent / ".cache" / "nflverse"

FIRST_ROSTER_SEASON = 1920
FIRST_STATS_SEASON = 1999  # stats_player starts here
RECENCY_SEASONS = 3  # snap counts are only used for the recency bump


def exists_remote(path: str) -> bool:
    r = requests.head(f"{BASE}/{path}", allow_redirects=True, timeout=30)
    return r.status_code == 200


def latest_season() -> int:
    year = dt.date.today().year
    for y in range(year, year - 3, -1):
        if exists_remote(f"rosters/roster_{y}.parquet"):
            return y
    raise RuntimeError("Could not find a recent roster file on nflverse")


def download(path: str, force: bool) -> Path:
    dest = CACHE / path
    if dest.exists() and not force:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(f"{BASE}/{path}", timeout=120)
    r.raise_for_status()
    tmp = dest.with_suffix(".part")
    tmp.write_bytes(r.content)
    tmp.replace(dest)
    print(f"  downloaded {path} ({len(r.content) // 1024} KB)")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-download everything")
    args = ap.parse_args()

    last = latest_season()
    print(f"Latest nflverse season: {last}")

    files: list[tuple[str, bool]] = [
        ("players/players.parquet", True),
        ("draft_picks/draft_picks.parquet", True),
    ]
    files += [(f"rosters/roster_{y}.parquet", y == last) for y in range(FIRST_ROSTER_SEASON, last + 1)]
    files += [
        (f"stats_player/stats_player_reg_{y}.parquet", y == last)
        for y in range(FIRST_STATS_SEASON, last + 1)
    ]
    files += [
        (f"snap_counts/snap_counts_{y}.parquet", y == last)
        for y in range(last - RECENCY_SEASONS + 1, last + 1)
    ]

    for path, always in files:
        try:
            download(path, force=args.refresh or always)
        except requests.HTTPError as e:
            print(f"  FAILED {path}: {e}", file=sys.stderr)
            raise

    (CACHE / "LATEST_SEASON").write_text(str(last))
    print(f"nflverse cache ready: {CACHE}")


if __name__ == "__main__":
    main()
