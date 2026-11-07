# Data pipeline

Builds `public/data/prompts.json` (the prompt pool + tiered answers) and
`public/data/names.json` (every known player name, used by the matcher to reject typos that
are closer to someone else).

```sh
python3 -m venv scripts/.venv && scripts/.venv/bin/pip install -r scripts/requirements.txt
npm run data                                         # fetch nflverse (cached) + build
scripts/.venv/bin/python scripts/build_all.py --wikipedia   # also re-pull Wikipedia CSVs
npm run sanity                                       # human sanity check
scripts/.venv/bin/python -m pytest scripts/tests     # pipeline unit tests
```

Every step is re-runnable. Downloads are cached in `scripts/.cache/` (gitignored); debug
output goes to `scripts/out/` (gitignored): `report.md`, `fame.csv`, one CSV per prompt with
every answer's score and tier, and `override_unverified.csv`.

## Sources

| File | Source | Used for |
|---|---|---|
| `players/players.parquet` | nflverse | master player IDs, names, birth dates, colleges |
| `rosters/roster_1920..YYYY.parquet` | nflverse | player-team-season links (team prompts, longevity) |
| `draft_picks/draft_picks.parquet` | nflverse (PFR) | draft prompts; Pro Bowls, All-Pro, HOF, weighted AV, seasons started for **1980+ draftees only** |
| `stats_player/stats_player_reg_1999..YYYY.parquet` | nflverse | single-season stat prompts, production |
| `snap_counts/` (last 3 seasons) | nflverse | recent starts (recency bump) |
| `data/awards/{sb_mvp,mvp,opoy,dpoy,oroy,droy,cpoy}.csv` | Wikipedia award pages (`fetch_awards.py`) | award prompts + fame |
| `data/awards/hof.csv` | Wikipedia "List of Pro Football Hall of Fame inductees" | HOF flag for everyone |
| `data/honors_override.csv` | Wikipedia player infoboxes (`fetch_honors_override.py`) | honors + career stats for players with no draft_picks row |
| `data/aliases.csv` | hand-maintained | nicknames (OBJ, CMC, ...) mapped to existing players; never adds answers |
| `data/first_name_variants.csv` | hand-maintained | Pat/Patrick, Mike/Michael ... aliases |

nflverse has **no awards dataset**, so awards and the Hall of Fame list come from Wikipedia.
They are joined to nflverse IDs by name + "on a roster in the award season" + position,
with the team as a tiebreak for namesakes. Unmatched names are listed in `out/report.md`
(currently: none in range).

### ID joins

Pre-1990 roster rows mostly have no IDs. They are joined to `players.parquet` by
`smart_id`/`esb_id`/`gsis_id`, then name + birth date, then last name + first initial +
birth date. The rest get synthetic `syn-` IDs (obscure depth players, mostly pre-1975).
Draft picks join by gsis/PFR ID. ID links to a player who debuted more than a year before
the draft are rejected; nflverse points 2026's Peter Woods at a 1980 namesake. The fallbacks,
in order, each skip players already linked:

1. Name + draft year.
2. Last name + first initial + college + debut within 4 years. On ties, the exact name wins.
   This handles namesakes (two "Henry Thomas" debuting in 1987) and variants like Dan/Danny
   or "James E. Williams".
3. For nicknames and name changes (Scoop → Fernandars Gillespie, Karim Abdul-Jabbar →
   Abdul-Karim al-Jabbar): any first name and a compatible last name, but college, position
   group and debut window must agree, and the candidate must be unique.
4. Name + debut within 2 years, with the college required to agree when both sides list one.

Every fallback link is then checked against PFR's own data about the draftee: age at the
draft vs birth date, last season played, and whether he ever played at all when the names
differ. Judd Garrett never played, so he does not become his brother Jason. Each row's
method is in the `link` column. Every drafted player who played an NFL game is linked.
The rest are never-played draftees and stay their own draft-only players.

Team codes are mapped per season to the current franchise (`STL` = Cardinals until 1987,
Rams 1995-2015; `HOU` = Oilers until 1996, Texans from 2002; PFR codes `NWE`, `GNB`, ...);
see `nfl.franchise`.

### Honors override

