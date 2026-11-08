/** Pixel sprites as character grids ('.' = transparent). See pixel.ts for palettes. */
import type { Palette, Sprite } from './pixel'

export const TEAM: Palette = {
  o: '#0b0f1e', // outline
  H: '#dfe3ee', // helmet
  s: '#ff4f8b', // helmet stripe
  F: '#8a93ab', // facemask
  J: '#ff4f8b', // jersey
  N: '#ffffff', // number
  S: '#c58a5c', // skin
  W: '#eef0f6', // pants
  P: '#ff4f8b', // socks
  K: '#141414', // cleats
  b: '#8a4b25', // ball
}

/** QB seen from behind, facing downfield (up the screen). */
export const QB_IDLE: Sprite = [
  '....ooo....',
  '...oHHHo...',
  '..oHHsHHo..',
  '..oHHsHHo..',
  '...oHsHo...',
  '..oJJJJJo..',
  '.oJJJJJJJo.',
  'oSJJNNNJJSo',
  'oSoJNJNJoSo',
  '..oJJNJJo..',
  '..oWWWWWo..',
  '..oWWoWWo..',
  '..oWo.oWo..',
  '..oPo.oPo..',
  '..oKo.oKo..',
]

/** Wind-up: ball cocked above the right shoulder. */
export const QB_WINDUP: Sprite = [
  '........bb.',
  '....ooo.bbo',
  '...oHHHoSo.',
  '..oHHsHHoS.',
  '..oHHsHHoS.',
  '...oHsHoJo.',
  '..oJJJJJJo.',
  '.oJJJJJJJo.',
  'oSJJNNNJJo.',
  'oSoJNJNJo..',
  '..oJJNJJo..',
  '..oWWWWWo..',
  '..oWWoWWo..',
  '..oWo.oWo..',
  '..oKo.oKo..',
]

/** Follow-through: throwing arm extended downfield. */
export const QB_FOLLOW: Sprite = [
  '.........S.',
  '....ooo..So',
  '...oHHHo.So',
  '..oHHsHHoJo',
  '..oHHsHHoJ.',
  '...oHsHoJo.',
  '..oJJJJJJo.',
  '.oJJJJJJJo.',
  'oSJJNNNJJo.',
  'oSoJNJNJo..',
  '..oJJNJJo..',
  '..oWWWWWo..',
  '..oWWoWWo..',
  '..oWo.oWo..',
  '..oKo.oKo..',
]

/** Receiver downfield, facing back toward the QB (and the camera). */
export const RECEIVER: Sprite = [
  '....ooo....',
  '...oHHHo...',
  '..oHHHHHo..',
  '..oFFFFFo..',
  '...oSSSo...',
  '..oJJJJJo..',
  '.oJJJJJJJo.',
  'oSJJNNNJJSo',
  'oSoJNJNJoSo',
  '..oJJNJJo..',
  '..oWWWWWo..',
  '..oWWoWWo..',
  '..oWo.oWo..',
  '..oPo.oPo..',
  '..oKo.oKo..',
]

export const RECEIVER_CATCH: Sprite = [
  '.So.....oS.',
  '.So.ooo.oS.',
  '.SooHHHooS.',
  '..oHHHHHo..',
  '..oFFFFFo..',
  '...oSSSo...',
  '..oJJJJJo..',
  '..oJJJJJo..',
  '..oJNNNJo..',
  '..oJNJNJo..',
  '..oWWWWWo..',
  '..oWWoWWo..',
  '..oWo.oWo..',
  '..oPo.oPo..',
  '..oKo.oKo..',
]

// --------------------------------------------------------------------------- football
// Canonical football, taken pixel-for-pixel from public/favicon.svg: level, white end
// stripes, a lace bar with stitches. Used for the Chunk Play / Deep Shot icons (and so in the
// Play Chart and end screen) and, at half size, for the ball in the throw.
export const FOOTBALL_PAL: Palette = {
  o: '#06071a', L: '#cf7436', B: '#a3501e', D: '#6e3312', W: '#f6efe0',
  c: '#3fd6ff', p: '#ff4f8b', q: '#7a2a55', // motion streak
}

export const FOOTBALL: Sprite = [
  '......oooooooo......',
  '....ooLLLLLLLLoo....',
  '...oLLLLLLLLLLLLo...',
  '..oWBBBBBBBBBBBBWo..',
  '.oBWBBBWBWBWBBBBWBo.',
  'oBBWBBWWWWWWWBBBWBBo',
  'oBBWBBBWBWBWBBBBWBBo',
  '.oBWBBBBBBBBBBBBWBo.',
  '..oWDDDDDDDDDDDDWo..',
  '...oDDDDDDDDDDDDo...',
  '....ooDDDDDDDDoo....',
  '......oooooooo......',
]

