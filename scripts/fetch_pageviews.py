"""Wikipedia pageviews per player -> scripts/data/pageviews.csv (a fame signal: how often
people look the player up, which tracks how likely a fan is to name him).

  1. Map nflverse PFR ids to English Wikipedia articles via Wikidata (P3561 = Pro Football
     Reference player ID), so namesakes never get each other's views.
  2. For every in-range player with an article, fetch monthly user pageviews from the
     Wikimedia REST API since July 2015 (the start of its data).
  3. Add views of same-name disambiguated redirects ("Victor Cruz (American football)"):
     when an article is renamed, its history stays under the old title, which becomes a
     redirect, and the pageviews API doesn't follow redirects.
  4. Write views over the last PAGEVIEWS_RECENT_MONTHS complete months, and the total.

Re-runnable: the Wikidata map and each article's series are cached in scripts/.cache.
Usage: scripts/.venv/bin/python scripts/fetch_pageviews.py [--refresh]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd
import requests

import config as C
import nfl
from wiki import USER_AGENT

CACHE = C.CACHE / "pageviews"
SPARQL = "https://query.wikidata.org/sparql"
REST = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user"
QUERY = """SELECT ?pfr ?title WHERE {
  ?item wdt:P3561 ?pfr .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
}"""


def pfr_titles(refresh: bool) -> dict[str, str]:
    path = CACHE / "wikidata_pfr_titles.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    r = requests.post(SPARQL, data={"query": QUERY}, headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"}, timeout=180)
    r.raise_for_status()
    out = {}
    for b in r.json()["results"]["bindings"]:
        out[b["pfr"]["value"].split("/")[-1]] = b["title"]["value"]  # "B/BradTo00" -> "BradTo00"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    return out


def month_range() -> tuple[str, str, str]:
    today = dt.date.today()
    last = today.replace(day=1) - dt.timedelta(days=1)  # last complete month
    recent_start = (last.replace(day=1) - pd.DateOffset(months=C.PAGEVIEWS_RECENT_MONTHS - 1)).date()
    return "2015070100", last.strftime("%Y%m%d00"), recent_start.strftime("%Y%m0100")


_lock = threading.Lock()
_next_at = [0.0]


def _throttle() -> None:
    """Global rate limit across worker threads (Wikimedia 429s bursty clients)."""
    with _lock:
        now = time.monotonic()
        wait = _next_at[0] - now
        _next_at[0] = max(now, _next_at[0]) + 1.0 / C.PAGEVIEWS_RATE
    if wait > 0:
        time.sleep(wait)


def fetch_series(session: requests.Session, title: str, start: str, end: str, refresh: bool) -> list[dict]:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", title)[:150]
    path = CACHE / "series" / f"{safe}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    url = f"{REST}/{urllib.parse.quote(title.replace(' ', '_'), safe='')}/monthly/{start}/{end}"
    for attempt in range(6):
        _throttle()
        r = session.get(url, timeout=30)
        if r.status_code == 404:  # no views recorded
            items: list[dict] = []
            break
        if r.status_code in (403, 429) or r.status_code >= 500:
            time.sleep(15 * (attempt + 1))  # back off hard; the limiter keeps the steady rate
            continue
        r.raise_for_status()
        items = [{"t": i["timestamp"][:6], "v": i["views"]} for i in r.json().get("items", [])]
        break
    else:
        # never record a failure as "zero views"
        raise RuntimeError(f"pageviews failed for {title!r}: HTTP {r.status_code}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items))
    return items


def old_titles(titles: list[str], refresh: bool) -> dict[str, list[str]]:
    """Same-name redirects with a parenthetical ("X (American football)") per article; these
    are usually the article's previous titles."""
    path = CACHE / "redirects.json"
    cache: dict[str, list[str]] = {} if refresh or not path.exists() else json.loads(path.read_text())
    todo = [t for t in titles if t not in cache]
    import wiki
    for i in range(0, len(todo), 50):
        chunk = todo[i : i + 50]
        d = wiki._get({"action": "query", "prop": "redirects", "titles": "|".join(chunk), "rdlimit": "max", "rdnamespace": 0, "redirects": 1})
        q = d.get("query", {})
        back = {n["to"]: n["from"] for n in q.get("normalized", []) + q.get("redirects", [])}
        for pg in q.get("pages", []):
            title = back.get(pg["title"], pg["title"])
            base = re.sub(r"\s*\(.*\)$", "", pg["title"])
            cache[title] = [
                r["title"] for r in pg.get("redirects", [])
                if "(" in r["title"] and re.sub(r"\s*\(.*\)$", "", r["title"]) == base
            ]
        for t in chunk:
            cache.setdefault(t, [])
        if (i // 50) % 20 == 0:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(cache))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache))
    return cache


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    titles = pfr_titles(args.refresh)
    data = nfl.load()
    p = data.players
    # in-range players + never-rostered draftees (their id carries the PFR id)
    # every player who appears in a prompt (answers + out-of-range); validity doesn't depend
    # on fame, so this set is stable across rebuilds
    in_prompts = {a["id"] for q in json.loads(C.PROMPTS_JSON.read_text())["prompts"] for a in q["answers"] + q["outOfRange"]}
    pool = p[p.index.isin(in_prompts)].copy()
    pool["pfr"] = pool["pfr_id"]
    dp_pfr = pool.index.to_series().str.extract(r"^dp-([A-Za-z]{4}[A-Za-z]{2}\d{2})$")[0]
    pool["pfr"] = pool["pfr"].fillna(dp_pfr)
    pool["title"] = pool["pfr"].map(titles)
    todo = pool.dropna(subset=["title"])
    print(f"{len(titles)} PFR->Wikipedia links; {len(todo)} of {len(pool)} prompt players have an article", flush=True)

    start, end, recent_start = month_range()
    redirects = old_titles(todo["title"].tolist(), args.refresh)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    jobs = [(pid, pfr, t, t) for pid, pfr, t in zip(todo.index, todo["pfr"], todo["title"])]
    jobs += [(pid, pfr, t, old) for pid, pfr, t in zip(todo.index, todo["pfr"], todo["title"]) for old in redirects.get(t, [])]
    print(f"{len(jobs)} series ({len(jobs) - len(todo)} from old titles / redirects)", flush=True)
    acc: dict[str, dict] = {}
    failed = []
    with ThreadPoolExecutor(max_workers=C.PAGEVIEWS_WORKERS) as ex:
        futs = {ex.submit(fetch_series, session, src, start, end, args.refresh): (pid, pfr, t, src) for pid, pfr, t, src in jobs}
        for i, f in enumerate(as_completed(futs), 1):
            pid, pfr, t, src = futs[f]
            try:
                items = f.result()
            except RuntimeError as e:
                failed.append(str(e))
                continue
            a = acc.setdefault(pid, {"player_id": pid, "pfr_id": pfr, "title": t, "views_recent": 0, "views_total": 0, "titles": 0})
            a["views_recent"] += sum(x["v"] for x in items if x["t"] >= recent_start[:6])
            a["views_total"] += sum(x["v"] for x in items)
            a["titles"] += 1
            if i % 1000 == 0:
                print(f"  {i}/{len(futs)}", flush=True)
    if failed:
        raise SystemExit(f"{len(failed)} series failed (rerun to retry; cached ones are skipped):\n" + "\n".join(failed[:10]))
    rows = list(acc.values())
    out = pd.DataFrame(rows).sort_values("views_total", ascending=False)
    out.to_csv(C.PAGEVIEWS, index=False)
    print(f"wrote {C.PAGEVIEWS.relative_to(C.ROOT)}: {len(out)} players "
          f"(recent = {recent_start[:6]}..{end[:6]}, total since 2015-07)")
    print(out.head(10)[["title", "views_recent", "views_total"]].to_string(index=False))


if __name__ == "__main__":
    main()
