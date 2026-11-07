# HAIL MARY — Daily NFL Rare-Answer Trivia (working title)

## What it is
A daily NFL trivia game in the format of Krillion (krillion.io) and Longshot Hoops: 7 prompts a day, the same for everyone, 25 seconds each. Type a player who fits the prompt. Any valid answer scores, and **rarer answers score more**. Played by a friend group who will share scores in a group chat.

The UX should feel like Krillion: dark, minimal, one prompt centered on screen, big input, satisfying tier reveal, clean end screen, shareable emoji result. **Do not copy Krillion's assets, logo, art, or copy text.** Same feel, our own look.

**Look and feel source of truth: `KRILLION_REFERENCE.md`.** It overrides this file's original "Look and animation" section and replaces the drive/touchdown mechanic. Exception: mobile-first is a hard requirement (see below).

## Core metaphor: every answer is a throw
- Each correct answer is its own throw from our goal line. Tier lines sit at fixed yardages (10/30/60/85); a Hail Mary is a full 100-yard TD bomb.
- Score is points, Krillion-style. Max base score 700 (7 × 100).
- Timeout = **Incomplete**, 0 points. Wrong guesses don't end the round: a short "incomplete. try again" line, the guess is selected so typing replaces it, and the clock keeps running.
- Duplicate answers across prompts are allowed.

### Tiers (5)
| Tier | Name | Points | Lands at | Share of prompt's answers (by fame, most famous first) |
|---|---|---|---|---|
| 1 | Checkdown | 10 | 10 yds | Top 15%, max 6 answers |
| 2 | Moving the Chains | 30 | 30 | Next 20%, max 10 answers |
| 3 | Chunk Play | 60 | 60 | 40% of the rest |
| 4 | Deep Shot | 85 | 85 | 35% of the rest |
| 5 | Hail Mary | 100 | 100 (TD) | 25% of the rest |

**No Huddle multiplier:** consecutive answers at Chunk Play or better build a streak. The 2nd in a row scores ×1.5, the 3rd and later ×2 (cap). A lower tier or a miss resets it. Shown on the reveal card ("+60 × 1.5 = 90 PTS") and as 🔥 in the share text.

Tier names, points, distances, colors, shares, caps and the No Huddle steps all live in `src/themes/nfl/tiers.json` (read by the app and the data pipeline).

## Game flow
1. **Home:** pixel stadium at dusk, glitch title, "▼ KICK OFF ▼", game number + streak, how to play, menu, sound toggle.
2. **Pre-prompt:** "huddle up · the clock starts in 3…2…1", then the prompt card fades in.
3. **Prompt:** HUD (YARDS / SCORE / 7 pips), circular 25-sec timer, input + SNAP, draining bar, red vignette in the last 5 s.
4. **Throw (~1–4 s, scales with tier):** vertical field, camera follows the ball, tier lines flash as it passes, facts at real yardages, stadium lights up with distance; Hail Mary = spotlight, end-zone glow, fireworks, TOUCHDOWN slam.
5. **Reveal card:** glowing tier icon, tier name, answer, points (with multiplier), quip or per-answer blurb, NEXT PLAY / FINAL WHISTLE.
6. **End screen:** big score /700, play chart, scouting-report bands, copy + native share, Film Room (tap a play for every answer, rarest first), countdown to the next game.
7. Daily game resets at **midnight ET**. Already played today → straight to the end screen. Reloading mid-prompt counts that prompt as a miss.

## Share text (Wordle-style, no spoilers)
```
🏈 Hail Mary #14 — 473 pts
🟡🟣🔥🔴🔥🔵⚪❌🟣
hailmary.vercel.app
```
One emoji per play (tier color), 🔥 after plays scored with No Huddle, ❌ for incomplete.

## Mobile-first (hard requirement)
Primary target is iPhone portrait (~390 px). The input and SNAP sit above the keyboard (visualViewport); the prompt card and timer stay visible while typing; the throw runs vertically; tap targets ≥ 44 px, no hover-only interactions; the end screen is one column; safe areas respected; `100dvh`; native share sheet. Desktop works as a centered column.

