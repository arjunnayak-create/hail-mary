"""Run the whole data pipeline.

    scripts/.venv/bin/python scripts/build_all.py              # nflverse refresh + build
    scripts/.venv/bin/python scripts/build_all.py --wikipedia  # also re-pull awards + honors

Wikipedia-derived CSVs in scripts/data/ are committed, so a normal build does not touch
Wikipedia. Pass --wikipedia to regenerate them (pages are cached in scripts/.cache).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(script: str, *args: str) -> None:
    print(f"\n>>> {script} {' '.join(args)}", flush=True)
    subprocess.run([sys.executable, str(HERE / script), *args], check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wikipedia", action="store_true", help="re-pull award, honors, college and pageview CSVs")
    ap.add_argument("--refresh", action="store_true", help="ignore caches (nflverse + Wikipedia)")
    args = ap.parse_args()
    extra = ["--refresh"] if args.refresh else []
    run("fetch_nflverse.py", *extra)
    if args.wikipedia:
        run("fetch_awards.py", *extra)
        run("fetch_honors_override.py", *extra)
        run("fetch_college_honors.py", *extra)
        run("fetch_pageviews.py", *extra)
    run("build_prompts.py")


if __name__ == "__main__":
    main()
