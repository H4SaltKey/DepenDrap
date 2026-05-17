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

// ヘルパー関数もグローバルに公開
window.makeCharState = makeCharState;
window.BASE_INITIAL_STATE = BASE_INITIAL_STATE;
