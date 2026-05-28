/**
 * gameState.js
 * ゲームの初期状態および現在の状態を保持する
 */

// ===== 基礎となる初期状態（不変） =====
const BASE_INITIAL_STATE = {
  level: 1,      levelMax: 6,
  exp: 0,        expMax: 2,
  hp: 20,        hpMax: 20,
  shield: 0,      shieldMax: 5,
  defstack: 0,    defstackMax: 0, defstackOverMax: false,
  atk: 1,        atkMax: 999,
  def: 0,        defMax: 999,
  instantDef: 0, instantDefMax: 999,
  pp: 0,         ppMax: 2,
  deck: [],
  backImage: null,
  statusBlocks: []
};

function makeCharState() {
  return JSON.parse(JSON.stringify(BASE_INITIAL_STATE));
}

// ===== ゲーム状態 =====
window.state = {
  player1: { ...makeCharState(), diceValue: -1 },
  player2: { ...makeCharState(), diceValue: -1 },
  matchData: {
    round: 1, turn: 1,
    turnPlayer: "player1",
    status: "ready_check",
    winner: null, firstPlayer: null
  },
  logs: []
};

const SYNC_PLAYER_STATE_KEYS = [
  "level", "levelMax",
  "exp", "expMax",
  "hp", "hpMax",
  "shield", "shieldMax",
  "defstack", "defstackMax", "defstackOverMax",
  "atk", "atkMax",
  "def", "defMax",
  "instantDef", "instantDefMax",
  "pp", "ppMax",
  "deck", "deckCount",
  "backImage",
  "statusBlocks",
  "evolutionPath",
  "evoContinuousDmgCount",
  "evoBackwaterExpGained"
];

const UI_ONLY_STATE_KEYS = [
  "hover", "selected", "preview", "expanded", "revealed",
  "visible", "targeting", "dragging", "animation"
];

window.SYNC_PLAYER_STATE_KEYS = SYNC_PLAYER_STATE_KEYS;
window.UI_ONLY_STATE_KEYS = UI_ONLY_STATE_KEYS;

window.sanitizePlayerStateForSync = function sanitizePlayerStateForSync(playerState) {
  const source = (playerState && typeof playerState === "object") ? playerState : {};
  const sanitized = {};
  SYNC_PLAYER_STATE_KEYS.forEach((key) => {
    if (source[key] !== undefined) sanitized[key] = source[key];
  });
  UI_ONLY_STATE_KEYS.forEach((key) => {
    if (sanitized[key] !== undefined) delete sanitized[key];
  });
  return sanitized;
};

// ヘルパー関数もグローバルに公開
window.makeCharState = makeCharState;
window.BASE_INITIAL_STATE = BASE_INITIAL_STATE;
