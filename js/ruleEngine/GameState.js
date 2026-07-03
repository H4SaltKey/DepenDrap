/**
 * ルール処理エンジン — ゲーム状態（ステップ1）
 * 1プレイヤー分のゾーン・リソースを保持する。
 */
export class GameState {
  constructor(initial = {}) {
    this.hp = initial.hp ?? 20;
    this.pp = initial.pp ?? 0;
    this.ppMax = initial.ppMax ?? 2;
    this.hand = cloneZone(initial.hand);
    this.grave = cloneZone(initial.grave);
    this.field = cloneZone(initial.field);
    this.activeContinuousEffects = cloneZone(initial.activeContinuousEffects);
    /** ドロー検証用。仕様外だが DRAW_CARD アクションに必要 */
    this.deck = cloneZone(initial.deck);
  }

  /** デバッグ・検証用の浅いコピー */
  snapshot() {
    return {
      hp: this.hp,
      pp: this.pp,
      ppMax: this.ppMax,
      hand: cloneZone(this.hand),
      grave: cloneZone(this.grave),
      field: cloneZone(this.field),
      activeContinuousEffects: cloneZone(this.activeContinuousEffects),
      deck: cloneZone(this.deck)
    };
  }
}

function cloneZone(arr) {
  return Array.isArray(arr) ? arr.map((item) => ({ ...item })) : [];
}
