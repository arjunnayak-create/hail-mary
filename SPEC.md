# HAIL MARY — Daily NFL Rare-Answer Trivia (working title)

## What it is
A daily NFL trivia game in the format of Krillion (krillion.io) and Longshot Hoops: 7 prompts a day, the same for everyone, 25 seconds each. Type a player who fits the prompt. Any valid answer scores, and **rarer answers score more**. Played by a friend group who will share scores in a group chat.

The UX should feel like Krillion: dark, minimal, one prompt centered on screen, big input, satisfying tier reveal, clean end screen, shareable emoji result. **Do not copy Krillion's assets, logo, art, or copy text.** Same feel, our own look.

## Core metaphor: the drive
- Each correct answer is a play that moves the ball downfield. Yards gained = the answer's tier.
- Score = total yards across 7 plays. Every 100 yards = a TOUCHDOWN (big celebration, then the field resets and the drive continues).
- Timeout or no valid answer = **Incomplete**, 0 yards.
- Wrong guesses do NOT end the round: show a quick "no good" shake and the clock keeps running.
- Duplicate answers across prompts are allowed.

### Tiers (5, mirrors Krillion's rarity ladder)
| Tier | Name | Yards | Meaning | Share of prompt's answers (by fame, most famous first) |
|---|---|---|---|---|
| 1 | Checkdown | 3 | Household name | Top 15%, max 6 answers |
| 2 | Moving the Chains | 10 | Well-known starter | Next 20%, max 10 answers |
| 3 | Chunk Play | 20 | Solid, real fans know him | 40% of the rest |
| 4 | Deep Shot | 35 | Real deep cut | 35% of the rest |
| 5 | Hail Mary | 60 | One-in-a-krillion equivalent | 25% of the rest |

Keep tier names, yard values, shares, and caps in one config file so they're easy to tweak.

## Game flow
1. **Home:** title, today's game number, "Kick off" button, streak, how-to-play modal.
2. **Prompt screen:** prompt text, 25-sec timer bar, text input with autocomplete OFF (no hints, that's the game), Enter to submit. Mini field strip shows the current ball position.
3. **Reveal (~1.5s):** play animation, tier name pops in with yards, ball advances. Then show "Rarest answer was: X" in small text.
4. **End screen:** total yards, TD count, per-play breakdown (prompt / your answer / tier), the rarest valid answer for each prompt, share button, countdown to next game.
5. Daily game resets at **midnight ET**. Already played today → go straight to the end screen.

## Share text (Wordle-style, no spoilers)
```
🏈 Hail Mary #14 — 187 yds, 1 TD
🟢🟡🔵❌🟣🔴🟢
hailmary.vercel.app
```
One emoji per play, color = tier, ❌ for incomplete. Copy to clipboard and use the native share sheet on mobile.

## Look and animation
- **Palette:** night game, with deep navy/near-black background, turf green field, chalk white lines, stadium-light glow. Define as CSS variables.
- **Pixel art drawn in code:** define sprites as small pixel grids (arrays or strings) rendered to `<canvas>` with `image-rendering: pixelated`. No external art needed. Sprites: QB, receiver, football (with a spin frame), goalposts, yard numbers, simple crowd strip, end zone.
- **Field:** side-view or angled field strip that scrolls as the drive advances. Yard lines tick past.
- **Play animation scales with tier:** Checkdown is a quick dump-off; Chunk/Deep Shot is a long arcing spiral; Hail Mary is a slow-mo heave plus screen shake plus crowd flash.
- **Touchdown:** confetti pixels, crowd jumps, "TOUCHDOWN" text slam.
- **Incomplete:** ball bounces off the turf, sad trombone sound.
- **Fonts:** a pixel font (e.g. Press Start 2P) for headings and tier names only; a clean readable font for prompts and input.
- **Sound:** short synthesized SFX via Web Audio (whistle, throw, catch, crowd); mute toggle saved to localStorage.
- Mobile-first. Must feel great on an iPhone, input not covered by the keyboard, 60fps animations.

## Stack
- React + Vite + TypeScript + Tailwind, deployed on Vercel.
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

**Each answer:** `{ canonical name, aliases[], tier, playerId }`.

**Name matching** (TypeScript, used client-side):
- Case/punctuation-insensitive; ignores Jr./Sr./II/III.
- Nicknames and aliases (OBJ, Pat Mahomes, CMC, T.J. vs TJ).
- Typo tolerance (small edit distance), but never accept a match that's closer to a *different* player.
- Last-name-only accepted ONLY if it's unambiguous within that prompt's answer list.
- Unit tests for all of the above.

## Build phases (stop and report after each)
1. **Data + matcher.** Pipeline, prompts.json, matcher, tests. Print 5 random prompts with their tier 1 and tier 5 answers so I can sanity-check. **STOP for my review.**
2. **Game loop, no art.** Full flow working with plain UI: daily seed, timer, scoring, end screen, share text, localStorage, streak.
3. **Art and animation.** Field, sprites, tier-scaled play animations, TD and incomplete, sound.
4. **Polish and deploy.** Mobile QA, how-to-play modal, OG image for link previews, deploy to Vercel.

## Out of scope for v1
Accounts, multiplayer, leaderboards, archive, unlimited mode. Planned for v2: friends leaderboard via Supabase, unlimited mode, archive of past days, and a **"Trick Play" bonus tier** for valid-but-cheeky answers, flagged by hand per prompt.

## Working rules for Claude Code
- Read this file at the start of every session.
- Work one phase at a time; run the app and tests before saying a phase is done.
- Keep tier config, palette, and rarity weights each in one obvious place.
- If a data source is missing a field the spec assumes (e.g. awards), say so and propose an alternative instead of faking it.