/** The app icon composition: the football with its streak. */
export const FOOTBALL_STREAK: Sprite = [
  '..............oooooooo......',
  '............ooLLLLLLLLoo....',
  '...........oLLLLLLLLLLLLo...',
  '..........oWBBBBBBBBBBBBWo..',
  '.........oBWBBBWBWBWBBBBWBo.',
  '........oBBWBBWWWWWWWBBBWBBo',
  '........oBBWBBBWBWBWBBBBWBBo',
  '.........oBWBBBBBBBBBBBBWBo.',
  '........cpoWDDDDDDDDDDDDWo..',
  '.......cpq.oDDDDDDDDDDDDo...',
  '......cpq...ooDDDDDDDDoo....',
  '.....cpq......oooooooo......',
  '....cpq.....................',
  '...cpq......................',
  '..cpq.......................',
  '.cpq........................',
  'cpq.........................',
]

/** Half-size football for the throw (same look: stripes, lace + stitches); always level. */
export const BALL_SMALL: Sprite = [
  '..oooooo..',
  '.oWLLLLWo.',
  'oBWWWWWWBo',
  'oBWBWBBWBo',
  '.oWDDDDWo.',
  '..oooooo..',
]

export const REF_PAL: Palette = { o: '#0b0f1e', S: '#c58a5c', W: '#f4f4f4', K: '#111111', C: '#111111' }

export const REF: Sprite[] = [
  ['..ooo..', '.oCCCo.', '.oSSSo.', '..oSo..', '.oWKWo.', 'oSKWKSo', '.oWKWo.', '.oKWKo.', '..KoK..', '..KoK..', '.KK.KK.'],
  ['..ooo..', '.oCCCo.', '.oSSSo.', '..oSo..', '.oWKWo.', 'oSKWKSo', '.oWKWo.', '.oKWKo.', '..KoK..', '.K..K..', 'KK...KK'],
]

/** Ref signalling touchdown, both arms straight up. */
export const REF_TD: Sprite = [
  '.S.....S.',
  '.S.ooo.S.',
  '.SoCCCoS.',
  '.WoSSSoW.',
  '.K.oSo.K.',
  '.WoWKWoW.',
  '..oKWKo..',
  '..oWKWo..',
  '..oKWKo..',
  '...KoK...',
  '...KoK...',
  '..KK.KK..',
]

export const BLIMP_PAL: Palette = { o: '#1a1330', G: '#b7bdd0', g: '#7e849b', P: '#ff4f8b', L: '#ffe066' }

export const BLIMP: Sprite = [
  '......oooooooooo.......',
  '...ooGGGGGGGGGGGGoo...o',
  '.oGGGGGGGGGGGGGGGGGGooG',
  'oGGPPPPPPPPPPPPPPGGGGGo',
  '.oGGGGGGGGGGGGGGGGGGooG',
  '...ooGGGGGGGGGGGGoo...o',
  '........oggLgo.........',
]

// --------------------------------------------------------------------------- tier icons
// o outline, C tier color, L light, D dark, W white
/** Icons drawn in their own fixed colors (the rest are tinted with the tier color). */
export const ICON_PALETTES: Record<string, Palette> = { football: FOOTBALL_PAL, spiral: FOOTBALL_PAL }

export const ICONS: Record<string, Sprite> = {
  whistle: [
    '............',
    '............',
    '......oooo..',
    '.....oLLCCo.',
    'ooooooLCCCCo',
    'oLLLLLCCCCCo',
    'oCCCCCCCoCCo',
    'ooooooCCCCCo',
    '......oCCCDo',
    '.......oooo.',
    '............',
    '............',
  ],
  chains: [
    'oo........oo',
    'oLo......oLo',
    'oCo......oCo',
    'oCoLoLoLooCo',
    'oCLoLoLoLoCo',
    'oCo......oCo',
    'oCo......oCo',
    'oCo......oCo',
    'oCo......oCo',
    'oDo......oDo',
    'oDo......oDo',
    '.o........o.',
  ],
  football: FOOTBALL,
  spiral: FOOTBALL_STREAK,
  trophy: [
    '....oooo....',
    '...oCCLCo...',
    '..oCCCCLCo..',
    '..oCCWCCCo..',
    '..oDCCCCCo..',
    '...oDCCCo...',
    '....oCCo....',
    '.....oo.....',
    '.....CC.....',
    '...oCCCCo...',
    '..oDDDDDDo..',
    '..oooooooo..',
  ],
}
