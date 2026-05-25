/**
 * monsterData.js
 * モンスターの定義データ
 * 既存コードへの依存なし・副作用なし
 */

window.MONSTER_DEFINITIONS = [
  {
    id: "goblin",
    name: "ゴブリン",
    emoji: "👺",
    hp: 6,
    shield: 0,
    def: 0,
    atk: 1,
    initiative: "後攻",  // "先攻" | "後攻"
    traits: [],
    actions: [
      { type: "attack", label: "噛みつき", weight: 1 }
    ],
    expReward: 1,
    description: "素早い小鬼。弱いが数が多い。"
  },
  {
    id: "armored_golem",
    name: "装甲ゴーレム",
    emoji: "🗿",
    hp: 10,
    shield: 0,
    def: 0,
    atk: 2,
    initiative: "先攻",
    traits: [
      {
        id: "armor",
        label: "装甲",
        description: "2以上のダメージは全て1になる",
        onDamageReceived: (dmg) => Math.min(dmg, 1)
      }
    ],
    actions: [
      { type: "attack", label: "鉄拳", weight: 1 }
    ],
    expReward: 2,
    description: "硬い装甲を持つ。大ダメージが通らない。"
  },
  {
    id: "shadow_wolf",
    name: "シャドウウルフ",
    emoji: "🐺",
    hp: 8,
    shield: 0,
    def: 0,
    atk: 2,
    initiative: "後攻",
    traits: [
      {
        id: "counter",
        label: "追撃",
        description: "攻撃者が前ターンにプレイヤーへダメージを与えていた場合、受けるダメージ+1",
        onDamageReceived: (dmg, ctx) => {
          const attacker = ctx?.attacker;
          if (attacker && window._turnDmgHistory?.[attacker] > 0) return dmg + 1;
          return dmg;
        }
      }
    ],
    actions: [
      { type: "attack", label: "爪撃", weight: 2 },
      { type: "attack_double", label: "連続噛み", weight: 1 }
    ],
    expReward: 2,
    description: "PvPに集中するプレイヤーを狙う。"
  },
  {
    id: "growth_slime",
    name: "成長スライム",
    emoji: "🟢",
    hp: 5,
    shield: 0,
    def: 0,
    atk: 1,
    initiative: "後攻",
    traits: [
      {
        id: "growth",
        label: "成長",
        description: "討伐後、以後3ラウンド毎ターン経験値+1",
        onDefeat: (ctx) => {
          window._slimeGrowthRoundsLeft = 3;
          window._slimeGrowthKiller = ctx?.killer;
        }
      }
    ],
    actions: [
      { type: "attack", label: "体当たり", weight: 1 }
    ],
    expReward: 1,
    description: "倒した後も恩恵が続く。"
  },
  {
    id: "multi_spider",
    name: "多段蜘蛛",
    emoji: "🕷️",
    hp: 7,
    shield: 0,
    def: 0,
    atk: 1,
    initiative: "先攻",
    traits: [
      {
        id: "multi_weak",
        label: "多段弱点",
        description: "1ターンに3回以上攻撃を受けると被ダメージ+2",
        onDamageReceived: (dmg, ctx) => {
          const hitCount = ctx?.hitCountThisTurn || 0;
          return hitCount >= 3 ? dmg + 2 : dmg;
        }
      }
    ],
    actions: [
      { type: "attack", label: "毒針", weight: 1 },
      { type: "attack", label: "糸絡め", weight: 1 }
    ],
    expReward: 2,
    description: "多段攻撃で弱点を突ける。"
  },
  {
    id: "ancient_dragon",
    name: "古代竜",
    emoji: "🐉",
    hp: 18,
    shield: 0,
    def: 0,
    atk: 3,
    initiative: "先攻",
    traits: [],
    actions: [
      { type: "attack", label: "炎ブレス", weight: 2 },
      { type: "attack_all", label: "テイルスイング", weight: 1 }
    ],
    expReward: 4,
    description: "高HPの強敵。討伐で大量経験値。"
  }
];

// モンスターIDリスト（ランダム選出用）
window.MONSTER_ID_POOL = window.MONSTER_DEFINITIONS.map(m => m.id);
