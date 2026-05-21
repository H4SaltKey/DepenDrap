/**
 * gameRules.js
 * ゲームルール定数・計算関数
 *
 * 責務: ゲームルールのみ。UI・state mutation・Firebase同期は行わない。
 * statusUI.js / battlePhase.js 等から参照されていたルール関数をここに集約。
 */

// ===== ターン・ラウンド定数 =====
window.TURNS_PER_ROUND = 5;   // 1ラウンドのターン数
window.LEVEL_MAX_CONST = 6;   // レベル上限

// ===== フェーズ定数 =====
// 文字列リテラルの散在を防ぐ。各ファイルで window.PHASE.PLAYING 等を使用する。
window.PHASE = Object.freeze({
  READY_CHECK:      "ready_check",
  SETUP_DICE:       "setup_dice",
  SETUP_EVOLUTION:  "setup_evolution",
  SETUP_FIRST_DRAW: "setup_first_draw",
  PLAYING:          "playing"
});

// ===== 手札上限 =====
/**
 * プレイヤーの手札上限を返す
 * 進化の道「忍耐の道」でレベルに応じて増加する
 * @param {string} owner "player1" | "player2"
 * @returns {number}
 */
function getHandLimit(owner) {
  const s = (typeof state !== "undefined") ? state[owner] : null;
  if (!s) return 6;
  let limit = 6;
  if (s.evolutionPath === "忍耐の道") {
    const x = getEvolutionPathParam("忍耐の道", s.level);
    limit += (1 + x);
  }
  return limit;
}
window.getHandLimit = getHandLimit;

// ===== 経験値上限 =====
/**
 * 指定レベルの経験値上限を返す
 * @param {number} level
 * @returns {number}
 */
function calcExpMax(level) {
  // Lv1→2: 2, Lv2→3: 4, Lv3→4: 6, Lv4→5: 8, Lv5→6: 10
  return Math.max(1, level) * 2;
}
window.calcExpMax = calcExpMax;

// ===== ラウンド進行 =====
/**
 * ターン終了後の次ターン・ラウンドを計算する（純粋関数）
 * @param {{ turn: number, round: number, turnPlayer: string, firstPlayer: string }} matchData
 * @returns {{ turn: number, round: number, turnPlayer: string, roundChanged: boolean }}
 */
function calcNextTurn(matchData) {
  const { turn, round, turnPlayer, firstPlayer } = matchData;
  const op = turnPlayer === "player1" ? "player2" : "player1";
  const fp = firstPlayer || "player1";

  if (turnPlayer === fp) {
    // 先攻プレイヤーのターン終了 → 後攻へ
    return { turn, round, turnPlayer: op, roundChanged: false };
  } else {
    // 後攻プレイヤーのターン終了 → ターン+1
    const nextTurn = turn + 1;
    if (nextTurn > window.TURNS_PER_ROUND) {
      return { turn: 1, round: round + 1, turnPlayer: fp, roundChanged: true };
    }
    return { turn: nextTurn, round, turnPlayer: fp, roundChanged: false };
  }
}
window.calcNextTurn = calcNextTurn;

// ===== 進化の道レベル効果 =====
/**
 * 進化の道のレベル依存パラメータ x を返す
 * @param {string} path 進化の道名
 * @param {number} level 現在レベル
 * @returns {number}
 */
function getEvolutionPathParam(path, level) {
  const lv = Number(level) || 1;
  // x = [0/1/3/4] at Lv[1-2 / 3-4 / 5 / 6]
  const tableX = lv >= 6 ? 4 : lv >= 5 ? 3 : lv >= 3 ? 1 : 0;
  // t = [1/2/3/4] at Lv[1-2 / 3-4 / 5 / 6]
  const tableT = lv >= 6 ? 4 : lv >= 5 ? 3 : lv >= 3 ? 2 : 1;
  // y = [1/3/4/6] at Lv[1-2 / 3-4 / 5 / 6]
  const tableY = lv >= 6 ? 6 : lv >= 5 ? 4 : lv >= 3 ? 3 : 1;
  // z = [1/3/4/6] (same as y)
  const tableZ = tableY;

  switch (path) {
    case "忍耐の道": return tableX;
    case "継続の道": return tableY;
    case "奇撃の道": return tableZ;
    case "背水の道": return tableT;
    default: return 0;
  }
}
window.getEvolutionPathParam = getEvolutionPathParam;
