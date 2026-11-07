# Krillion Reference: what to replicate (football version)

Observed by playing a full 7-prompt Krillion dive. This file is the source of truth for look and feel. Where it conflicts with SPEC.md's "Look and animation" section, this file wins.

## Core translation
| Krillion | Ours |
|---|---|
| Boat at the ocean surface | QB at our own goal line |
| Answer sinks into the ocean | Answer is thrown downfield |
| Depth (m) | Yards |
| Dotted depth lines per tier | Dotted yard lines per tier |
| Deeper = darker, stranger scenery | Farther = louder, brighter stadium, then end-zone glow |
| Sea creature icon per tier | Football icon per tier |

**Each answer is its own throw from our goal line.** It doesn't move a cumulative ball. Tier lines sit at fixed yardages, and a Hail Mary is a full 100-yard TD bomb. Score is points, like Krillion. Scrap the 100-yards-per-TD drive mechanic.

## Scoring (match Krillion exactly)
| Krillion tier | Pts | Ours | Throw lands at |
|---|---|---|---|
| Plankton | 10 | Checkdown | 10-yd line |
| Too Clever | 15 | Trick Play (v2, hand-flagged) | n/a |
| Schooler | 30 | Moving the Chains | 30 |
| Rare | 60 | Chunk Play | 60 |
| Deep Cut | 85 | Deep Shot | 85 |
| Krillion | 100 | Hail Mary | 100 (TOUCHDOWN) |

Max score is 700. The No Huddle multiplier sits on top of this (1.5x, then 2x).

## Screens and beats

### Home
- Pixel-art sky with clouds and a pixel sun on top, a boat at the waterline, dark water below. Ours: a pixel stadium at dusk, with the field at the bottom of the screen and the QB at the goal line.
- Big title with a **chromatic-aberration glitch** (pink and cyan offset outlines), a spaced-out subtitle ("THE DAILY DIVE"), and a one-line rules tagline ("7 prompts · 25 seconds each · rarer answers sink deeper").
- A huge bordered CTA, "▼ BEGIN DESCENT ▼". Ours: "▼ KICK OFF ▼". Below it: "DIVE #115 · STREAK 0" and small Archive / Unlimited buttons.
- Top-right: icon buttons for sound and settings. Top-left: hamburger menu. A "How to play" disclosure.
- Ambient life: a little mascot drifts around and fish swim by. Ours: a ref, a mascot, or a blimp.

### Pre-prompt
- The camera pans down into the water. A small pill at the bottom reads "descending · the clock starts in 3", counting 3, 2, 1. Ours: "huddle up · the clock starts in 3".
- The prompt card fades in: a pink label "PROMPT 1 OF 7", big monospace prompt text, and a hint line "▼ rarer answers sink deeper ▼".

### HUD (persistent)
- Chunky pixel-bordered panels: DEPTH on the left (cyan), SCORE on the right (pink). Ours: YARDS and SCORE.
- 7 pips at top center under the label "PROMPT N OF 7". Done pips are yellow, the current pip is pink.
- A depth ruler on the right edge with tick marks and labels ("-100m"), plus a pink "YOU" marker.

### Answer input
- A **circular countdown timer** sits left of the input with the seconds in the middle, then the input ("type one answer…"), then a pink DIVE button. Ours: SNAP.
- A thin progress bar under the input drains with the timer.
- **Last ~5 seconds:** a red vignette creeps in from the screen edges and the input border turns red.

### Wrong guess
- A small orange line above the input: `"Walter White": no echo. try again`. Ours: `"X": incomplete. try again`.
- A burst of bubbles. Ours: a little dust puff, or the ball bouncing off the turf.
- The clock keeps running.
- **Improve on Krillion:** it leaves the wrong text in the box, so the next typing gets appended. We should select-all on a wrong guess so typing replaces it.