## Architecture (reusable for other Krillion-style games)
- `src/engine/`: timer, scoring + No Huddle, matcher, daily seed, progress/streak, share, storage, audio synth, viewport. **Zero football references.**
- `src/ui/`: generic screens (home, HUD, input, reveal, end, menu) that talk only to the `Theme` interface in `src/ui/theme.ts`.
- `src/themes/nfl/`: everything football: tiers.json, copy, palette, sprites, the stadium and field scenes, tier icons, SFX.
- `public/data/prompts.json` uses a generic schema: `prompts[{ id, category, text, qualifier, answers[{ id, name, aliases[], shortName?, blurb?, tier }], outOfRange[...] }]`.
- A new game (movies, TV, pop culture) = a new theme folder + a new data pipeline. Nothing else changes.

## Stack
- React + Vite + TypeScript (+ Tailwind available), deployed on Vercel.
- No backend in v1. Daily state, streak, and history in localStorage (wrapped in try/catch).
- Answer data ships as static JSON. Friends could peek in devtools; acceptable for v1.
- Daily prompt selection: deterministic from date (seeded PRNG over the prompt pool) so everyone gets the same 7 with no server.

## Data (the most important part)
Bad data kills this game. Treat it as the main work.

**Source:** nflverse (`nfl_data_py` or nflverse GitHub release files): players, rosters, draft picks, season stats, awards where available. Do NOT scrape Pro Football Reference. Do NOT generate answer lists from memory.

**Pipeline:** Python scripts in `/scripts` that output `public/data/prompts.json`. Must be re-runnable.

**Prompt pool:** at least 60 prompts so the daily rotation doesn't repeat fast. Mix:
- Team + position: "Name a Giants WR", "Name a Cowboys QB" (all-time unless stated)
- Draft: "Name a QB drafted after round 3", "Name a #1 overall pick"
- Awards: "Name a Super Bowl MVP", "Name a Defensive Player of the Year"
- Stat thresholds: "Name a RB with a 1,500-yard season", "Name a player with 15+ sacks in a season"
- Colleges: "Name an NFL player from Alabama"
- Eras: "Name a starting QB from the 2000s"
- Rules: every prompt needs ≥15 valid answers and real spread across all 5 tiers, or it gets cut.

**Rarity:** compute a fame score per player, then assign tiers by **rank within that prompt's answer list** (shares and caps in the tier table above) (so a list of all-famous Super Bowl MVPs still has a spread). Fame score inputs: Pro Bowls, All-Pros, career approximate value, games started, major awards, maybe a recency bump. Document the formula in `scripts/README.md` with weights in one place.

**Each answer:** `{ id, name, aliases[], shortName, tier, blurb? }`. Optional blurbs come from `scripts/data/blurbs.csv`.

**Name matching** (TypeScript, used client-side):
- Case/punctuation-insensitive; ignores Jr./Sr./II/III.
- Nicknames and aliases (OBJ, Pat Mahomes, CMC, T.J. vs TJ).
- Typo tolerance (small edit distance), but never accept a match that's closer to a *different* player.
- Last-name-only (`shortName`) accepted ONLY if it's unambiguous within that prompt's answer list.
- Unit tests for all of the above.

## Build phases (stop and report after each)
1. **Data + matcher.** Pipeline, prompts.json, matcher, tests. Print 5 random prompts with their tier 1 and tier 5 answers so I can sanity-check. **STOP for my review.**
2. **Game loop with the real look and feel** (merged with the old phase 3): every screen and beat in `KRILLION_REFERENCE.md`, pixel art in code, Web Audio SFX, engine/theme split. ✅
4. **Polish and deploy.** Mobile QA, how-to-play modal, OG image for link previews, deploy to Vercel.

## Out of scope for v1
Accounts, multiplayer, leaderboards, archive, unlimited mode. Planned for v2: friends leaderboard via Supabase (enables the end-screen score distribution "bell curve"), unlimited mode, archive of past days, and a **"Trick Play" bonus tier** for valid-but-cheeky answers, flagged by hand per prompt.

## Backlog
- Wikipedia pageviews as a fame signal (fixes cases like Victor Cruz ranking below Darius Slayton).
- Fill `scripts/data/blurbs.csv` with fun facts for top-tier answers.

## Working rules for Claude Code
- Read this file at the start of every session.
- Work one phase at a time; run the app and tests before saying a phase is done.
- Keep tier config, palette, and rarity weights each in one obvious place.
- If a data source is missing a field the spec assumes (e.g. awards), say so and propose an alternative instead of faking it.
