# Card Effect System V2 (Node + DSL + Event Runtime)

## 目的

- Scratch風 `effectBlocks` の新規依存を止める。
- 全カードを同一ランタイムで処理し、カード固有分岐を禁止する。
- 段階移行で既存資産 (`effectBlocks`, `effectDsl`) を破壊しない。

## 新しい正規データ

1. `effectGraph` (`dependrap.effectgraph.v2`)
2. `effectDslText` (`dependrap.dsltext.v2`)
3. `effectDsl` (`dependrap.dsl.v1`) ※実行互換のためのコンパイル成果物

保存時は `effectGraph/effectDslText` から `effectDsl` を再生成する。

## サブシステム

### 1. Visual Editor

- ノード種別: `trigger`, `condition`, `target`, `effect`, `modifier`, `end`
- `effectGraph.nodes/edges` で自由接続可能。
- 発動経路は `trigger -> ... -> end` を解析してプレビュー表示。

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

- `DSL -> Graph`: `parseDslText` + `astToGraph`
- `Graph -> DSL`: `graphToAst` + `toDslText`

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

- `migrateLegacyBlocks(effectBlocks)` により
  - `effectBlocks -> dsl.v1 -> ast -> effectGraph/effectDslText`
- 旧データは保持しつつ新データへ変換。

### 10. 禁止事項の担保

- ルール層にカード名分岐を入れない。
- `CardEffectRuntimeV2.resolveCardDsl()` を単一入口にして、
  - `effectGraph` / `effectDslText` / `effectBlocks` / `effectDsl`
  の順で一般化処理する。

## 実装済み統合ポイント

- `js/game/effects/effectRuntimeV2.js` 新規
- `js/card/cardData.js`
  - V2ランタイム経由でDSL解決
  - `effectDslText/effectGraph` 正規化
- `js/game/auto/playerActionResolver.js`
  - `OnPlay/OnLeaveField/OnDirectAttack` のイベント送出
  - V2 DSL解決を優先
- `dev.html` + `js/dev/cardEffectNodeEditor.js`
  - Node/DSL双方向同期UI
  - 発動経路プレビュー
- `deck.html`, `deckSelect.html`, `game.html`
  - V2ランタイム読み込み

## 段階移行フェーズ

1. **Phase A (現在)**
   - 新規カードは `effectGraph + effectDslText` を主に編集
   - 既存カードはロード時に旧形式を自動変換可能
2. **Phase B**
   - `effectBlocks` のUI導線を読み取り専用化
   - バッチ移行で cards.json 全件に `effectGraph/effectDslText` を付与
3. **Phase C**
   - `effectBlocks` の実行依存を削除
   - `effectDsl.v2` 直接実行へ移行
4. **Phase D**
   - 旧形式フィールドをアーカイブ化し、新規保存から除外

