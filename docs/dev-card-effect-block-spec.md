# 開発者モード: ブロック組み換え式カード効果 仕様（準備版）

## 1. 目的

- 開発者モードで Scratch のようにブロックを組み換え、カード効果を定義できるようにする。
- 表示用テキスト (`effectText`) と実行用DSL (`effectDsl`) の乖離を減らす。
- 将来的にノーコードで効果調整できる土台を作る。

## 2. 効果定義モデル

カード効果は以下の二層で表現する。

1. 発動タイミングブロック（Trigger）
2. 効果ブロック（Effect）

構造:

```json
{
  "format": "dependrap.effectblocks.v1",
  "timings": [
    {
      "timing": "onSummon",
      "effects": [
        { "category": "pp", "kind": "set_pp_min", "target": "self", "value": 1 }
      ]
    }
  ]
}
```

## 3. 発動タイミング

- `onSummon`（登場時）
- `onAttack`（攻撃時）
- `onDirectAttack`（直接攻撃時）
- `onSkillBeforeAttackEffect`（攻撃時効果発動前(スキル)）
- `onSkillAfterAttackEffect`（攻撃時効果発動後(スキル)）
- `onTurnStart`（ターン開始時）
- `onTurnEnd`（ターン終了時）
- `onLeave`（退場時）
- `continuous`（継続）
- `manual`（手動/将来拡張）

## 4. 効果カテゴリ

要件で指定されたカテゴリを一次対応対象にする。

- 攻撃力調整系
- ダメージ系
- カード系
- PP系
- HP操作系
- 効果付与系
- カードに対する効果系

## 5. カテゴリ内ブロック（初期定義）

- 攻撃力調整系: `add_atk`
  - 効果: `increase | decrease | set(Nにする)`
  - 対象:
    - `attacker_zone_card`（アタッカー場のカード）
    - `this_card`（このカード）
    - `target_attacker_zone_card`（現在のターゲットのアタッカー場のカード）
    - `target_skill_card`（現在のターゲットの使用するスキルカード）
    - `self_base_atk`（自身の基礎攻撃力）
    - `target_base_atk`（現在のターゲットの基礎攻撃力）
  - 特例: 現在のターゲットがモンスターの場合、`target_*` 系対象はモンスター攻撃力を対象にする
- ダメージ系: `damage`
- カード系: `draw`, `move_source_to_hand`, `move_source_to_grave`
- PP系: `recover_pp`, `set_pp_min`
- HP操作系: `heal`
- HP操作系: `hp_reduce`
- 効果付与系: `grant_effect_bundle`
  - 重複可否:
    - 「同名カードから付与」かつ「効果名が同じ」場合のみ重複判定
  - 継続期間:
    - `count`（回数）
    - `turn`（ターン）
    - `both`（回数+ターン）
  - 付与する効果:
    - カテゴリを再選択して複数追加可能

## 6. 変換ルール（EffectEngine DSL へのマッピング）

`effectBlocks` は保存時に `dependrap.dsl.v1` へコンパイルする。

- `add_atk` -> `ADD_ATK`
- `damage` -> `DAMAGE`
- `draw_card` -> `DRAW`
- `add_hand` -> `DRAW`
- `add_hand_to_n` -> `DRAW_TO_HAND_MIN`
- `fetch_card` -> `FETCH_CARD`
- `return_to_hand` -> `MOVE_SOURCE_TO_HAND`
- `send_to_grave` -> `MOVE_SOURCE_TO_GRAVE`
- `return_to_deck` -> `MOVE_SOURCE_TO_DECK`
- `duplicate_to_hand` -> `DUPLICATE_SOURCE_TO_HAND`
- `play_to_field` -> `PLAY_SOURCE_TO_FIELD`
- `reveal_card` -> `REVEAL_CARD`
- `recover_pp` -> `RECOVER_PP`
- `set_pp_min` -> `SET_PP_MIN`
- `heal` -> `HEAL`
- `hp_reduce` -> `DAMAGE` (`damageType: "hp_reduce"`, `subType: "none"`)
- `grant_effect_bundle` -> `GRANT_EFFECT_BUNDLE`

`grant_status` は現時点では DSL 未対応のため、将来拡張予約として保持する（コンパイル時は無視）。

## 7. 保存仕様（cards.json）

- `effectBlocks` をカードごとに保持可能にする。
- `effectBlocks` が有効なら、保存時の `effectDsl` は `effectBlocks` から生成する。
- `effectBlocks` が空または不正な場合は従来どおり `effectText` からの簡易コンパイルを利用する。

## 7.1 効果ごとの条件

各効果ブロックに `condition` を持てる。

```json
{
  "condition": {
    "whileOnField": true,
    "thisTurn": true,
    "trackerCheck": {
      "owner": "self",
      "scope": "turn",
      "stat": "hp",
      "direction": "inc",
      "metric": "amount",
      "op": "gte",
      "value": 1
    }
  }
}
```

- `whileOnField`: これが場にある間のみ有効
- `thisTurn`: true の場合、記録参照をターンスコープで評価
- `trackerCheck`: 増/減/増減 と 量/回数 を組み合わせて判定

## 7.2 対象指定（新仕様）

対象は以下の3択。

- `self_player`（自身プレイヤー）
- `current_target`（現在のターゲット）
- `self_and_current_target`（自身と現在のターゲット）

## 8. 今回の実装範囲（準備）

- ブロック定義カタログ（タイミング/カテゴリ/ブロック）
- `effectBlocks` バリデーション
- `effectBlocks -> effectDsl` コンパイラ
- 開発者モード保存フローへの接続

UI のブロックエディタ本体（ドラッグ&ドロップ、条件式編集、プレビュー）は次段で実装する。