`draft_picks` only has honors for players drafted 1980 or later, which leaves out undrafted
players (Warner, Gates, Romo) and careers that began before 1980 (Montana, Payton). For
those players, `fetch_honors_override.py` reads Pro Bowls, first-team All-Pro, HOF, and
career stat totals from their Wikipedia infobox. A player is only looked up if his name
matches a member of a Wikipedia Pro Bowl category, or he is a Hall of Famer or award
winner. A page is only accepted when its infobox birth date equals the nflverse one
(`ok`), or is within about a year of it and the page title has the same name
(`ok_approx_bd`, because nflverse birth dates for older players are often slightly off).
Rows you add by hand with `status=manual` are never overwritten.

## Fame score

All weights live in `config.py`. Tier names, yards and percentile cutoffs live in
`src/themes/nfl/tiers.json`, which the app also reads.

```
fame = honors + awards + value + recency

honors  = 8 * first-team All-Pro + 4 * Pro Bowls + 30 * HOF
awards  = per win: MVP 12, SB MVP 8, OPOY 8, DPOY 8, OROY 4, DROY 4, CPOY 3
value   = max(career_value, production_value)
          career_value     = 0.30 * PFR weighted AV + 1.5 * seasons as a starter   (draft_picks)
          production_value = calibration[position] * (pass_yds/2500 + scrimmage_yds/600
                             + sacks/5 + def_INTs/2 + FGs/25 + 0.75 * roster seasons since 1980)
recency = 4 * min(1, starts in the last 3 seasons / 34)     (start = >= 50% of off/def snaps)
```

* **Production** uses the larger of nflverse 1999+ career totals and the infobox career
  totals for override players. That covers pre-1999 careers.
* **Calibration**: production is rescaled per position bucket so that its median equals
  career value for drafted players whose whole career falls in the stats era. Without
  this, undrafted and pre-1980 players would be undervalued 1.1-3.4x. The factors are
  recomputed on every build and printed in `out/report.md`.
* **Recency** is capped at +4, so a recent backup never outranks a 2x Pro Bowler (who has
  +8 from honors alone).

### Per-prompt adjustments

* **Position multiplier** (only on prompts that mix positions: awards, colleges, draft
  "#1 overall", 15+ sacks, ...): QB 1.4; RB/WR/TE 1.1; EDGE/LB/CB/S 1.0; DT 0.9; OL 0.6;
  K/P/LS 0.5.
* **Award prompts** ("Name a Super Bowl MVP"): add award-specific fame on top of career
  fame. +60 per win of *that* award beyond the first (Brady's 5 SB MVPs, Mahomes' 3), plus a
  recency bonus of 150 × (3 − age) / 3 for the player's latest win, where age 0 is the
  award's most recent season (+150 / +100 / +50). For OROY/DROY the bonus is scaled to 25%,
  so recent rookies don't outrank established stars.
* **Team tenure** (team + position prompts only): `fame * min(1, seasons with the
  franchise / 4) ** 2`. A star's one late-career season with a team is a deep cut for that
  team (Herman Moore as a Giant), while a 4+ season player keeps full fame.

### Tiers

Answers are ranked by adjusted score, most famous first. Tiers are hybrid
(`src/themes/nfl/tiers.json`):

| Tier | Share |
|---|---|
| T1 | top 15% of the list, max 6 answers |
| T2 | next 20%, max 10 |
| T3 / T4 / T5 | the rest, split 40% / 35% / 25% |

For lists under about 30, the caps never bind and T1/T2 match plain percentiles. Big lists
keep T1/T2 to real household names: 187 Giants WRs split 6 / 10 / 69 / 60 / 42.
A prompt is cut if it has fewer than 15 answers, any empty tier, or no fame spread.

## Range rules

* Team, draft, award and college prompts count **1980 onward**. Players who fit only
  before 1980 go in the prompt's `outOfRange` list, so the game can say "before our time"
  instead of "wrong".
* Single-season stat prompts start at **1999** (first nflverse stats season) and say so.
  They have no out-of-range list because there is no earlier data.
* "Starting QB from the 2000s" means 200+ pass attempts in a season (nflverse has no
  games-started data before snap counts begin in 2012).

## Known gaps

* Honors for undrafted and pre-1980-career players come only from the override, so a
  non-Pro-Bowler from those groups has no honors, which is correct. The same applies to a
  Pro Bowler whose Wikipedia page fails birth-date verification; those are listed in
  `out/override_unverified.csv`.
* Career value (PFR approximate value) exists only for 1980+ draftees. Everyone else uses
  calibrated production, which is noisier for linemen (longevity is the only signal).
* `players.parquet` covers careers from about 1974, so out-of-range lists for draft and
  college prompts miss older players. Award and team out-of-range lists are complete.
