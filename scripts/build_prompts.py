"""Build public/data/prompts.json (+ names.json) from cached nflverse data and the committed
Wikipedia CSVs. Writes debug artifacts and a report to scripts/out/.

Usage: scripts/.venv/bin/python scripts/build_prompts.py
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import math
import re
from collections import defaultdict

import pandas as pd

import awards
import config as C
import fame
import nfl
from nfl import name_key
from prompts_def import PROMPTS, Ctx

SUFFIX_RE = re.compile(r"\s+(Jr\.?|Sr\.?|II|III|IV|V)$", re.I)


# --------------------------------------------------------------------------- aliases
def _first_name_variants() -> dict[str, set[str]]:
    groups: dict[str, set[str]] = defaultdict(set)
    with open(C.FIRST_NAME_VARIANTS) as f:
        for r in csv.DictReader(f):
            names = {r["canonical"], *r["variants"].split(";")}
            for n in names:
                groups[n.lower()] |= names
    return groups


def build_aliases(data: nfl.Data, fame_df: pd.DataFrame) -> tuple[dict[str, list[str]], list[str]]:
    """player_id -> alias strings (not including the display name). Returns (aliases, problems)."""
    p = data.players
    variants = _first_name_variants()
    out: dict[str, list[str]] = {}
    for pid, r in p.iterrows():
        name = r["name"]
        if not isinstance(name, str):
            continue
        last = r["last_name"] if isinstance(r["last_name"], str) else None
        cands = []
        if last:
            for col in ("first_name", "football_name", "common_first_name"):
                first = r.get(col)
                if isinstance(first, str) and first.strip():
                    cands.append(f"{first} {last}")
        # first-name variants on the display name ("Pat Mahomes", "Mike Vick")
        parts = SUFFIX_RE.sub("", name).split(" ", 1)
        if len(parts) == 2:
            for v in variants.get(parts[0].lower(), ()):
                cands.append(f"{v} {parts[1]}")
        seen = {name_key(name)}
        keep = []
        for c in cands:
            k = name_key(c)
            if k and k not in seen:
                seen.add(k)
                keep.append(c)
        if keep:
            out[pid] = keep

    problems = []
    by_name = defaultdict(list)
    for pid, n in p["name"].items():
        by_name[name_key(n)].append(pid)
    with open(C.ALIASES) as f:
        for r in csv.DictReader(f):
            ids = by_name.get(name_key(r["name"]), [])
            if r["position"] and len(ids) > 1:
                want = C.POSITION_BUCKET.get(r["position"], r["position"])
                ids = [i for i in ids if p.at[i, "bucket"] == want] or ids
            if not ids:
                problems.append(f"alias {r['alias']!r}: no player named {r['name']!r}")
                continue
            pid = max(ids, key=lambda i: fame_df.at[i, "fame"])  # most famous namesake
            if len(ids) > 1:
                problems.append(
                    f"alias {r['alias']!r}: {len(ids)} players named {r['name']!r}, used most famous ({pid})"
                )
            lst = out.setdefault(pid, [])
            if name_key(r["alias"]) not in {name_key(x) for x in lst} | {name_key(p.at[pid, "name"])}:
                lst.append(r["alias"])
    return out, problems


def load_blurbs() -> dict[tuple[str, str], str]:
    """(prompt_id or "", player_id) -> blurb from scripts/data/blurbs.csv (optional fun facts
    shown on the reveal card). An empty prompt_id applies to every prompt."""
    out = {}
    if C.BLURBS.exists():
        with open(C.BLURBS) as f:
            for r in csv.DictReader(f):
                if r.get("blurb", "").strip():
                    out[(r.get("prompt_id", "").strip(), r["player_id"].strip())] = r["blurb"].strip()
    return out


def last_name_of(r: pd.Series) -> str:
    if isinstance(r.get("last_name"), str) and r["last_name"].strip():
        return r["last_name"].strip()
    return SUFFIX_RE.sub("", str(r["name"])).split()[-1]


def award_bonus(aw: awards.AwardData, key: str) -> pd.Series:
    """Award-specific fame for an award prompt: extra wins + a decaying bonus for recent wins."""
    w = aw.wins[aw.wins["award"] == key]
    g = w.groupby("player_id")["season"].agg(["size", "max"])
    extra = (g["size"] - 1) * C.AWARD_EXTRA_WIN
    age = w["season"].max() - g["max"]
    n = C.AWARD_RECENT_SEASONS
    bonus = C.AWARD_RECENT_BONUS * C.AWARD_RECENT_SCALE.get(key, 1.0)
    recent = (bonus * (n - age) / n).where(age < n, 0.0)
    return extra + recent


def tenure_weight(data: nfl.Data, fr: str) -> pd.Series:
    r = data.rosters
    seasons = r[r["franchise"] == fr].groupby("player_id")["season"].nunique()
    return (seasons / C.TEAM_FULL_TENURE_SEASONS).clip(upper=1) ** C.TEAM_TENURE_EXPONENT


# --------------------------------------------------------------------------- tiers
def tier_counts(n: int) -> list[int]:
    """Answers per tier for a list of n (see src/themes/nfl/tiers.json). Head tiers take a share of
    the whole list (cumulative, rounded up) capped at maxAnswers; tail tiers split the rest."""
    eps = 1e-9
    counts, cum, prev = [], 0.0, 0
    for t in C.HEAD_TIERS:
        cum += t["share"]
        upto = math.ceil(cum * n - eps)
        counts.append(min(t["maxAnswers"], upto - prev))
        prev = upto
    rest = n - sum(counts)
    cum, prev = 0.0, 0
    for t in C.TAIL_TIERS:
        cum += t["restShare"]
        upto = math.ceil(cum * rest - eps)
        counts.append(upto - prev)
        prev = upto
    return counts


def assign_tiers(n: int) -> list[int]:
    """Tier for each rank 0..n-1 (most famous first)."""
    out = []
    for t, c in zip(C.TIERS, tier_counts(n)):
        out += [t["tier"]] * c
    return out


# --------------------------------------------------------------------------- main
def main() -> dict:
    data = nfl.load()
    aw = awards.load(data)
    overrides = fame.load_overrides()
    fame_df = fame.compute(data, aw, overrides)
    calibration = dict(fame_df.attrs["calibration"])
    aliases, alias_problems = build_aliases(data, fame_df)
    players = data.players
    wiki_names = dict(zip(aw.wins["player_id"], aw.wins["name"]))  # pre-1980 award winners

    blurbs = load_blurbs()

    # Generic answer schema (shared by every theme): id, name, aliases, shortName (accepted
    # alone when unambiguous; here the last name), optional blurb.
    def record(pid: str, prompt_id: str | None = None) -> dict:
        if pid in players.index:
            r = players.loc[pid]
            out = {"id": pid, "name": r["name"], "aliases": aliases.get(pid, []), "shortName": last_name_of(r)}
        else:
            name = wiki_names[pid]
            out = {"id": pid, "name": name, "aliases": [], "shortName": SUFFIX_RE.sub("", name).split()[-1]}
        blurb = blurbs.get((prompt_id, pid)) or blurbs.get(("", pid))
        if blurb:
            out["blurb"] = blurb
        return out

    ctx = Ctx(data, fame_df, aw)
    kept, summary = [], []
    for pr in PROMPTS:
        valid, oor = pr.build(ctx)
        valid = {v for v in valid if v in fame_df.index and isinstance(players.at[v, "name"], str)}
        oor = {o for o in oor if (o in players.index and isinstance(players.at[o, "name"], str)) or o in wiki_names}
        f = fame_df.loc[list(valid)]
        score = f["fame"] * (f["multiplier"] if pr.mixed else 1.0)
        if pr.award_key:
            score = score + award_bonus(aw, pr.award_key).reindex(score.index).fillna(0)
        if pr.franchise:
            score = score * tenure_weight(data, pr.franchise).reindex(score.index).fillna(0)
        order = sorted(valid, key=lambda v: (-score[v], players.at[v, "name"]))
        tiers = assign_tiers(len(order))
        counts = {t["tier"]: tiers.count(t["tier"]) for t in C.TIERS}
        status = "kept"
        if len(order) < C.MIN_ANSWERS:
            status = f"cut: {len(order)} answers < {C.MIN_ANSWERS}"
        elif min(counts.values()) == 0:
            status = "cut: empty tier"
        elif score[order[0]] <= score[order[-1]]:
            status = "cut: no fame spread"
        summary.append({"id": pr.id, "text": pr.text, "answers": len(order), "out_of_range": len(oor),
                        "tiers": counts, "status": status})
        if status != "kept":
            continue
        answers = [{**record(pid, pr.id), "tier": t} for pid, t in zip(order, tiers)]
        kept.append({
            "id": pr.id, "category": pr.category, "text": pr.text, "qualifier": pr.qualifier,
            "answers": answers,
            "outOfRange": sorted((record(o) for o in oor), key=lambda r: r["name"]),
        })
        # debug: fame + tier per answer
        (C.OUT_DIR / "prompts").mkdir(parents=True, exist_ok=True)
        pd.DataFrame({
            "name": [players.at[v, "name"] for v in order], "tier": tiers,
            "score": [round(score[v], 2) for v in order], "fame": [round(f.at[v, "fame"], 2) for v in order],
            "position": [players.at[v, "position"] for v in order], "player_id": order,
        }).to_csv(C.OUT_DIR / "prompts" / f"{pr.id}.csv", index=False)

    out = {
        "version": 2,
        "generatedAt": dt.date.today().isoformat(),
        "meta": {"dataThrough": nfl.latest_season(), "rangeStart": C.RANGE_START},
        "prompts": kept,
    }
    C.PROMPTS_JSON.parent.mkdir(parents=True, exist_ok=True)
    C.PROMPTS_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))

    # every known player name, so the matcher can refuse a typo that is closer to someone else
    known = players[(players["first_season"].notna()) | players.index.str.startswith("dp-")]["name"]
    names = sorted({n for n in known if isinstance(n, str)} | set(wiki_names.values()))
    C.NAMES_JSON.write_text(json.dumps({"names": names}, ensure_ascii=False, separators=(",", ":")))

    fame_df.sort_values("fame", ascending=False).to_csv(C.OUT_DIR / "fame.csv")
    report = write_report(data, aw, calibration, summary, alias_problems)
    return report


def write_report(data, aw, calibration, summary, alias_problems) -> dict:
    C.OUT_DIR.mkdir(parents=True, exist_ok=True)
    kept = [s for s in summary if s["status"] == "kept"]
    cut = [s for s in summary if s["status"] != "kept"]
    unmatched = pd.DataFrame(aw.unmatched)
    ov = pd.read_csv(C.HONORS_OVERRIDE) if C.HONORS_OVERRIDE.exists() else pd.DataFrame()
    lines = ["# Data pipeline report", "", f"Data through season {nfl.latest_season()}.", ""]
    lines += ["## ID joins", "", "```", json.dumps(data.join_report, indent=2), "```", ""]
    lines += ["## Award joins", ""]
    wins = aw.wins
    lines.append(f"{len(wins)} award rows; {int((~wins['player_id'].str.startswith('wiki-')).sum())} joined to a player ID.")
    in_range_un = unmatched[unmatched["in_range"] == True] if len(unmatched) else unmatched  # noqa: E712
    lines.append(f"Unmatched in-range award/HOF rows: {len(in_range_un)}")
    for r in in_range_un.to_dict("records"):
        lines.append(f"- {r['award']} {r['season']} {r['player']}: {r['reason']}")
    pre = unmatched[unmatched["in_range"] != True] if len(unmatched) else unmatched  # noqa: E712
    lines.append(f"\nUnmatched pre-{C.RANGE_START} / non-player rows ({len(pre)}): "
                 + ", ".join(f"{r['player']} ({r['award']})" for r in pre.to_dict("records")))
    lines += ["", "## Production calibration (career value / production, by position)", ""]
    lines += [f"- {k}: {v:.2f}" for k, v in sorted(calibration.items())]
    lines += ["", "## Honors override", ""]
    if len(ov):
        lines.append(ov.groupby(["reason", "status"]).size().to_string())
        lines += ["", "Undrafted players filled:", ""]
        for r in ov[(ov["reason"] == "undrafted")].to_dict("records"):
            if str(r["status"]).startswith("ok") or r["status"] == "manual":
                lines.append(f"- {r['name']} ({r['position']}): {int(r['pro_bowls'])} PB, "
                             f"{int(r['first_team_all_pro'])} AP1, HOF={r['hof']}")
            else:
                lines.append(f"- {r['name']} ({r['position']}): NOT FILLED ({r['status']})")
    lines += ["", "## Aliases", ""] + [f"- {p}" for p in alias_problems] + [""]
    lines += [f"## Prompts: {len(kept)} kept, {len(cut)} cut", "", "| id | answers | out of range | T1-T5 | status |", "|---|---|---|---|---|"]
    for s in summary:
        t = "/".join(str(s["tiers"][k]) for k in sorted(s["tiers"]))
        lines.append(f"| {s['id']} | {s['answers']} | {s['out_of_range']} | {t} | {s['status']} |")
    size = C.PROMPTS_JSON.stat().st_size
    lines += ["", f"prompts.json: {size / 1024:.0f} KB; names.json: {C.NAMES_JSON.stat().st_size / 1024:.0f} KB"]
    (C.OUT_DIR / "report.md").write_text("\n".join(lines) + "\n")
    return {"kept": len(kept), "cut": cut, "size_kb": size / 1024, "alias_problems": alias_problems,
            "unmatched_in_range": len(in_range_un)}


if __name__ == "__main__":
    rep = main()
    print(f"prompts kept: {rep['kept']}, cut: {len(rep['cut'])}")
    for c in rep["cut"]:
        print(f"  CUT {c['id']}: {c['status']}")
    print(f"prompts.json {rep['size_kb']:.0f} KB; unmatched in-range awards: {rep['unmatched_in_range']}")
    for p in rep["alias_problems"]:
        print(f"  {p}")
    print(f"report: {(C.OUT_DIR / 'report.md').relative_to(C.ROOT)}")