### The throw (the money moment, about 3s)
1. Enter is pressed. The answer becomes a **pill-shaped tag** with the text in quotes and caps, colored in its tier's color, with a ▼. The mascot or ball carries it.
2. The camera follows it as it travels. **Dotted horizontal lines** appear for each tier, labeled on the right with icon, NAME, and PTS (e.g. "PLANKTON · 10", "TOO CLEVER · 15" in orange, "SCHOOLER · 30"). It passes every line it clears, and the line flashes as it does.
3. The DEPTH HUD counts up live, fast.
4. **Zone labels** fade in on the left at milestones ("THE MIDNIGHT ZONE"). **Real-fact flavor text** sits at fixed depths on both sides ("light begins to fade", "most sunlight stops here", "deepest scuba dive ever, 332m", "sperm whales hunt below here", "pressure: 67x the surface", "the water is 2°C and utterly black"). Ours, using football facts at real yardages: "the line of scrimmage", "the 50, midfield", "longest FG ever, 66 yds", "red zone", "Antonio Cromartie's 109-yd return lived here", and so on.
5. **The scenery changes with distance:** bright sky, then mid-blue water, then near-black with silhouette seaweed, then rock walls with glowing pink and cyan crystals. Deep throws get a **spotlight vignette**: the screen goes dark except a soft glow around the object. Ours: daytime stadium, then the lights come on, then the crowd silhouettes stand up, then a glowing end zone with fireworks for a Hail Mary.
6. It slows down and settles at its tier depth.

### Reveal card (full screen, centered)
- A **glowing pixel icon per tier**: bubbles for Plankton, a fish for Schooler, a red squid for Rare, a purple anglerfish for Deep Cut, and something gold for Krillion. Ours: whistle, chains, a football, a spiral with a motion trail, a gold trophy or a ball on fire.
- The **tier name** in big spaced caps in the tier color, with a glitch flicker as it appears.
- The answer in quotes, smaller and white.
- "**+60 PTS** · sink 600m". The points are tier-colored. Ours: "+60 PTS · 60 yds".
- A one-line quip in small dim text: "The answer everyone blurts out." / "Genuinely uncommon. Nice pull." / "True obscurity. Few go this deep."
  - **Sometimes the quip is an answer-specific fun fact** ("Bosnia's short coast at Neum divides Croatia's mainland."). We should support an optional `blurb` per answer in prompts.json, shown when present, especially for top-tier answers.
- A button, "DESCEND ▼". On the last prompt it becomes "SURFACE ▲". Ours: "NEXT PLAY ▼" and "FINAL WHISTLE".

### Timeout
- No throw. The card reads "NOTHING LANDED", then "–", "+0 PTS", and the dim line "the clock beat you to it." Ours: "INCOMPLETE".

### End screen (vertical scroll, single narrow column)
1. Header: small glitch logo on the left, "DIVE #1 COMPLETE" on the right.
2. A **huge pixel score** ("335") with "/700" and the total depth beside it.
3. A **distribution bell curve** of everyone's scores with a pink "YOU" marker, and "BETTER THAN 91% OF PLAYERS". This needs a backend, so it's v2 with Supabase. For v1, skip it or show only your own history.
4. **DIVE LOG ("deeper = rarer"):** a chart with 7 columns. Each answer is a vertical line dropping from the top to its tier depth, with the tier icon at the end. A miss shows an empty dotted circle at the surface. Ours: 7 throws, each a line from the goal line to its yardage.
5. **THE BEARING:** a rating table of score bands with flavor text, with your band highlighted and the others dimmed. Krillion's: 0–150 "Plankton. Plenty of ocean left down there." / 151–250 Schooler / 251–350 "Rare. Below the thermocline. Nice." / 351–449 Deep cut / 450+ "One in a krillion. Trench dweller. Absurd." Write football versions.
6. **COPY RESULT** (big pink) plus **SHARE…** (native share sheet).
7. **THE CATCH, "tap a round for every answer":** 7 rows, each with the prompt in small caps, your answer, a tier icon, and points. A miss shows "–". **Tapping a row expands the full answer list** sorted rarest-first, with points per answer, and the top answer shows its blurb. This is a big part of the fun: "oh, I should've said X."
8. "PLAY THIS ONE AGAIN" (in Unlimited; daily doesn't have this).
9. The scene pans back up to the surface and the boat behind the results. Ours: back to the stadium.

## Global style
- **CRT scanline overlay** across everything, plus a subtle film grain.
- **Fonts:** a pixel/bitmap font for the logo, big numbers, and tier names. A monospace font for prompts, labels, and body text. All labels in tiny, widely letter-spaced caps.
- **Palette:** dark navy to near-black backgrounds. Hot pink (#ff4f8b-ish) for primary buttons and score. Cyan for depth and secondary. Tier colors: grey-blue, cyan, red, purple, gold. Ours can keep this structure, with the turf green as an accent.
- **Panels:** dark translucent fills with pixel-notched corners and a 1–2px light border.
- **Buttons:** thick pink borders with a soft glow, ▼ and ▲ arrows.
- Constant ambient motion: bubbles rising, fish drifting, the waterline bobbing. Ours: crowd flicker, flags waving, camera flashes.
- Sound toggle top-right, with sound on by default.
