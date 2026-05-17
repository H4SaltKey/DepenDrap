/**
 * syncState.js
 * 状態の同期、正規化、派生ステータスの計算など
 */

function calcExpMax(level) {
  return Math.max(1, level) * 2;
}
window.calcExpMax = calcExpMax;

window.normalizeState = function() {
  ["player1", "player2"].forEach(p => {
    if (!state[p] || typeof state[p] !== "object") {
      state[p] = { ...makeCharState(), diceValue: -1 };
    }
    if (!Array.isArray(state[p].deck)) state[p].deck = [];
    if (state[p].diceValue === undefined || state[p].diceValue === null) state[p].diceValue = -1;
    
    delete state[p]._ready;
    delete state[p]._deckCode;
    
    ["hp", "shield", "defstack", "exp", "pp"].forEach(k => {
      if (state[p][k] === undefined || state[p][k] === null) state[p][k] = 0;
      const v  = Number(state[p][k]) || 0;
      const defaultMax = (k === "hp" ? 20 : (k === "shield" ? 5 : (k === "pp" ? 2 : (k === "exp" ? calcExpMax(state[p].level || 1) : 99))));
      const mx = Number(state[p][k + "Max"]) || defaultMax;
      state[p][k + "Max"] = mx;
      if (k !== "defstack" && v > mx) state[p][k] = mx;
      if (v < 0) state[p][k] = 0;
      else state[p][k] = v;
    });
    
    if (state[p].level === undefined || state[p].level === null) state[p].level = 1;
    if (!Array.isArray(state[p].statusBlocks)) state[p].statusBlocks = [];
  });
  
  if (!state.matchData) {
    state.matchData = {
      round: 1, turn: 1, turnPlayer: "player1", status: "setup_dice",
      winner: null, firstPlayer: null
    };
  }
  state.logs = state.logs || [];
  if (!Array.isArray(state.statusBlocks)) state.statusBlocks = [];
};

function syncDerivedStats(owner) {
  const s = state[owner];
  if (!s) return;
  // defstackMaxは常にdefと同じ
  s.defstackMax = s.def || 0;
  // expMaxはレベルから計算
  s.expMax = calcExpMax(s.level || 1);
}
window.syncDerivedStats = syncDerivedStats;

window.checkLevelUp = function(owner) {
  const s = state[owner];
  const maxLv = s.levelMax || 6;

  // 最大レベルに達したら経験値を増やさない。ただしマイナス時はレベルダウンを優先。
  if (s.level >= maxLv && s.exp >= 0) {
    s.exp = 0;
    s.expMax = calcExpMax(s.level);
    syncDerivedStats(owner);
    return;
  }

  // レベルアップ
  while (s.level < maxLv) {
    const needed = calcExpMax(s.level);
    if (s.exp >= needed) {
      s.exp -= needed;
      s.level += 1;
      s.expMax = calcExpMax(s.level);
      if (typeof applyLevelStats === "function") applyLevelStats(owner);
      if ([3, 5, 6].includes(s.level) && s.evolutionPath) {
        addGameLog(`[EVOLUTION] \${s.username || owner} のレベルが \${s.level} に上がり、「\${s.evolutionPath}」が強化されました！`);
      }
    } else {
      break;
    }
  }

  // レベルダウン（経験値がマイナスかつLv2以上）
  while (s.exp < 0 && s.level > 1) {
    s.level -= 1;
    s.expMax = calcExpMax(s.level);
    s.exp = s.expMax + s.exp; // 繰り下がり
    if (typeof applyLevelStats === "function") applyLevelStats(owner);
  }

  // Lv1でマイナスになったら0に固定
  if (s.exp < 0) s.exp = 0;

  // 最大レベルに達したら経験値を0に固定
  if (s.level >= maxLv) {
    s.exp = 0;
    s.level = maxLv; // 念のため上限に固定
  }

  s.expMax = calcExpMax(s.level);
  syncDerivedStats(owner);
};
