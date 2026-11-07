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

export const BALL_PAL: Palette = { b: '#8a4b25', d: '#5e3014', w: '#f4efe6' }

/** Ball nose-up in flight; laces rotate across three frames (the spiral). */
export const BALL_FRAMES: Sprite[] = [
  ['.b.', 'bwb', 'bwb', 'dwd', '.d.'],
  ['.b.', 'wbb', 'wbb', 'wdd', '.d.'],
  ['.b.', 'bbw', 'bbw', 'ddw', '.d.'],
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
  football: [
    '............',
    '.......oooo.',
    '.....ooCCLCo',
    '....oCCCCCCo',
    '...oCCWCWCCo',
    '..oCWWWWWCo.',
    '.oCCWCWCCo..',
    '.oCCCCCCo...',
    '.oDCCCoo....',
    '..oooo......',
    '............',
    '............',
  ],
  spiral: [
    '............',
    '............',
    '......oooo..',
    'LL..ooCCLCo.',
    '...oCCWCWCCo',
    'LLLoCWWWWWCo',
    '...oCCWCWCCo',
    'LL..ooCCDCo.',
    '......oooo..',
    '............',
    '..LL..LL....',
    '............',
  ],
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
