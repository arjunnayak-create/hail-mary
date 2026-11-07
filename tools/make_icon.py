"""Write public/favicon.svg: a pixel football on a night-field tile (crisp at any size)."""
from pathlib import Path

GRID = [  # 16x16; '.' = background
    "................",
    "................",
    "..........oooo..",
    "........ooBBBBo.",
    ".......oBBBBBBo.",
    "......oBBWBWBBo.",
    ".....oBBWWWWWBo.",
    "....oBBWBWBWBo..",
    "...oBBWWWWWBo...",
    "..oBBBWBWBBo....",
    "..oBBBBBBBo.....",
    "..oDBBBBoo......",
    "...oDDoo........",
    "....oo..........",
    "................",
    "................",
]
COLORS = {"o": "#0b0f1e", "B": "#a8572b", "D": "#6e3416", "W": "#f4efe6"}
px = []
for y, row in enumerate(GRID):
    for x, ch in enumerate(row):
        if ch in COLORS:
            px.append(f'<rect x="{x + 2}" y="{y + 2}" width="1" height="1" fill="{COLORS[ch]}"/>')
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" shape-rendering="crispEdges">
<rect width="20" height="20" fill="#070a1a"/>
<rect x="1" y="1" width="18" height="18" fill="#14203f"/>
<rect x="1" y="9" width="18" height="1" fill="#ff4f8b" opacity="0.55"/>
<rect x="1" y="1" width="18" height="1" fill="#ff4f8b"/><rect x="1" y="18" width="18" height="1" fill="#ff4f8b"/>
<rect x="1" y="1" width="1" height="18" fill="#ff4f8b"/><rect x="18" y="1" width="1" height="18" fill="#ff4f8b"/>
{"".join(px)}
</svg>
'''
Path(__file__).resolve().parent.parent.joinpath("public", "favicon.svg").write_text(svg)
print("wrote public/favicon.svg")
