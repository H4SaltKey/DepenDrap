(function() {
  const VERSION = 1;

  const DICTIONARY = {
    JOKER: /(ジョーカー)/,
    ALL_IN: /(オールイン)/,
    DRAW: /(カードを?引く|ドロー|手札を増やす)/,
    DAMAGE: /(ダメージ|攻撃)/,
    HEAL: /(回復|HPを[0-9０-９一二三四五六七八九十百千]+回復)/,
    DESTROY: /(破壊|墓地へ送る|退場)/,
    DISCARD: /(捨てる|破棄)/,
    SEARCH: /(山札を取り出|探索|サーチ)/,
    SUMMON: /(場に出す|召喚|登場)/,
    BUFF: /(攻撃力を\+|防御力を\+|上昇)/,
    DEBUFF: /(攻撃力を-|防御力を-|減少)/
  };

  function parseAmount(text) {
    const m = String(text || "").match(/([0-9]+)\s*(枚|回|ダメージ|点|回復|増加|減少)?/);
    if (!m) return null;
    const v = Number(m[1]);
    return Number.isFinite(v) ? v : null;
  }

  function detectTrigger(text) {
    const line = String(text || "");
    if (/登場時|場に出た時/.test(line)) return "onSummon";
    if (/攻撃時/.test(line)) return "onAttack";
    if (/直接攻撃時/.test(line)) return "onDirectAttack";
    if (/退場時|墓地へ送/.test(line)) return "onLeave";
    if (/ターン開始時/.test(line)) return "onTurnStart";
    if (/ターン終了時/.test(line)) return "onTurnEnd";
    if (/継続/.test(line)) return "continuous";
    if (/即効/.test(line)) return "instant";
    return "manual";
  }

  function detectAction(text) {
    for (const [type, regex] of Object.entries(DICTIONARY)) {
      if (regex.test(text)) {
        return { type, amount: parseAmount(text) };
      }
    }
    return { type: "UNKNOWN", raw: text };
  }

  function compileText(effectText) {
    const raw = String(effectText || "").trim();
    if (!raw) return null;

    const lines = raw
      .split(/[\n。]+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const triggers = lines.map((line) => {
      const action = detectAction(line);
      const effect = { type: action.type };
      if (action.amount != null) effect.amount = action.amount;
      if (action.raw) effect.raw = action.raw;

      return {
        on: detectTrigger(line),
        effects: [effect]
      };
    });

    return { version: VERSION, triggers };
  }

  function validateDsl(dsl) {
    if (!dsl) return false;
    if (dsl.version !== VERSION) return false;
    if (!Array.isArray(dsl.triggers)) return false;
    return dsl.triggers.every((t) => typeof t.on === "string" && Array.isArray(t.effects));
  }

  function readTrackerValue(path, owner) {
    if (!window.GameStatTracker || typeof window.GameStatTracker.resolvePath !== "function") return null;
    return window.GameStatTracker.resolvePath(path, owner || (window.getMyRole ? window.getMyRole() : window.myRole));
  }

  window.CardDSL = {
    VERSION,
    DICTIONARY,
    compileText,
    validateDsl,
    readTrackerValue
  };
})();
