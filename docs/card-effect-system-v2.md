# Card Effect System (Trigger / Condition / Action / Duration / Limit)

## 目的

- `effects[]` をカード能力の唯一の実行データとする。
- 新DSLは直接 `effects[]` にコンパイルし、旧DSL v1/Block/Graphは実行しない。
- 複雑なカードだけは明確な専用Action/処理として保持する。

## 新しい正規データ

`effects[]` (`dependrap.effects.v1` 相当) を保存・実行形式とする。

各要素は `trigger`, `condition`, `action`, `duration`, `limit` を持つ。即時Actionのdurationと無制限のlimitは省略できる。

## サブシステム

### 1. Visual Editor

- ノード種別: `trigger`, `condition`, `target`, `effect`, `modifier`, `end`
- ノードグラフは編集中の可視化にのみ使い、カードJSONへ保存しない。
- 保存されるのはコンパイル済み `effects[]` のみ。

### 2. DSL Editor

- 行指向DSLを採用。
- 例:

```txt
trigger OnAttack
if event.damage > 0
target current_target
effect draw 1
modifier once_per_turn
end
```

- `DSL -> effects[]`: `parseDslText` + `compileAstToEffects`
- `effects[] -> DSL`: `effectsToDslText`
- 保存結果を再度DSLへ開き、Trigger/Action/Condition/Duration/Limitを保てることをテストする。

### 3. Event Engine

- `CardEffectRuntimeV2.eventBus` を導入。
- 標準イベント:
  - `OnPlay`, `OnAttack`, `OnDirectAttack`, `OnDraw`, `OnDiscard`
  - `OnLeaveField`, `OnReturnHand`, `OnDamage`, `OnPenetrateDamage`
  - `OnTurnStart`, `OnTurnEnd`, `OnEffectAdded`, `OnEffectRemoved`
- `PlayerActionResolver` から主要イベントを送出。

### 4. History System

- `historyStore.push()` で全イベントを時系列保存。
- game/turn/last のカウンタを同時更新。
- 条件式から参照する前提のキーを維持:
  - `event.<name>.count`
  - `owner.<owner>.event.<name>.count`
  - `card.<id>.event.<name>.count`
  - `last.*`

### 5. Effect Instance System

- `effectInstances` にて標準操作を提供:
  - add/remove
  - clone
  - inheritByCard
  - append
  - overwrite
  - activated flag管理

### 6. Runtime Inspector

- `runtimeInspector.snapshot()` で以下を取得:
  - pending effects
  - effect stack
  - registered events
  - activated flags
  - inherited links

### 7. Replay Debugger

- `replayDebugger.seek/step/current` でイベント単位追跡。
- 履歴は `historyStore` を単一参照元とする。

### 8. Card Simulator

- `createCardSimulator(initial)` を導入。
- 編集可能状態:
  - hand, grave, history
  - hp, pp
  - grantedEffects
  - activatedFlags

### 9. Migration

- 旧 `effectDsl`, `effectDslText`, `effectGraph`, `effectBlocks` は `cards.json` から削除済み。
- ローダーは旧フィールドを破棄し、旧DSL v1はライブEffectEngineで拒否する。
- 未移行カードの表示文 `effectText` は保持するが、効果データがないカードは自動発動しない。

### 10. 禁止事項の担保

- ルール層にカード名分岐を入れない。
- ゲーム実行入口は `effects[]` のみを受け付ける。
- DSLエディターのコンパイラ以外でカード効果を別形式へ再解釈しない。

## 実装済み統合ポイント

- `js/game/effects/effectRuntimeV2.js` 新規
- `js/card/cardData.js`
  - `effects[]` のみをカードランタイムへ渡す
  - 旧DSL/Block/Graphフィールドを破棄
- `js/game/auto/playerActionResolver.js`
  - ゲームイベントから `effects[]` を実行
- `dev.html` + `js/dev/cardEffectNodeEditor.js`
  - DSLと可視グラフを同期し、保存時は `effects[]` を生成
- `deck.html`, `deckSelect.html`, `game.html`
  - V2ランタイム読み込み

## Migration Status

- `cd001-001` 黒魔術師、`cd001-002` 黒魔術、`cd001-003` 放浪の魔法使い、`cd001-005` 創世の賢者を `effects[]` へ移行済み。
- 旧データフィールドは122枚すべてから削除済み。
- `effects[]` が未設定のカード能力は新EffectEngineでは自動発動しない。初期8枚のうち未移行の旅路の到達点、生命力操作、紅の魔術師、吸血は既存の明示的な専用処理を維持している。
- その他の未移行カード能力は `effectText` 表示のみで、新EffectEngineでは未実装。複雑な効果はテキストと実ルールを照合して段階移行する。

## Incremental Runtime Adapter

The live `EffectEngine` accepts `dependrap.effects.v1` through a card's `effects` array. Runtime card loading strips the former `effectDsl`, `effectDslText`, `effectGraph`, and `effectBlocks` fields. Legacy DSL v1 programs are rejected by the live `EffectEngine`.

```json
{
  "effects": [
    {
      "trigger": "summon",
      "condition": { "selfHp": { "lte": 5 } },
      "action": { "type": "heal", "amount": 1 },
      "duration": "instant",
      "limit": "once"
    }
  ]
}
```

Supported trigger aliases include summon, cardUse, attack, direct attack, leave, turnStart, turnEnd, damage, heal, PP change, and card draw. Conditions use the existing JSON condition evaluator; numeric action values also accept the existing value expressions, including `thisCard.attack`.

The engine reuses the existing action executor for damage, heal, attack changes, PP gain/consumption, PP floor recovery, shield, draw, card copy, and granted-effect operations. `draw` is a pure draw and does not imply PP recovery. Damage keeps its existing `applyCalculatedDamage` path, so evolution-path modifications, shield/defense resolution, and damage event hooks still apply.

Limits currently supported are `once`, `oncePerTurn`, and `onceWhileOnField`. Usage is stored with the card's synchronized field data; `once` resets when the card enters the deck or grave, while `onceWhileOnField` resets when it leaves the field.

For `grantEffect`, duration must be explicit. `permanent`, `thisTurn`, `untilOwnTurnStart`, and `nextAttack` are supported. `thisTurn` expires after own turn-end effects and immediately before control passes to the opponent. `untilOwnTurnStart` expires at the earliest own-turn-start stage, before turn-start card effects and draw. `nextAttack` currently means the next skill-induced attack only; normal and direct attacks do not consume it. `stackLimit` is reported as unsupported rather than silently changing behavior.

The first two cards that used effect blocks have been migrated to `effects[]`. Other cards without a migrated `effects[]` definition have no automatic ability execution. Their display-only `effectText` remains intact; complex rules and card-specific operations must be migrated explicitly before old scripted branches can be removed.

