# DepenDrap DSL v1

目的:
- 122枚以上をJSONのみで管理
- JS埋め込み禁止
- 条件式、変数、継続効果を同一形式で扱う

## Root
```json
{
  "format": "dependrap.dsl.v1",
  "triggers": []
}
```

## Trigger
```json
{
  "on": "onSummon",
  "condition": {},
  "variables": {},
  "effects": []
}
```

- `on`: `onSummon | onAttack | onDirectAttack | onTurnStart | onTurnEnd | onLeave | continuous`
- `condition`: 任意。falseならeffectsを実行しない
- `variables`: 任意。ローカル変数辞書
- `effects`: 実行効果配列

## Condition
条件評価の戻り値は必ず `true/false`。

論理式:
```json
{ "and": [condA, condB] }
{ "or": [condA, condB] }
{ "not": condA }
```

比較式:
```json
{ "selfHp": { "gte": 15 } }
{ "left": { "ref": "self.shield" }, "gt": 0 }
```

比較演算子:
- `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`

## Effect
共通:
```json
{ "type": "HEAL", "target": "self", "amount": 2 }
```

v1標準実装済み:
- `DRAW`
- `HEAL`
- `DAMAGE`
- `RECOVER_PP`
- `SET_PP_MIN`
- `ADD_SHIELD`
- `ADD_ATK`
- `MOVE_SOURCE_TO_GRAVE`
- `MOVE_SOURCE_TO_HAND`
- `TRIGGER_ATTACK_EFFECT`

## Target
- `self`
- `opponent`
- `owner`
- `eventTarget`

## Variable
変数式はJSON式のみ。

```json
{ "add": [ { "ref": "self.shield" }, 2 ] }
{ "sub": [ { "ref": "self.hp" }, { "ref": "opponent.hp" } ] }
{ "if": [ condition, whenTrue, whenFalse ] }
{ "var": "x" }
```

参照:
- `self.hp`, `self.pp`, `self.shield`, `self.atk`
- `opponent.hp`, `opponent.pp`, `opponent.shield`, `opponent.atk`
- `event.*`

## Continuous
`on: "continuous"` は継続効果として登録し、該当イベントごとに同じ評価器で再実行する。
v1骨格では登録・配列保持まで実装し、適用タイミング拡張を可能にしている。
