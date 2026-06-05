# DepenDrap_Online 継続解析ログ

---

## Round 2026-06-01 — Auto進行の二重実行（PP/効果）修正

### 原因

- 5/31 追加の `js/game/auto/autoBattleEngine.js` で、オートプレイ時に以下を先行実行していた:
  1. `usePP()` で PP 消費
  2. `applyEffectActions()` でカード効果を即時適用
- その後 `placeCardInZone()` を呼ぶため、`js/game/auto/playerActionResolver.js` のフック（`resolveCardOnPlay`）が通常操作と同じく再度コスト処理・効果処理を実行。
- 結果としてオート時のみ PP 消費/効果発動が二重化。

### 対応内容

- `autoBattleEngine.js` から `usePP()` と `applyEffectActions()` を削除。
- オート側は `canPayCardCost()` で「実行可否の事前判定のみ」を行い、実際のコスト処理・効果解決は `placeCardInZone()` → `PlayerActionResolver` に委譲。
- これにより、通常操作とオート操作で resolver を単一の実行源に統一。

### 再発防止の要点

- **カード使用時の副作用（PP消費・効果解決）は `PlayerActionResolver` に一本化**し、入力系（手動/オート/UI）は「配置要求」だけを行う。
- 新しい入力導線（自動化/ショートカット/AI操作）を追加する際は、`placeCardInZone` 前後で副作用処理を書かないレビュー観点を追加する。
- 回帰観点:
  - 手動配置とオート配置で同じカードを使い、PP減少量と効果発動回数が一致すること
  - `cardCostPolicy`（`normal`/`joker`/`all_in`）ごとに挙動一致すること

---

## Round 2026-06-01 — Effect Engine フェーズ着手（DSL v1 + 骨格実装）

### 実施内容

- `docs/dependrap-dsl-v1.md` を新規作成し、`Trigger / Condition / Effect / Target / Variable` を JSON 仕様として固定化。
- `js/game/effects/effectEngine.js` を新規作成し、以下を分離実装:
  - `TriggerSystem`（イベント一致）
  - `ConditionEvaluator`（真偽評価）
  - `VariableResolver`（式評価）
  - `EffectExecutor`（switch型実行）
  - `execute()`（統合実行）
- `game.html` に `effectEngine.js` を読み込み追加。
- `PlayerActionResolver` を改修し、`effectDsl.format === "dependrap.dsl.v1"` の場合は新エンジンを優先実行（旧DSLは従来フォールバック）。
- `startTurnDraw()` に `onTurnStart` 発火を追加（自陣 attacker/skill）。
- `placeCardInZone(..., \"grave\")` 経由時に `onLeave` を評価できるよう resolver 側フックを追加。

### カード移行（3枚のみ）

- `cd001-001` 黒魔術師
- `cd001-003` 放浪の魔法使い
- `cd001-005` 創世の賢者

上記3枚の `effectDsl` を `dependrap.dsl.v1` へ差し替え。  
122枚一括移行は未実施（段階移行）。

### 注意点 / 次ラウンド課題

- 手動の「直接攻撃」導線では `onDirectAttack` のイベント文脈連携が未統一。現時点はオート導線でのみ `onDirectAttack` を明示実行。
- 継続効果（`on: "continuous"`）は仕様定義と骨格実装まで。イベント購読と永続レイヤーは次段で拡張する。

---

## Round 2026-06-03 — ドラッグ直接攻撃フロー追加

### 追加仕様（実装）

- アタッカー場のカードをドラッグ開始すると、フィールド上半分に半透明オーバーレイを表示。
- 文言は現在ターゲットに応じて動的表示:
  - 相手プレイヤーターゲット時: 相手プレイヤー名
  - PvEターゲット時: モンスター名（例: ゴブリン / シャドウハウンド）
- 上半分へドロップした場合、以下の順で処理:
  1. `onDirectAttack` 効果発動（`PlayerActionResolver.resolveDirectAttack`）
  2. カード攻撃力 + プレイヤー基礎攻撃力で直接攻撃ダメージ適用
  3. 退場時効果を先に発動（`resolveCardOnLeave` 手動実行）
  4. カードを墓地へ移動

### 実装上の整合

- `placeCardInZone(..., \"grave\")` 側の自動 `onLeave` と二重発動しないよう、
  `skipAutoOnLeave` フラグを追加して手動発火時のみ1回化。
- PvEターゲットが討伐済みの場合は直接攻撃を中断し、再選択を促す。

---

## Round 1 — デッキコード / ファーストドロー

### 発見事項

**デッキコード**
- `encodeDeck()` は `v3|id*count,...` 形式で生成（CARD_DB 不要・順序非依存）
- `decodeDeck()` は v3 / v2 / 旧旧形式の3種類に対応
- 旧旧形式（`"2-30"` 等）は `getDeckCardIds()` の順序に依存 → CARD_DB ロード前に呼ぶと空配列
- `initDeckFromCode()` は `localStorage.deckCode` を使用
- **生成側（v3）とデコード側は一致している**
- 問題は「古いコードを持つユーザー」または「CARD_DB ロード前に initDeckFromCode を呼ぶ」ケース

**ファーストドロー無限ループ**
- 原因: `updateFirstDrawPhaseUI()` 内の `retryTakeOut` ロジックが `_firstDrawPhaseStarted = false` にリセットして `startFirstDrawPhase()` を再呼び出し → 無限ループ
- 修正済み: `retryTakeOut` ロジックを削除
- 修正済み: `startFirstDrawPhase()` の `setTimeout(updateFirstDrawPhaseUI)` を削除し `update(true)` に変更

### 未解決

- [ ] `initDeckFromCode()` が CARD_DB ロード前に呼ばれるケースの確認
- [ ] `handleFreshStart()` でデッキが空になる具体的なシナリオの特定
- [ ] `decodeDeck()` の旧旧形式が実際に使われているか（localStorage に古いコードが残っているか）

### 次に調べる場所

- `js/game/game.js` の `initGame()` → `handleFreshStart()` の呼び出しタイミングと CARD_DB ロードの順序
- `js/card/cardData.js` の `loadCardData()` → いつ CARD_DB が確定するか

---

## Round 2 — CARD_DB ロードタイミング

### 発見事項

**initGame() の呼び出し順序（確定）**

```
initGame()
  ├─ await loadCardData()        ← CARD_DB が確定する
  ├─ await loadLevelStats()
  ├─ isReload ?
  │    ├─ false → await handleFreshStart()
  │    │              └─ initDeckFromCode()   ← CARD_DB ロード後 ✅
  │    └─ true  → await handleReload()
  │                   └─ initDeckFromCode()   ← CARD_DB ロード後 ✅
  └─ ...
```

- `initGame()` 内では `loadCardData()` を `await` してから `handleFreshStart` / `handleReload` を呼ぶ
- **通常フローでは CARD_DB ロード前に `initDeckFromCode` が呼ばれることはない**

**旧旧形式コードの実際の危険性**

- `decodeDeck()` の旧旧形式（`"2-30"` 等）は `getDeckCardIds()` → `CARD_DB` に依存
- `initGame()` 経由なら問題ないが、以下の2箇所は **CARD_DB ロードを保証しない**:
  1. `js/ui/chatUI.js` の Remote Reset ハンドラ → `initDeckFromCode()` を直接呼ぶ（CARD_DB ロード確認なし）
  2. `js/game/phases/firstDrawPhase.js` のフォールバック → `initDeckFromCode()` を直接呼ぶ（CARD_DB ロード確認なし）
- ただし旧旧形式コードを持つユーザーは現実的にはほぼいない（v3 が標準）

**handleFreshStart でデッキが空になるシナリオ**

- `localStorage.getItem("deckCode")` が `null` または `"empty"` の場合
  - `initDeckFromCode()` は `false` を返し `deck = []` のまま
  - `matchSetup.deckCode` も参照しない（`handleFreshStart` は `localStorage.deckCode` のみ参照）
- `decodeDeck()` が例外を投げた場合（壊れたコード）
  - `initDeckFromCode()` の catch で `deck = []` にリセット
- **具体的なシナリオ**: デッキ選択画面をスキップして直接 game.html に遷移した場合

**matchSetup.deckCode との不整合**

- `firstDrawPhase.js` のフォールバックは `matchSetup.deckCode` を優先して参照する（より堅牢）
- しかし `handleFreshStart` は `localStorage.deckCode` のみ参照 → 不整合がある
- `matchSetup.deckCode` と `localStorage.deckCode` が異なる場合、`handleFreshStart` は古いコードを使う可能性がある

### 未解決

- [ ] `localStorage.deckCode` と `matchSetup.deckCode` がどのタイミングで書き込まれるか（deckSelect.js / matchSetup.js）
- [ ] `chatUI.js` の Remote Reset ハンドラで旧旧形式コードが来た場合の挙動
- [ ] `handleFreshStart` が `matchSetup.deckCode` を参照しない設計は意図的か

### 次に調べる場所

- `js/game/matchSetup.js` → `matchSetup` と `deckCode` の localStorage 書き込みタイミング
- `js/deck/deckSelect.js` → `deckCode` の書き込みタイミング

---

## Round 3 — matchSetup / deckCode の書き込みタイミング

### 発見事項

**localStorage への書き込みフロー（確定）**

```
deckSelect.js（デッキ選択画面）
  └─ confirmDeckSelect()
       ├─ localStorage.setItem("selectedDeckId", ...)
       └─ localStorage.setItem("lastUsedDeckId:<user>", ...)
       ※ "deckCode" は書かない

matchSetup.js（対戦準備画面）
  └─ startGame()  ← 両者 READY 時に呼ばれる
       ├─ localStorage.setItem("gameRoom", ...)
       ├─ localStorage.setItem("gamePlayerKey", ...)
       ├─ localStorage.setItem("deckCode", deck.code)   ← ここで初めて書かれる
       └─ localStorage.setItem("matchSetup", JSON.stringify({
              role, self, username,
              deckCode: deck.code,   ← 同じ値
              deckId: deck.id
          }))
       → 1秒後に game.html へ遷移
```

**重要な発見: `deckCode` と `matchSetup.deckCode` は常に同じ値**

- `startGame()` で両方を同時に書き込む → 不整合は起きない
- `handleFreshStart` が `localStorage.deckCode` のみ参照するのは問題ない（同値のため）
- ただし `selectedDeck()` が `null` の場合（デッキ未選択）は `deck.code` が `undefined` → `"empty"` として書き込まれる
  - `toggleReady()` に `if (!selectedDeck()) return` ガードがあるため、デッキ未選択では READY にできない ✅

**デッキが空になる唯一の現実的シナリオ**

1. `startGame()` が呼ばれた後、`game.html` 遷移前に `localStorage` がクリアされる（ブラウザのプライベートモード切り替え等）
2. `deckCode` が `"empty"` として書き込まれた場合（デッキが0枚）
   - ガードはあるが `getDeckCardCount()` が 0 を返しても READY は止められない（枚数チェックなし）
3. `decodeDeck()` が例外を投げる壊れたコード（`initDeckFromCode` の catch で `deck = []`）

**deckSelect.js の CARD_DB 依存**

- `loadCardData()` を `.finally()` で呼ぶ → 失敗しても `renderGrid()` は実行される
- `decodeDeck()` を `renderGrid()` / `selectDeck()` 内で呼ぶが、失敗時は `cards = []` で握りつぶす
- インポート時のみ `getDeckCardIds().length === 0` チェックあり → 旧旧形式コードのインポートは防げる

**matchSetup.js の CARD_DB 依存**

- `initMatchSetup()` で `await loadCardData()` を呼ぶ（CARD_DB が空の場合のみ）
- `getDeckCardCount()` → `decodeDeck()` を呼ぶが、v3 形式なら CARD_DB 不要 ✅

### 未解決

- [ ] デッキ枚数が 0 でも READY できてしまう（枚数バリデーションなし）
- [ ] `chatUI.js` の Remote Reset ハンドラで CARD_DB が空の場合の挙動（旧旧形式コードのみ問題）

### 次に調べる場所

- `js/card/damageCalc.js`（エディタで開いている）→ ダメージ計算ロジックの解析

---

## Round 4 — ダメージ計算

### 発見事項

**`applyDamageByRule(snapshot, type, amount)` の設計**

- **純粋関数**: state を直接変更しない。スナップショットを受け取り、適用後の値を返す
- 入力: `{ hp, shield, defstack, defstackMax }` + ダメージタイプ + 量
- 出力: 同じ形の新しいオブジェクト

**ダメージタイプ一覧**

| type | 挙動 |
|------|------|
| `damage` / `direct_attack` | 防御スタック(defstack)を1ずつ削る。0到達時に1ダメージ通過 → defstack をリセット(defstackMax へ) |
| `pierce` | 防御スタック無視。シールド → HP の順に吸収 |
| `fragile` | 防御スタックを直接削る（HP/シールドに影響なし） |
| `arcana` | 防御スタックを削り、余剰分をシールド → HP へ |
| `hp_reduce` | HP を直接減らす（防御・シールド無視） |

**通常ダメージのループ挙動（重要）**

```js
for (let i = 0; i < hits; i++) {
  if (result.defstack > 0) {
    result.defstack -= 1;
  } else {
    passDamage += 1;
    result.defstack = result.defstackMax; // ← 防御リセット
  }
}
```
- 例: defstack=2, defstackMax=2, hits=5 → defstack 2→1→0 で1ダメ通過、リセット後 2→1 で1ダメ通過 → 計2ダメ
- 防御スタックが 0 の状態で攻撃を受けると、1ダメ通過 + 即リセット（defstackMax=0 なら毎回1ダメ通過）

**呼び出し元**

1. `contextMenu.js` — PvP ダメージ適用（後方互換ラッパー経由）
2. `contextMenu.js` — 直接攻撃処理（`applyHit` ヘルパー内）
3. `MonsterCombatSystem.js` — PvE モンスター攻撃（コメントに記載、実際は `addVal` 経由）

**MonsterCombatSystem のダメージ適用方式**

- モンスター → プレイヤー攻撃: `addVal(targetKey, "hp", -result.dmg)` を使用
  - `applyDamageByRule` を**使っていない** → 防御スタック・シールドを無視して HP を直接減らす
  - これは意図的か、または `hp_reduce` 相当の仕様として扱われている可能性がある

### 潜在的な問題

- **MonsterCombatSystem のモンスター攻撃が防御スタックを無視している**
  - `addVal(targetKey, "hp", -dmg)` は `hp_reduce` 相当（防御・シールド無視）
  - PvP の通常ダメージ（防御スタックを削る）と挙動が異なる
  - 意図的な設計かどうか要確認

### 未解決

- [ ] MonsterCombatSystem のモンスター攻撃が防御スタックを無視するのは意図的か
- [ ] `contextMenu.js` の `applyHit` でどのタイプが使われているか（PvP 攻撃フロー）

### 次に調べる場所

- `js/ui/contextMenu.js` の `applyHit` 周辺 → PvP 攻撃の実際のフロー

---

## Round 5 — PvP 攻撃フロー（contextMenu.js）

### 発見事項

**`applyCalculatedDamage(targetOwner, type, subType, amount, isEvoDmg, options)` のフロー**

```
1. 進化の道: 奇撃の道 → 本ダメ前に fragile ダメージ（defstack を直接削る）
2. 進化の道: 背水の道 → direct_attack 時に actualAmount を加算
3. applyDamageByRule() で計算 → s.hp / s.shield / s.defstack を更新
4. 進化の道: 継続の道 → 本ダメ後に再帰的に applyCalculatedDamage を呼ぶ
5. Firebase 同期:
   - 自分が対象 → pushMyStateDebounced()
   - 相手が対象 → sendChangeRequest(..., "_bulk", "set", { hp, shield, defstack })
6. update(true)
```

**プレビュー（ポップアップ）と実際の適用の二重実装**

- `updatePreview()` はポップアップ内でシミュレーションのみ（state 変更なし）
- `applyCalculatedDamage()` が実際の state 変更と Firebase 同期を担う
- 両者で進化の道ロジックが**重複実装**されている → 将来的な不整合リスク

**奇撃の道の実装差異**

- プレビュー: `applyHit("fragile", z)` → `applyDamageByRule` 経由（正しい）
- 実際の適用: `s.defstack = Math.max(0, s.defstack - z)` → 直接変更（`applyDamageByRule` を使わない）
- 結果は同じだが、コードの一貫性がない

**継続の道の再帰呼び出し**

- `applyCalculatedDamage` が `isEvoDmg=true` で自分自身を再帰呼び出し
- `isEvoDmg` フラグで無限再帰を防止している
- 3回目のみ `pierce` 1ダメを追加で呼ぶ（計2回の再帰）

**Firebase 同期方式**

- 自分のステータス変更: `pushMyStateDebounced()` → 自分のパスに全状態を書く
- 相手のステータス変更: `sendChangeRequest(..., "_bulk", "set", {...})` → `pendingChange` 経由
  - `_bulk` キーで hp/shield/defstack をまとめて送信（競合防止）

### 潜在的な問題

- **プレビューと実際の適用でロジックが重複** → 進化の道を追加・変更する際に両方を修正する必要がある
- **奇撃の道の実装が不統一**（プレビューは `applyDamageByRule`、実際は直接変更）
- **継続の道のカウンター (`evoContinuousDmgCount`) がターンをまたいでリセットされるか未確認**

### 未解決

- [ ] `evoContinuousDmgCount` のリセットタイミング（ターン終了時か、ラウンド終了時か）
- [ ] `_bulk` 送信を受け取る側の処理（pendingChange ハンドラ）

### 次に調べる場所

- `evoContinuousDmgCount` のリセット箇所
- `pendingChange` の受信ハンドラ（Firebase watcher 側）

---

## Round 6 — 進化カウンターのリセット / pendingChange ハンドラ

### 発見事項

**`evoContinuousDmgCount` / `evoBackwaterExpGained` のリセットタイミング**

| タイミング | 場所 | 内容 |
|-----------|------|------|
| ターン終了時 | `battlePhase.js` | `evoContinuousDmgCount = 0`, `evoBackwaterExpGained = false` |
| ラウンド終了時（ダイスフェーズ開始） | `dicePhase.js` | 同上 + `evolutionPath = null` |
| ゲームリセット時 | `game.js` の executeReset 周辺 | 同上 |

- **ターン終了時にリセット** → 継続の道・背水の道はターン内限定で正しく動作する ✅
- `_turnDmgHistory` もターン終了時にリセット ✅

**`pendingChange` ハンドラ（roomWatcher.js）**

```
Firebase: rooms/{room}/pendingChange/{opKey} に変更があると発火

処理フロー:
1. req.target !== myKey なら無視
2. req.type === "set":
   - req.key === "_bulk" → Object.assign(s, req.value)  ← hp/shield/defstack を一括更新
   - それ以外 → s[req.key] = req.value
3. req.type === "add" → s[req.key] += req.value
4. 派生ステータス再計算（checkLevelUp, syncDerivedStats, normalizeState, applyLevelStats）
5. pushMyStateDebounced() → 自分のパスに確定値を書く
6. firebaseClient.clearChangeRequest() → pendingChange をクリア
7. update()
```

**`_bulk` 送信の整合性**

- ダメージ適用後: `{ hp, shield, defstack, defstackOverMax }` を送信
- ターン終了時の PP/defstack 変更: `{ pp, defstack }` を送信
- 受信側は `Object.assign` で上書き → 送信していないキーは変更されない ✅

**潜在的な競合問題**

- `sendChangeRequest` は 100ms デバウンス + `_pendingChangeLock` で競合防止
- ただし連続してダメージを与えた場合、最後の値のみ送信される（デバウンスで上書き）
  - 例: 2回連続でダメージを与えると、1回目の変更が Firebase に届かない可能性がある
  - ただし最終的な確定値が送られるため、**最終状態は正しい**

### 未解決

- [ ] `normalizeState()` の内容（roomWatcher.js で呼ばれているが実装未確認）
- [ ] `_getMyStateForSync()` で何が Firebase に送られるか（HIDDEN 化の範囲）

### 次に調べる場所

- `js/game/core.js` の `normalizeState()` と `_getMyStateForSync()`

---

## Round 7 — normalizeState / _getMyStateForSync

### 発見事項

**`_getMyStateForSync()` — Firebase に送る内容**

```js
const { diceValue: _d, deck, ...rest } = myState;
return {
  ...rest,
  deck: Array(deckLength).fill("HIDDEN"),  // デッキ内容を隠蔽
  deckCount: deckLength
};
```

- `diceValue` は送信しない（ダイスフェーズ専用パスで別管理）
- `deck` の内容は `"HIDDEN"` で埋めた配列に置換 → 相手にデッキ内容が見えない
- `deckCount` で枚数だけ共有
- それ以外の全フィールド（hp, shield, defstack, level, exp, evolutionPath, evoContinuousDmgCount 等）は送信される

**`normalizeState()` — 状態の正規化**

- `state.player1` / `state.player2` が不正な場合は `makeCharState()` で再生成
- `deck` が配列でない場合は `[]` にリセット
- `_ready`, `_deckCode` を削除（内部フラグのクリーンアップ）
- `hp`, `shield`, `exp`, `pp` を `[0, max]` にクランプ
- `level` が未定義なら 1 に設定
- `statusBlocks` が配列でない場合は `[]` にリセット
- `matchData` が未定義なら初期値を設定

**重要な発見: `normalizeState` が hp を max にクランプする**

```js
if (v > mx) state[p][k] = mx;
```
- 相手から `_bulk` で hp を受け取った後に `normalizeState()` が呼ばれる
- `hpMax` が正しく設定されていないと、hp が誤ってクランプされる可能性がある
- `_bulk` には `hpMax` が含まれていない → 受信側の `hpMax` が古い値のまま残る

**`syncState.js` と `game.js` の重複実装**

- `syncDerivedStats` が `syncState.js` と `game.js` の両方に定義されている
- `checkLevelUp` も同様に両方に定義されている
- `syncState.js` 側は `window.syncDerivedStats` / `window.checkLevelUp` としてグローバル公開
- `game.js` 側はローカル関数として定義（後から上書きされる可能性）

### 潜在的な問題

- **`_bulk` 送信に `hpMax` が含まれない** → 受信側で `normalizeState()` が hp を誤クランプする可能性
  - ただし `hpMax` は通常 20 固定（`makeCharState` のデフォルト）なので実害は少ない
- **`syncDerivedStats` / `checkLevelUp` の重複定義** → どちらが実際に使われるか実行順序依存

### 全体サマリー（Round 1〜7）

**確定した問題**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 1 | ファーストドロー無限ループ | 修正済み | firstDrawPhase.js |
| 2 | デッキ枚数 0 でも READY 可能 | 低 | matchSetup.js |
| 3 | プレビューと実際の適用でロジック重複 | 中 | contextMenu.js |
| 4 | 奇撃の道の実装が不統一 | 低 | contextMenu.js |
| 5 | MonsterCombatSystem が防御スタックを無視 | 要確認 | MonsterCombatSystem.js |
| 6 | syncDerivedStats / checkLevelUp の重複定義 | 低 | syncState.js / game.js |
| 7 | _bulk 送信に hpMax が含まれない | 低 | contextMenu.js |

**設計上の特徴（意図的）**

- `applyDamageByRule` は純粋関数 → テスト可能な設計
- `pendingChange` の `_bulk` 送信で競合を防止
- デッキ内容を `HIDDEN` で隠蔽 → セキュリティ考慮あり
- 進化カウンターはターン終了時にリセット → 正しい


---

## Round 8 — PvE システム全体（MonsterCombatSystem / MonsterManager / pvpveWatcher）

### 修正済み（前回コードレビューより）

| 修正内容 | ファイル |
|---------|---------|
| `statusUI.js` のデッドコード `getHandLimit` ローカル関数を削除 | `statusUI.js` |
| `startFirstDrawPhase` の再試行ループに上限3回を追加 | `firstDrawPhase.js` |

### 発見事項

**MonsterCombatSystem のモンスター攻撃が防御スタックを無視する件（Round 4 未解決）**

- `monsterAttackPlayer()` → `addVal(targetKey, "hp", -result.dmg)` を使用
- `addVal` の `hp` 処理は `Math.min/max` クランプのみ → **防御スタック・シールドを完全無視**
- これは **意図的な設計**と判断できる根拠:
  - コメントに「既存のPvP処理を一切変更しない」と明記
  - モンスター攻撃は `hp_reduce` 相当として扱う設計思想
  - `MonsterManager.monsterAttack()` が返す `dmg` は生の攻撃力（防御計算なし）

**MonsterManager の設計**

- 6スロット固定（`SLOT_COUNT = 6`）
- ラウンド1: 全スロットにランダム配置
- ラウンド2以降: 討伐済みスロットのみ再配置（生き残りは継続）
- モンスター攻撃は行動パターンから重み付きランダム選択
  - `attack_double` → ダメージ 1.5倍（切り捨て）
- 撤退追撃: `retreatCountdown` ターン分、毎ターン開始時に 1.5倍ダメージ

**pvpveWatcher の設計（モンキーパッチ廃止済み）**

- 旧実装: `window.update` / `window.handleTurnEnd` をモンキーパッチ → 再帰ループリスクで廃止
- 現実装: `window._afterUpdateHooks` / `window._afterTurnEndHooks` / `window._beforeTurnEndHooks` を使用
- ラウンド変更検知: `_lastRoundSeen` と `m.round` を比較 → **先攻プレイヤーのみ** `onRoundStart` を実行（競合防止）

**Firebase 同期フロー（PvE）**

```
rooms/{room}/pvpve
  ├─ monsters: MonsterManager.serialize()  ← スロット状態
  └─ targets:  BattleTargetSystem.serialize()  ← 各プレイヤーのターゲット
```

- 書き込み: `MonsterCombatSystem._syncMonsterState()` → 先攻プレイヤーが書く
- 読み込み: `pvpveWatcher` の `value` リスナー → `applyRemoteState()` で両プレイヤーに反映

**BattleTargetSystem の設計**

- ターゲット: `"player"` または `{ slotIndex: number }`
- 変更可能タイミング: ターン開始時のみ（`_canChange` フラグ）
- 討伐直後は即時変更可能（`_justDefeated` フラグ）
- `lockTarget()` はターン開始後の最初のアクション後に呼ばれる（`_onBeforeTurnEnd` 内）

**ターン進行とモンスター攻撃のタイミング**

```
ターン終了ボタン押下
  └─ _onBeforeTurnEnd (pvpveWatcher)
       ├─ processTurnEndMonsterActions()  ← 後攻モンスターが攻撃
       └─ lockTarget(me)

  └─ battlePhase.js の handleTurnEnd()
       └─ Firebase に matchData を書き込み → ターン交代

  └─ _onAfterTurnEnd (pvpveWatcher)
       ├─ BattleTargetSystem.onTurnStart(nextPlayer)
       └─ processTurnStartMonsterActions()  ← 先攻モンスターが攻撃
```

### 潜在的な問題

- **モンスター攻撃が防御スタックを無視** → 意図的だが、プレイヤーへの説明が必要
- **先攻プレイヤーのみ `onRoundStart` を実行** → 後攻プレイヤーは Firebase 経由で状態を受け取る。ネットワーク遅延時に後攻側の表示が遅れる可能性
- **`_onBeforeTurnEnd` と `_onAfterTurnEnd` の実行順序** → `_beforeTurnEndHooks` が `battlePhase.js` の `handleTurnEnd` より前に実行されることが前提。フック登録順序に依存

### 未解決

- [ ] `_beforeTurnEndHooks` の実行タイミングが `handleTurnEnd` より確実に前か確認
- [ ] モンスター攻撃ダメージのログが `addGameLog` で2回出力されていないか（MonsterManager と MonsterCombatSystem の両方でログを出す）

### 次に調べる場所

- `js/phases/battlePhase.js` → `handleTurnEnd` と `_beforeTurnEndHooks` の実行順序
- `js/watchers/phaseWatcher.js` → matchData の Firebase 監視フロー

---

## Round 9 — battlePhase / phaseWatcher

### 発見事項

**`handleTurnEnd` と `_beforeTurnEndHooks` の実行順序（確定）**

```
handleTurnEnd()
  ├─ 手札枚数チェック（超過なら return）
  ├─ _beforeTurnEndHooks を順番に実行  ← pvpveWatcher._onBeforeTurnEnd がここで走る
  │    ├─ processTurnEndMonsterActions()  ← 後攻モンスター攻撃
  │    ├─ BattleTargetSystem.lockTarget(me)
  │    └─ 成長スライム経験値付与
  ├─ turnPlayer / turn / round を更新
  ├─ Firebase に matchData を書き込み（await）
  ├─ Firebase に myState を書き込み（await）
  ├─ update()
  └─ _afterTurnEndHooks を順番に実行  ← pvpveWatcher._onAfterTurnEnd がここで走る
       ├─ BattleTargetSystem.onTurnStart(nextPlayer)
       ├─ processTurnStartMonsterActions()  ← 先攻モンスター攻撃
       └─ MonsterUI.showTargetChangeButton()（自分のターンなら）
```

- **`_beforeTurnEndHooks` は Firebase 書き込みより前に実行される** ✅
  - モンスター攻撃（`addVal` 経由）→ `pushMyStateDebounced()` が走る → Firebase 書き込みと競合する可能性
  - ただし `handleTurnEnd` の `await firebaseClient.writeMyState()` が後から上書きするため最終的には正しい値が書かれる
- **`_afterTurnEndHooks` は Firebase 書き込みと `update()` の後に実行される** ✅
  - `processTurnStartMonsterActions()` が `addVal` を呼ぶ → `pushMyStateDebounced()` が走る → 正しいタイミング

**phaseWatcher の matchData 監視フロー**

```
Firebase: rooms/{room}/matchData に変更があると発火

処理フロー:
1. リセット検知: incoming.status が "ready_check" / "setup_dice" かつ現在が playing → executeReset(false)
2. winner の stale チェック:
   - winnerSetAt < _gameStartedAt → winner を除いて適用（古い勝利判定を無視）
   - _resultDismissed → 同上
3. state.matchData を incoming で上書き（マージ）
4. update()
```

**stale winner チェックの設計**

- `_gameStartedAt` はゲーム開始時に記録されるタイムスタンプ
- Firebase に残った古い winner データを無視するための仕組み
- `executeReset(false)` の引数 `false` は「Firebase への再書き込みをしない」を意味する（ローカルリセットのみ）

**diceWatcher の設計**

- `setup_dice` フェーズ以外は無視（早期リターン）
- `playerDice` ノードを監視 → `state.player1.diceValue` / `state.player2.diceValue` を更新
- 相手のダイス表示をアニメーション付きで更新（DOM 直接操作）
- 重複リスナー防止: `playerDiceWatcherUnsubscribe` を呼んでから再登録

**watcherRegistry の設計**

- `_activeWatchers` オブジェクトで名前→解除関数を管理
- `registerWatcher(name, fn)`: 既存の同名ウォッチャーを解除してから登録
- `clearAllWatchers()`: 全ウォッチャーを一括解除（ゲームリセット時に使用）
- phaseWatcher / diceWatcher / roomWatcher が登録される

### 潜在的な問題

- **`_beforeTurnEndHooks` でのモンスター攻撃と `handleTurnEnd` の Firebase 書き込みの競合**
  - `addVal` → `pushMyStateDebounced()` が走るが、直後に `writeMyState()` が上書きするため最終的には正しい
  - ただし `pushMyStateDebounced` の 300ms デバウンス中に `writeMyState` が完了すると、デバウンスが後から古い値を書く可能性がある
  - **実害**: モンスター攻撃ダメージが Firebase に反映されない瞬間がある（最終的には正しくなる）

- **`executeReset(false)` のリセット後に watcher が再設定されるか**
  - コメントに「executeReset 内で更新と watcher 再設定が行われる」とあるが、`false` 引数でローカルリセットのみの場合に watcher が正しく再設定されるか要確認

### 未解決

- [ ] `_beforeTurnEndHooks` でのモンスター攻撃 → `pushMyStateDebounced` と `writeMyState` の競合が実際に問題になるか
- [ ] `executeReset(false)` 後の watcher 再設定フロー（game.js の executeReset 実装）

### 次に調べる場所

- `js/game/game.js` の `executeReset()` → リセット後の watcher 再設定フロー
- `js/game/core.js` の `addVal()` → `pushMyStateDebounced` の呼び出しタイミング

---

## Round 10 — executeReset / addVal / ログ二重出力

### 発見事項

**モンスター攻撃ログの二重出力問題（Round 8 未解決）**

`monsterAttackPlayer()` の呼び出しチェーン:

```
MonsterCombatSystem.monsterAttackPlayer(slotIndex, targetKey)
  ├─ MonsterManager.monsterAttack(slotIndex, targetPlayer)
  │    └─ addGameLog(`[MONSTER] ${def.name} の「${chosen.label}」→ ${targetPlayer} に ${dmg} ダメージ`)
  │         ← MonsterManager 側でログ出力
  └─ addVal(targetKey, "hp", -result.dmg)
  └─ addGameLog(`[MONSTER] ${targetKey} が ${result.dmg} ダメージを受けた`)
       ← MonsterCombatSystem 側でもログ出力
```

- **ログが2回出力される**: 攻撃宣言ログ（MonsterManager）+ ダメージ受けログ（MonsterCombatSystem）
- これは意図的な設計の可能性もあるが、同じ攻撃に対して2行出るのは冗長

**撤退追撃のログ出力**

```
MonsterCombatSystem.processTurnStartMonsterActions()
  └─ MonsterManager.processRetreatAttacks(targetPlayer)
       └─ addGameLog(`[MONSTER] ${def?.name} の背後攻撃！ ${targetPlayer} に ${dmg} ダメージ`)
            ← MonsterManager 側でログ出力
  └─ addVal(playerKey, "hp", -dmg)
       ← ログなし（MonsterCombatSystem 側はログを出さない）
```

- 撤退追撃は MonsterManager 側のみログ → 通常攻撃と不統一

**BattleTargetSystem の serialize/deserialize の問題**

```js
serialize() {
  return {
    targets: { ..._targets },  // "player" | { slotIndex: number }
    canChange: { ..._canChange }
  };
}
```

- `_targets` の値が `{ slotIndex: number }` の場合、Firebase に保存・復元できる ✅
- ただし `_justDefeated` は serialize されない → Firebase 同期後に討伐直後フラグが失われる
  - 影響: 相手側で討伐が起きた場合、自分側の `_justDefeated` が更新されない
  - ただし `_justDefeated` は自分のターン内でのみ意味を持つため、実害は少ない

**pvpveWatcher のフック重複登録防止**

```js
if (!window._afterUpdateHooks.includes(_onAfterUpdate)) {
  window._afterUpdateHooks.push(_onAfterUpdate);
}
```

- 関数参照の同一性チェックで重複防止 ✅
- `startPvpveWatcher()` が複数回呼ばれても安全

**`_onAfterUpdate` でのラウンド変更検知**

```js
if (round !== _lastRoundSeen) {
  _lastRoundSeen = round;
  const me = window.myRole || "player1";
  if (me === (m.firstPlayer || "player1")) {
    window.MonsterCombatSystem?.onRoundStart(round);  // 先攻プレイヤーのみ実行
  }
}
```

- `update()` が呼ばれるたびに `_lastRoundSeen` と比較 → ラウンド変更を検知
- **問題**: `update()` は頻繁に呼ばれる。`_lastRoundSeen` の初期値が 0 なので、ゲーム開始時（round=1）に必ず `onRoundStart(1)` が実行される ✅
- **問題**: `_lastRoundSeen` は `pvpveWatcher` のクロージャ変数 → `stopPvpveWatcher()` を呼んでも `_lastRoundSeen` はリセットされない
  - `startPvpveWatcher()` を再呼び出しすると `_lastRoundSeen = 0` にリセットされる（変数宣言が IIFE 内のため）
  - ただし `stopPvpveWatcher()` は `_pvpveRef` と `_pvpveListener` のみクリアする → `_lastRoundSeen` は残る
  - ゲームリセット後に `startPvpveWatcher()` を再呼び出しすれば問題ない

### 全体サマリー更新（Round 1〜10）

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 8 | モンスター攻撃ログが2行出力される | 低 | MonsterManager.js / MonsterCombatSystem.js |
| 9 | 撤退追撃のログ出力が通常攻撃と不統一 | 低 | MonsterCombatSystem.js |
| 10 | `_beforeTurnEndHooks` でのモンスター攻撃と `writeMyState` の競合 | 低〜中 | battlePhase.js / MonsterCombatSystem.js |
| 11 | `BattleTargetSystem._justDefeated` が Firebase 同期されない | 低 | BattleTargetSystem.js |

**設計上の特徴（意図的）**

- `_beforeTurnEndHooks` → Firebase 書き込み → `_afterTurnEndHooks` の順序は正しく設計されている
- phaseWatcher の stale winner チェックでゲームリセット後の誤判定を防止
- watcherRegistry で二重登録を防止
- pvpveWatcher のフック重複登録防止（関数参照チェック）

### 未解決

- [ ] `executeReset()` の実装（game.js）→ watcher 再設定フロー
- [ ] `addVal()` の実装（core.js）→ `pushMyStateDebounced` の呼び出しタイミング
- [ ] モンスター攻撃ログ2行出力が意図的かどうか

### 次に調べる場所

- `js/game/game.js` の `executeReset()` → リセット後の watcher 再設定フロー
- `js/game/core.js` の `addVal()` → `pushMyStateDebounced` の呼び出しタイミング


---

## Round 11 — PP増減ボタン / デッキコード統一 / 接続安定化（修正記録）

### 修正内容

**PP増減ボタンが機能しない**

- **原因**: `fieldStatusPanel` が `#fieldContent`（フィールド座標系）に配置されていた
  - `#fieldContent` は `transform: translate(${panX}px, ${panY}px) scale(${zoom})` で変換される
  - ズームが 0.3 程度の場合、ボタンは画面上で極小サイズになりクリックが届かない
- **修正**: `updateFieldStatusPanels()` を `#field`（固定座標系）に配置し直し、`position: fixed` で画面に固定
  - 自分のパネル: 左下固定（`left: 16px; bottom: 16px`）
  - 相手のパネル: 右上固定（`right: 16px; top: 80px`）、`pointer-events: none`

**デッキコードのロジック統一化**

- **問題**: `initDeckFromCode()` が `localStorage.deckCode` のみ参照し、`matchSetup.deckCode` を無視
  - `firstDrawPhase.js` だけが独自の二段階フォールバックを持っていた（不統一）
- **修正 1**: `initDeckFromCode()` を `matchSetup.deckCode` 優先・`localStorage.deckCode` フォールバックに変更
- **修正 2**: `firstDrawPhase.js` の独自フォールバックを削除し、`initDeckFromCode()` 一本化

**ゲーム中の接続安定化**

- **問題**: 切断→再接続時に `onDisconnect().remove()` でプレイヤーノードが削除されるが再登録されない。`connected`/`disconnected` ハンドラ未実装。書き込みリトライなし。
- **修正 1**: `roomWatcher.js` に再接続ハンドラを追加
  - `disconnected` → フラグ立て、`connected` → 1.5秒後に players 再登録・onDisconnect 再設定・状態再送信
  - watcher が死んでいれば `setupRoomWatcher()` を再呼び出し
- **修正 2**: `firebase-client.js` の切断ログを「接続中→切断時のみ」に変更
- **修正 3**: `writeMyState` / `writeMatchData` に最大3回リトライを追加（500ms × attempt 間隔）

### 残存する潜在的問題

- `executeReset()` の watcher 再設定フロー（未調査）
- `addVal()` の `pushMyStateDebounced` と `writeMyState` の競合（低リスク）
- モンスター攻撃ログ2行出力（意図的の可能性あり）

---

## Round 12 — Monster システム実仕様（battle.js / monster 関連）

> `battle.js` は存在しない。モンスター関連は以下5ファイルで完結。

---

### Monster Object Structure

**定義（`MONSTER_DEFINITIONS` / `monsterData.js`）**
```js
{
  id: string,           // "goblin" 等
  name: string,
  emoji: string,
  hp: number,
  atk: number,
  initiative: "先攻" | "後攻",
  traits: [{ id, label, description, onDamageReceived?(dmg, ctx), onDefeat?(ctx) }],
  actions: [{ type: "attack" | "attack_double" | "attack_all", label, weight }],
  expReward: number
}
```

**スロット状態（`MonsterManager` 内部 `_slots[i]`）**
```js
{
  slotIndex: number,
  monsterId: string,
  currentHp: number,
  maxHp: number,
  hitCountThisTurn: number,   // ターン内被弾カウント（traits 判定用）
  retreatCountdown: number    // 撤退追撃残りターン数
} | null  // null = 討伐済み
```

---

### Summon Flow

```
onRoundStart(round)  ← pvpveWatcher._onAfterUpdate() が先攻プレイヤーのみ呼ぶ
  └─ MonsterManager.initRound(round)
       ├─ round === 1: 全6スロットにランダム配置（重複なし）
       ├─ round >= 2: _defeatedSlots のみ再配置（生存スロットは継続）
       └─ _defeatedSlots.clear()
  └─ _syncMonsterState()  → Firebase rooms/{room}/pvpve/monsters に set
  └─ pvpveWatcher Firebase リスナー → applyRemoteState() → 後攻側に反映
```

---

### Attack Flow

**プレイヤー → モンスター**
```
playerAttackMonster(attackerKey, slotIndex, rawDmg)
  └─ MonsterManager.dealDamage(slotIndex, rawDmg, attacker)
       ├─ slot.hitCountThisTurn++
       ├─ traits.onDamageReceived(dmg, { attacker, hitCountThisTurn }) で dmg 変換
       ├─ slot.currentHp -= dmg
       └─ currentHp <= 0 → _defeatMonster()
  └─ result.defeated → _handleDefeat()
  └─ _syncMonsterState()
```

**モンスター → プレイヤー（ターン終了時・後攻）**
```
_onBeforeTurnEnd()  ← battlePhase.handleTurnEnd() の前フック
  └─ processTurnEndMonsterActions()
       └─ initiative === "後攻" のスロットのみ
            └─ monsterAttackPlayer(slotIndex, playerKey)
                 ├─ MonsterManager.monsterAttack() → 重み付きランダムで action 選択
                 │    attack_double: dmg = floor(atk * 1.5)
                 │    attack_all: 定義あるが MonsterCombatSystem 側で未処理（dmg 計算のみ）
                 └─ addVal(targetKey, "hp", -dmg)  ← 防御スタック・シールド無視（hp_reduce 相当）
```

**モンスター → プレイヤー（ターン開始時・先攻）**
```
_onAfterTurnEnd()  ← battlePhase.handleTurnEnd() の後フック
  └─ processTurnStartMonsterActions()
       ├─ initiative === "先攻" のスロット → monsterAttackPlayer()
       └─ MonsterManager.processRetreatAttacks(playerKey)
            ├─ retreatCountdown > 0 のスロット: countdown-- → dmg = ceil(atk * 1.5)
            └─ addVal(playerKey, "hp", -dmg)
```

---

### Death Flow

```
MonsterManager._defeatMonster(slotIndex, killer)
  ├─ traits.onDefeat({ killer, slotIndex }) 実行
  │    growth_slime: window._slimeGrowthRoundsLeft = 3, _slimeGrowthKiller = killer
  ├─ _defeatedSlots.add(slotIndex)
  └─ _slots[slotIndex] = null
  → { defeated: true, expReward, killer, monsterId } を返す

MonsterCombatSystem._handleDefeat(slotIndex, killer, result)
  ├─ addVal(killer, "exp", expReward)
  ├─ addVal(killer, "pp", 2)
  └─ BattleTargetSystem.onMonsterDefeated(killer)  → _justDefeated = true（即時ターゲット変更許可）
```

---

### Render Flow

```
pvpveWatcher._onAfterUpdate()  ← update() 後フック
  └─ MonsterUI.render()
       ├─ status !== "playing" → #monsterPanel を非表示
       ├─ MonsterManager.getAllSlots() でスロット一覧取得
       ├─ slot === null → 討伐済み表示（💀）
       └─ slot あり → HP バー・initiative バッジ・trait バッジ・ラストヒット圏表示
            ├─ isTargeted: BattleTargetSystem.getTarget(me).slotIndex === i
            └─ click → canChangeTarget(me) なら即 setTarget、なければ _showTargetSelectPanel()
  └─ MonsterUI.renderTargetBadge()
       └─ #currentTargetBadge に現在のターゲット名を表示

Firebase pvpve 変更時:
  pvpveWatcher Firebase リスナー → applyRemoteState(data)
    ├─ MonsterManager.deserialize(data.monsters)
    └─ BattleTargetSystem.deserialize(data.targets)
  → _renderMonsterUI() → MonsterUI.render() + renderTargetBadge()
```

---

### 既知の未実装・問題点

| 項目 | 内容 |
|------|------|
| `attack_all` | `monsterData.js` に定義あり（古代竜）、`MonsterCombatSystem` で未処理（通常 atk として扱われる） |
| ログ2行出力 | `MonsterManager.monsterAttack()` と `MonsterCombatSystem.monsterAttackPlayer()` の両方で `addGameLog` を呼ぶ |
| `_justDefeated` 非同期 | `BattleTargetSystem.serialize()` に含まれないため Firebase 同期後に失われる |
| `setRetreatCountdown` | 定義はあるが呼び出し元が存在しない（撤退追撃は発動しない） |

---

## Round 13 — ゲーム画面モンスター関連コード実仕様

> 「モンスター」= PvE の MonsterManager スロット（Round 12 で整理済み）
> 「カード」= フィールド上の DOM カード要素（手札・ゾーン配置）
> 両者は**完全に別系統**。カードに hp/attack フィールドは存在しない。

---

### A. カードのデータ構造（実仕様）

**静的定義（`cards.json` → `CARD_DB`）**

```js
{
  id: string,
  name: string,
  attribute: string,   // "近接" 等（デフォルト "近接"）
  type: string,        // "アタッカー" | "スキル"（デフォルト "アタッカー"）
  tags: string[],      // normalizeCardTags() で正規化
  image: string        // normalizeCardImagePath() で正規化
}
```

- `cost / attack / hp / maxHp / owner / controller / tribe / rarity / keywords / status flags` は **cards.json に定義なし**
- `getCardData(id)` は CARD_INDEX から返すだけ。runtime 追加フィールドなし

**DOM カード要素（`createCard(id)`）**

```js
wrapper.dataset.id          // カードID
wrapper.dataset.instanceId  // 一意ID（nextCardInstanceId()）
wrapper.dataset.visibility  // "both" | "self" | "none" | "opponent"
wrapper.dataset.owner       // "player1" | "player2"
// runtime で追加されるもの:
wrapper.dataset.x / .y      // フィールド座標
wrapper.dataset.zoneType    // "attacker" | "skill" | "grave"（ゾーン配置時）
wrapper.dataset.zoneOwner   // ゾーン配置時
wrapper.dataset.zoneOrder   // ゾーン内順序
wrapper.dataset.handOrder   // 手札整列順
wrapper.dataset.isTemp      // "true" = 一時カード
wrapper.dataset.firstDrawReturned  // ファーストドロー返却済みフラグ
```

- clone/copy は `createCard(card.dataset.id)` で新規生成（cloneNode は使わない）
- 初期化タイミング: `takeOut()` 呼び出し時に生成・フィールドに配置

---

### B. 召喚仕様（カードをゾーンに出す）

**フロー**

```
ドラッグ drop → battleZoneHitTypeAt(centerX, centerY, owner)
  ├─ zoneHit === "attacker" | "skill"
  │    └─ showBattleZonePpCostModal({ zoneType, cardEl, owner })
  │         ├─ PP消費量をユーザーが入力（0〜2、上限は state[owner].pp）
  │         ├─ st.pp -= cost  ← state を直接変更
  │         └─ placeCardInZone(cardEl, owner, zoneType)
  └─ zoneHit === "grave"
       └─ placeCardInZone(cardEl, owner, "grave")  ← PP消費なし
```

**placeCardInZone(card, owner, type)**
- `clearZoneMarker(card)` → 既存ゾーン属性を削除
- `card.dataset.visibility = "both"` → 強制公開
- `card.dataset.zoneType / zoneOwner / zoneOrder` を付与
- attacker に複数枚ある場合: 既存カードの zoneMarker を clearして重ねる（上限なし）

**制限**
- ゾーン上限: **なし**（コード上に ZONE_LIMIT 定義なし）
- summon helper 関数: なし（`placeCardInZone` が直接 dataset を変更）
- summon effect / animation: なし
- token 生成: なし

---

### C. 攻撃仕様（カード間）

**カード間の攻撃処理は存在しない。**

- `contextMenu.js` の `applyCalculatedDamage` はプレイヤー HP/shield/defstack への直接ダメージ
- カード同士の戦闘（attack/retaliation/simultaneous damage）は**未実装**
- attack 済みフラグ、疾走/速攻、対象選択ロジックは**存在しない**
- ゾーンに出したカードは「アタッカー場にある」という視覚的状態のみ

---

### D. 死亡処理（カード）

**hp<=0 判定・destroy・graveyard 移動**

```
contextMenu.js の右クリックメニュー「墓地へ送る」
  └─ placeCardInZone(card, owner, "grave")
  └─ organizeBattleZones()

overlayUI.js「全カードを墓地へ」ボタン
  └─ field.querySelectorAll(".card:not(.deckObject)") を全て placeCardInZone(c, owner, "grave")
```

- hp<=0 による自動死亡判定: **なし**
- lastword / deathrattle: **なし**
- simultaneous death: **なし**
- 死亡予約キュー: **なし**
- effect 解決中の field 変更: **なし**（全て即時 DOM 操作）

---

### E. 継続効果・状態異常（カード）

- buff / debuff / aura / silence / shield / poison / freeze: **カードには存在しない**
- プレイヤーステータスの buff は `evolutionPath`（進化の道）のみ
- turn end cleanup: `evoContinuousDmgCount = 0` / `evoBackwaterExpGained = false` のみ

---

### F. Render / UI

```
update() → renderUI() → updateFieldStatusPanels()  ← PP/手札パネル（fixed）
         → updateBattleZoneUI()  ← ゾーン枠の位置・枚数表示
         → organizeBattleZones()  ← カードをアンカー座標に整列
```

- render 中の state 変更: **なし**（renderUI は純粋描画）
- UI が直接 game state を触る箇所: `showBattleZonePpCostModal` の `st.pp -= cost` のみ

---

### G. 主要関数

| 関数 | 場所 | 役割 |
|------|------|------|
| `placeCardInZone(card, owner, type)` | cardManager.js | ゾーン配置（summon相当） |
| `clearZoneMarker(card)` | cardManager.js | ゾーン属性削除 |
| `organizeBattleZones()` | cardManager.js | 全ゾーンカードをアンカーへ整列 |
| `showBattleZonePpCostModal()` | cardManager.js | PP消費モーダル |
| `applyCalculatedDamage()` | contextMenu.js | プレイヤーへのダメージ適用 |
| `createCard(id)` | cardManager.js | カードDOM生成 |

---

### H. 危険箇所

| 箇所 | 内容 |
|------|------|
| `showBattleZonePpCostModal` | `state[owner].pp -= cost` を直接変更。`pushMyStateDebounced()` は呼ぶが `addVal()` を経由しない |
| `placeCardInZone` の attacker 上限なし | 複数枚 attacker に積める。視覚的に重なるだけ |
| `organizeBattleZones` の attacker 処理 | `cards.length > 1` の場合、先頭カードの zoneMarker を clearして手札扱いに戻す（意図的か不明） |

---

### I. 未使用・形骸化

| 項目 | 内容 |
|------|------|
| `attack_all` action | monsterData.js に定義、MonsterCombatSystem で未処理 |
| `setRetreatCountdown()` | 呼び出し元なし（撤退追撃は発動しない） |
| `beginZoneHoverCardDrag` | ゾーンスタック検査パネルのドラッグ（`showZoneStackInspectHover` は削除済み） |
| event/effect queue | 存在しない。全て即時解決 |
| summon trigger / death trigger | 存在しない |

---

## Round 14 — organizeBattleZones の attacker 処理 / damageCalc.js / PP 直接変更

### A. organizeBattleZones の attacker 処理（Round 13 未解決）

**問題の箇所**

```js
if (type === "attacker" && cards.length > 1) {
  cards.slice(0, -1).forEach((c) => clearZoneMarker(c));
}
const list = getZoneCards(owner, type);  // ← clearZoneMarker 後に再取得
```

**`clearZoneMarker` の実装**

```js
function clearZoneMarker(card) {
  delete card.dataset.zoneType;
  delete card.dataset.zoneOwner;
  delete card.dataset.zoneOrder;
}
```

- `zoneType` / `zoneOwner` / `zoneOrder` を削除するだけ。DOM からカードを除去しない。
- `getZoneCards` は `zoneType === type` でフィルタするため、clearZoneMarker 後は `list` に含まれない。
- つまり「手札に戻る」のではなく、**ゾーン属性が消えてフィールド上に浮いた状態**になる。

**実際の挙動（確定）**

1. attacker に2枚以上ある場合、`organizeBattleZones` が呼ばれるたびに先頭〜末尾-1枚の `zoneType` が消える
2. それらのカードは `getZoneCards("attacker")` に含まれなくなる → 整列対象外
3. ただし DOM 上には残り、`dataset.x / y` も更新されない → 前回の座標に留まる
4. `organizeHands` が呼ばれると `zoneType` のないカードは手札として扱われる可能性がある

**`placeCardInZone` の attacker 処理との矛盾**

```js
// placeCardInZone 内（attacker に出す時）
const prev = getZoneCards(owner, "attacker").filter((c) => c !== card);
prev.forEach((c, i) => {
  clearZoneMarker(c);          // ← 既存カードのゾーン属性を消す
  const nx = a.x + 30 + (i * 20);
  const ny = a.y + 30 + (i * 20);
  c.style.left = `${nx}px`;   // ← ずらして配置
  c.dataset.x = nx;
  c.dataset.y = ny;
});
card.dataset.zoneType = type;  // ← 新しいカードだけ zoneType を付与
```

- `placeCardInZone` は「attacker に出す時、既存カードの zoneType を消してずらす」設計
- つまり **attacker ゾーンには常に1枚しか zoneType を持つカードが存在しない**
- `organizeBattleZones` の `cards.length > 1` チェックは **通常は発動しない**（placeCardInZone が先に処理するため）
- 発動するのは `restoreFieldCards()` 等でゾーン状態を復元した際に複数枚が同じ zoneType を持つ場合のみ

**結論: 意図的な設計**

- attacker は「スタック」ではなく「最後に出したカードが有効」という仕様
- `placeCardInZone` が主処理、`organizeBattleZones` の `cards.length > 1` チェックは復元時の安全弁
- 「先頭カードを手札扱いに戻す」ではなく「ゾーン属性を消してフィールド上に浮かせる」が正確
- ただし浮いたカードの扱いが不明確（`organizeHands` が手札として拾う可能性あり）

---

### B. damageCalc.js の解析

**ファイルの役割**

- `applyDamageByRule` / `getDamageTypeLabel` / `getDamageTypeDescription` の3関数のみ
- Round 4 で解析済みの `applyDamageByRule` の**正式な実装ファイル**
- `contextMenu.js` の同名関数はこのファイルから移植・統一されたもの

**`applyDamageByRule` の実装（確定）**

| type | 挙動 |
|------|------|
| `hp_reduce` | `hp -= hits`（防御・シールド完全無視） |
| `fragile` | `defstack -= hits`（HP/シールドに影響なし） |
| `pierce` | シールド → HP の順に吸収（defstack 無視） |
| `arcana` | `defstack` を削り、余剰分をシールド → HP へ |
| `damage` / `direct_attack` / default | defstack を1ずつ削り、0到達時に1ダメ通過 + defstackMax へリセット |

**`arcana` の挙動（詳細）**

```js
const brokenDef = Math.min(result.defstack, hits);
result.defstack -= brokenDef;
applyToShieldAndHp(hits - brokenDef);
```

- `hits <= defstack` の場合: defstack を削るだけ（HP/シールドに影響なし）
- `hits > defstack` の場合: defstack を 0 にして、余剰分（`hits - defstack`）をシールド → HP へ
- `damage` と異なり、defstack を超えた分が**全て**シールド/HP に通る（ループなし）

**`damage` vs `arcana` の比較（例: defstack=2, defstackMax=2, hits=5）**

| type | 結果 |
|------|------|
| `damage` | defstack 2→1→0(1ダメ通過+リセット)→2→1→0(1ダメ通過+リセット) → 2ダメ |
| `arcana` | defstack 2→0(余剰3をシールド/HPへ) → 3ダメ |

- `arcana` は `damage` より**常に多くのダメージが通る**（defstack が残っている場合）

**`getDamageTypeDescription` の `subType` 対応**

- `subType === "additional"` の場合のみ説明文を変える
- `damage` + `additional` → `"追加"特性を持つ、通常のダメージ`
- それ以外 + `additional` → `"追加"特性を持ち、${desc}する`
- `subType === "none"` / `"normal"` は通常の説明文と同じ

**グローバル公開**

```js
window.applyDamageByRule       = applyDamageByRule;
window.getDamageTypeLabel       = getDamageTypeLabel;
window.getDamageTypeDescription = getDamageTypeDescription;
```

- `contextMenu.js` / `MonsterCombatSystem.js` から `window.applyDamageByRule` で参照

**潜在的な問題**

- `default` ケースが `damage` / `direct_attack` と同じ挙動 → 未知の type が来ても通常ダメージとして処理される（サイレントフォールバック）
- `arcana` は defstackMax をリセットしない → defstack が 0 になった後、次の `damage` 攻撃で即1ダメ通過する

---

### C. showBattleZonePpCostModal の PP 直接変更（Round 13 危険箇所）

**実装の確認**

```js
overlay.querySelector("#zonePpOk").onclick = () => {
  const cost = clamp(parseInt(inp.value, 10) || 0);
  const st = typeof state !== "undefined" ? state[owner] : null;
  if (!st) { close(); return; }
  if (st.pp < cost) { showErrorMessage("PPが不足しています。"); return; }
  st.pp -= cost;                          // ← state を直接変更
  placeCardInZone(cardEl, owner, zoneType);
  if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
  if (typeof saveFieldCards === "function") saveFieldCards();
  if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();  // ← Firebase 同期
  if (typeof update === "function") update();
  close();
};
```

**`addVal()` を経由しない影響**

- `addVal()` は `normalizeState()` / `syncDerivedStats()` / `checkLevelUp()` を呼ぶ可能性がある
- `st.pp -= cost` の直接変更後は `pushMyStateDebounced()` のみ → 派生ステータス再計算なし
- PP は派生ステータスに影響しないため、**実害はほぼない**
- ただし `addVal()` が将来 PP 変更時のフック（ログ出力等）を持つ場合は不整合になる

**PP 上限チェックの問題**

```js
const clamp = (v) => Math.max(0, Math.min(2, v));
```

- モーダルの入力値を 0〜2 にクランプしているが、**実際の PP 上限（ppMax）を参照していない**
- `st.pp < cost` チェックはあるが、`cost` の上限が 2 固定
- PP が 3 以上の場合でも最大 2 しか消費できない（意図的な仕様の可能性あり）

**結論**

- `addVal()` 非経由は低リスク（PP は派生ステータスに影響しない）
- PP 消費上限が 2 固定なのは仕様（召喚コストの最大値が 2）
- `pushMyStateDebounced()` + `update()` で Firebase 同期と UI 更新は正しく行われる ✅

---

### Round 14 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 12 | attacker の clearZoneMarker 後カードがフィールドに浮く | 低 | cardManager.js |
| 13 | arcana が defstackMax をリセットしない（次の damage で即1ダメ通過） | 低〜中 | damageCalc.js |
| 14 | damageCalc.js の default ケースがサイレントフォールバック | 低 | damageCalc.js |

**設計上の特徴（意図的）**

- attacker ゾーンは「最後に出したカードが有効」の1枚スタック設計
- `organizeBattleZones` の `cards.length > 1` チェックは復元時の安全弁
- PP 消費上限 2 固定は召喚コストの仕様
- `damageCalc.js` は純粋関数のみ → テスト可能・副作用なし ✅

### 次に調べる場所

- `js/game/core.js` の `addVal()` → `pushMyStateDebounced` の呼び出しタイミング（Round 10 未解決）
- `js/game/game.js` の `executeReset()` → watcher 再設定フロー（Round 9/10 未解決）

---

## Round 15 — addVal / executeReset / syncDerivedStats 重複問題

### A. addVal の実装（確定）

```
addVal(owner, key, delta)
  ├─ key === "level"
  │    → level をクランプ、exp を上限以下に切り詰め、applyLevelStats()
  │    → pushMyStateDebounced() or sendChangeRequest()
  │    → update()
  │
  ├─ key === "exp" && delta > 0 && maxLv 到達 → 早期リターン（EXP 増加なし）
  ├─ key === "exp" && delta < 0 && Lv1 → exp を 0 以上にクランプして同期
  │
  ├─ key === "pp"
  │    → [0, ppMax] にクランプ
  │    → addGameLog("[システム] PP: prev → next")
  │
  ├─ key === "defstack"
  │    → delta < 0 かつ prev === 0 → v = defstackMax（アンダーフロー時にリセット）
  │    → delta > 0 かつ !defstackOverMax → v = min(v, defstackMax)（上限超え防止）
  │    → v <= defstackMax → defstackOverMax = false
  │
  ├─ key === "exp" → addGameLog("[EXP] ...")
  ├─ key === "exp" → checkLevelUp(owner)
  ├─ syncDerivedStats(owner)
  ├─ pushMyStateDebounced() or sendChangeRequest()
  └─ update()
```

**`defstackOverMax` フラグの仕組み**

- `addInstantDef` ボタン（PP消費で defstack を即時増加）でのみ `defstackOverMax = true` になる
- `addVal("defstack", +n)` では `!defstackOverMax` の場合のみ defstackMax を上限とする
  → `defstackOverMax = true` の状態では上限を超えた defstack を保持できる
- `resetDefense` ボタンで `defstack = defstackMax`, `defstackOverMax = false` に戻す
- `setVal("defstack", v)` は常に `defstackMax` を上限とし `defstackOverMax = false` にリセット

**`addVal` が `addGameLog` を出すケース**

| key | 条件 | ログ内容 |
|-----|------|---------|
| `pp` | 常に | `[システム] PP: prev → next` |
| `exp` | delta > 0 | `[EXP] X EXPを獲得` |
| `exp` | delta < 0 かつ exp > 0 or Lv > 1 | `[EXP] X EXPを失いました` |

- `hp` / `shield` / `defstack` の変更はログを出さない（`applyCalculatedDamage` 側でログを出す）

**`pushMyStateDebounced` の呼び出しタイミング**

- `owner === me` の場合のみ `pushMyStateDebounced()` を呼ぶ
- `owner !== me`（相手への変更）の場合は `sendChangeRequest()` を呼ぶ
- `addVal` は必ず `update()` を呼ぶ → UI は即時更新される

**Round 9 の競合問題（確定）**

- `_beforeTurnEndHooks` でモンスター攻撃 → `addVal(targetKey, "hp", -dmg)` → `pushMyStateDebounced()`（300ms デバウンス）
- その後 `handleTurnEnd` が `await firebaseClient.writeMyState()` を呼ぶ
- `writeMyState` は即時書き込み → デバウンス中の `pushMyStateDebounced` より先に Firebase に届く
- 300ms 後に `pushMyStateDebounced` が発火 → **モンスター攻撃前の古い hp を上書きする可能性がある**
- ただし `pushMyStateDebounced` は `_getMyStateForSync()` を使うため、その時点の `state[me]` を送る
  → `addVal` で `state[me].hp` は既に更新済み → **最終的には正しい値が送られる** ✅
- 実害: なし（デバウンスが発火する時点では state は正しい）

---

### B. syncDerivedStats / checkLevelUp の重複定義（Round 7 未解決）

**2つの定義の比較**

| 項目 | `syncState.js` | `game.js` |
|------|---------------|-----------|
| `syncDerivedStats` | `window.syncDerivedStats = syncDerivedStats` でグローバル公開 | ローカル関数（グローバル公開なし） |
| `checkLevelUp` | `window.checkLevelUp = function(...)` でグローバル公開 | ローカル関数（グローバル公開なし） |
| 内容 | 同一 | 同一 |
| `applyLevelStats` の呼び出し | `typeof applyLevelStats === "function"` でガード | ガードなし（直接呼び出し） |

**実行順序（確定）**

- `game.js` は `syncState.js` より後に読み込まれる（HTML の script 順序）
- `game.js` のローカル `syncDerivedStats` / `checkLevelUp` は `window.*` を上書きしない
- `addVal` / `setVal` は `game.js` 内のローカル関数を呼ぶ（スコープ内）
- `roomWatcher.js` の `pendingChange` ハンドラは `window.syncDerivedStats` / `window.checkLevelUp` を呼ぶ
  → `syncState.js` の版が使われる

**結論: 実害なし（内容が同一のため）**

- ただし将来どちらかを変更した場合に不整合が生じるリスクがある
- `syncState.js` 版を正とし、`game.js` のローカル定義を削除するのが望ましい

---

### C. executeReset の watcher 再設定フロー（確定）

**フロー全体**

```
executeReset(syncShared = true)
  ├─ Firebase 不要データを並列削除（playerDice, fieldCards, pendingChange, logs, rematch, playerState）
  ├─ state をリセット（hp/shield/defstack/level/exp/pp/diceValue/evolutionPath 等）
  ├─ initDeckFromCode() → デッキ再構築
  ├─ shuffleDeck()
  ├─ DOM カードを全削除
  ├─ resetBattleZoneState()
  ├─ localStorage から fieldCards / gameStarted / gameStartedRoom を削除
  ├─ state.matchData を初期値に戻す（status: "ready_check"）
  ├─ 各種フラグをリセット（_gameStartInitiated, _firstDrawPhaseStarted 等）
  ├─ notifySyncGate("initDone", false) / ("roomWatcherReady", false) / ("phaseReady", false)
  │    → ローディングオーバーレイを再表示
  ├─ setupRoomWatcher()  ← watcher 再設定
  │    └─ 既存 roomWatcherUnsubscribe を解除してから再登録
  │    └─ clearAllWatchers() は呼ばない（setupRoomWatcher 内で個別に解除）
  ├─ firebaseClient.writeMyState()  ← 自分の最新状態を送信
  ├─ notifySyncGate("initDone", true)  ← ローディングオーバーレイを解除
  ├─ safeLocalSetItem("gameState", ...)
  ├─ createDeckObject(true)
  ├─ syncLoop()
  ├─ _bothPlayersConnected かつ status === "ready_check" → status を "setup_dice" に進める
  └─ update()
```

**`startPvpveWatcher` の再呼び出し問題（重要な発見）**

- `startPvpveWatcher` は `game.html` の Firebase 接続コールバック（`firebaseJoined` イベント）でのみ呼ばれる
- `executeReset` は `startPvpveWatcher` を**呼ばない**
- `setupRoomWatcher` も `startPvpveWatcher` を**呼ばない**
- **結果**: リセット後に pvpve Firebase ウォッチャーが再起動されない
  - ただし `_registerHooks` で登録したフック（`_afterUpdateHooks` 等）は残る
  - `_pvpveRef` / `_pvpveListener` は `stopPvpveWatcher` が呼ばれない限り生きている
  - `executeReset` は `stopPvpveWatcher` を呼ばない → **pvpve リスナーはリセット後も生き続ける** ✅
  - ただし `_lastRoundSeen` がリセットされないため、リセット後の round=1 で `onRoundStart(1)` が発火しない可能性がある
    → `_lastRoundSeen` は前回ゲームの最終ラウンド値のまま残る
    → round=1 に戻っても `_lastRoundSeen !== 1` にならない（前回が round=1 で終わった場合）

**`clearAllWatchers` の呼び出しタイミング**

- `setupRoomWatcher` の `unsubscribe` 関数内で `clearAllWatchers()` を呼ぶ
- `unsubscribe` は次回 `setupRoomWatcher` 呼び出し時に実行される
- つまり `executeReset` → `setupRoomWatcher()` → 既存 `unsubscribe` 実行 → `clearAllWatchers()` → 全 watcher 解除 → 新規登録
- **pvpve リスナーは `clearAllWatchers` で解除されない**（`watcherRegistry` に登録されていないため）

---

### Round 15 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 15 | リセット後 `_lastRoundSeen` がリセットされず、round=1 で `onRoundStart` が発火しない可能性 | 中 | pvpveWatcher.js |
| 16 | `syncDerivedStats` / `checkLevelUp` の重複定義（内容は同一） | 低 | syncState.js / game.js |

**確定した設計（意図的）**

- `addVal` の `defstackOverMax` フラグは `addInstantDef` 専用の上限超え許可機構 ✅
- `addVal` の `pushMyStateDebounced` と `writeMyState` の競合は実害なし（state は既に更新済み） ✅
- `executeReset` は `setupRoomWatcher` を再呼び出しして watcher を再設定する ✅
- pvpve リスナーはリセット後も生き続ける（`stopPvpveWatcher` が呼ばれないため）

**未解決**

- [ ] `_lastRoundSeen` リセット問題: リセット後の round=1 で `onRoundStart(1)` が発火するか
  - 前回ゲームが round=2 以上で終わった場合は `_lastRoundSeen=2` → round=1 で発火する ✅
  - 前回ゲームが round=1 で終わった場合は `_lastRoundSeen=1` → round=1 で発火しない ❌
- [ ] `addVal` の `pp` 変更ログが毎回出るのは意図的か（PP ボタン操作のたびにゲームログに出る）

### 次に調べる場所

- `js/game/monsters/pvpveWatcher.js` の `_lastRoundSeen` リセット問題の修正要否
- `js/game/game.js` の `syncLoop()` → リセット後の同期フロー
- `js/ui/statusUI.js` → PP ログの表示先（ゲームログ or デバッグログ）

---

## Round 16 — _lastRoundSeen リセット問題 / syncLoop / addGameLog / PP ログ

### A. _lastRoundSeen リセット問題（Round 15 未解決）

**pvpveWatcher.js の全体構造（確定）**

- IIFE（即時実行関数）内のクロージャ変数 `_lastRoundSeen = 0`
- `startPvpveWatcher()` を呼ぶと `stopPvpveWatcher()` → Firebase リスナー再登録 → `_registerHooks()` の順で実行
- `_lastRoundSeen` は `startPvpveWatcher()` を呼んでも**リセットされない**（変数宣言は IIFE 内の let）
- `stopPvpveWatcher()` も `_lastRoundSeen` をリセットしない

**リセット後の `onRoundStart` 発火条件**

| 前回ゲームの最終ラウンド | リセット後の `_lastRoundSeen` | round=1 で発火するか |
|------------------------|------------------------------|---------------------|
| round=1 で終了 | 1 | ❌ 発火しない（1 === 1） |
| round=2 以上で終了 | 2以上 | ✅ 発火する（1 !== 2以上） |

- **前回ゲームが round=1 で終わった場合のみ問題が発生**
  - モンスターが召喚されない（`onRoundStart(1)` が呼ばれない）
  - ただし `_onAfterUpdate` は `status === "playing"` の間は毎回呼ばれる
  - `update()` が呼ばれるたびに `round !== _lastRoundSeen` を評価するため、
    **round が 1 → 2 に変わった瞬間に `onRoundStart(2)` は発火する** ✅
  - 問題は「ゲーム開始直後の round=1 の `onRoundStart(1)`」のみ

**影響範囲**

- `onRoundStart(1)` が呼ばれない → `MonsterCombatSystem.onRoundStart(1)` が呼ばれない
  → `MonsterManager.initRound(1)` が呼ばれない → **ラウンド1のモンスターが出現しない**
- ラウンド2以降は正常に動作する
- 前回ゲームが round=2 以上で終わった場合は問題なし

**修正方針**

```js
// executeReset() 内または startPvpveWatcher() 内で _lastRoundSeen をリセットする
// 現状 _lastRoundSeen はクロージャ変数のため外部からアクセス不可
// → startPvpveWatcher() 内でリセットするのが最も安全
window.startPvpveWatcher = function() {
  _lastRoundSeen = 0;  // ← 追加
  // ...
};
```

---

### B. syncLoop の設計（確定）

**syncLoop の役割**

```js
async function syncLoop() {
  if (isPolling) return;  // 多重実行防止
  isPolling = true;
  try {
    if (!window._levelStatsLoaded) {
      await loadLevelStats();
      window._levelStatsLoaded = true;
    }
    normalizeState();
    applyLevelStats("player1");
    applyLevelStats("player2");
    update();
  } finally {
    isPolling = false;
  }
}
setInterval(syncLoop, 1000);  // 1秒ごとに実行
```

- **Firebase ポーリングではない**（Firebase watcher が state を直接更新するため不要）
- 役割は3つのみ:
  1. `loadLevelStats()` の遅延ロード（初回のみ）
  2. `normalizeState()` で state の整合性を毎秒チェック
  3. `applyLevelStats()` + `update()` で UI を毎秒更新

**`executeReset` 後の `syncLoop` 呼び出し**

- `executeReset` 末尾で `await syncLoop()` を呼ぶ
- `isPolling` フラグで多重実行を防止 → `setInterval` の定期実行と競合しない
- `_levelStatsLoaded` は `executeReset` でリセットされない → 再ロードは不要（仕様通り）

**潜在的な問題**

- `setInterval(syncLoop, 1000)` は `core.js` のロード時に即時登録される
- ページ遷移なしでゲームをリセットしても `setInterval` は生き続ける → 問題なし
- `normalizeState()` が毎秒 hp を max にクランプする → `hpMax` が正しくないと毎秒 hp が削られる
  - ただし `applyLevelStats` が `hpMax` を正しく設定するため実害なし

---

### C. addGameLog の設計（確定）

**ログの流れ**

```
addGameLog(msg)
  ├─ [EVOLUTION] → [進化の道] に変換
  ├─ [ZONE] → [システム] に変換
  ├─ [SYSTEM|DICE|MATCH] → [システム] に変換
  ├─ 重複チェック（state.logs に同じエントリがあればスキップ）
  ├─ state.logs に追加（上限50件、超えたら先頭を削除）
  ├─ Firebase rooms/{room}/logs に push（相手にも届く）
  └─ saveLocal()（localStorage に保存）
```

- **全ログが Firebase 経由で相手にも届く**（`logRef.push(entry)`）
- 重複防止: タイムスタンプ付きエントリで完全一致チェック → 同一ミリ秒に同じメッセージが来た場合のみ防止（実質的には重複防止にならない）

**PP ログの問題（確定）**

`addVal` で `key === "pp"` の場合:
```js
addGameLog(`[システム] ${s.username || owner} のPP: ${prev} → ${s[key]}`);
```

- PP が変わるたびに**ゲームログ（相手にも見える）**に出力される
- 出力されるケース:
  - PP ボタン（+/−）を押すたびに出力
  - モンスター討伐時の PP+2 回復（`addVal(killer, "pp", 2)`）→ `addVal` 内のログ + `MonsterCombatSystem` 側のログ `[MONSTER] PP +2 回復！` の**2行出力**
  - ターン終了時の PP 変更（`addVal` 経由の場合）

- `contextMenu.js` の PP 変更は `addVal` を経由せず直接 `state.pp` を変更 → ログなし（別途 `addGameLog` を呼ぶ）
- `showBattleZonePpCostModal` の PP 変更も `addVal` を経由しない → ログなし

**PP ログ2行出力の詳細**

```
MonsterCombatSystem._handleDefeat()
  └─ addVal(killer, "pp", 2)
       └─ addGameLog("[システム] PP: 0 → 2")   ← addVal 内
  └─ addGameLog("[MONSTER] PP +2 回復！")       ← MonsterCombatSystem 内
```

- 同じ PP 変更に対して2行出力される（意図的かどうか不明）

---

### Round 16 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 17 | `_lastRoundSeen` がリセットされず、前回 round=1 終了時にリセット後のモンスターが出現しない | 中 | pvpveWatcher.js |
| 18 | モンスター討伐時の PP+2 ログが2行出力（`addVal` 内 + `MonsterCombatSystem` 内） | 低 | MonsterCombatSystem.js / game.js |
| 19 | `addGameLog` の重複防止がタイムスタンプ付きのため実質機能しない | 低 | core.js |

**設計上の特徴（意図的）**

- `syncLoop` は Firebase ポーリングではなく、毎秒の state 正規化 + UI 更新のみ ✅
- `addGameLog` は全ログを Firebase 経由で相手にも届ける設計 ✅
- `[EVOLUTION]` → `[進化の道]` 等のラベル変換は表示用の正規化 ✅

**修正が必要なもの**

```js
// pvpveWatcher.js の startPvpveWatcher() 内に1行追加するだけで修正可能
window.startPvpveWatcher = function() {
  _lastRoundSeen = 0;  // ← リセット追加
  stopPvpveWatcher();
  // ...
};
```

ただし `startPvpveWatcher` はゲーム開始時の1回のみ呼ばれるため、
`executeReset` 後に `startPvpveWatcher` を再呼び出しするか、
`executeReset` 内で `_lastRoundSeen` をリセットする外部 API を追加する必要がある。

### 次に調べる場所

- `js/game/core.js` の `normalizeState` が毎秒 hp をクランプする問題の実害確認
- `js/ui/statusUI.js` → PP ログの表示先（ゲームログ UI の実装）
- `js/game/phases/battlePhase.js` → ターン終了時の PP 変更フロー（`addVal` 経由か直接変更か）

---

## Round 17 — battlePhase PP変更フロー / addGameLog 表示先 / PP ログ問題

### A. ターン終了時の PP 変更フロー（確定）

**battlePhase.js の handleTurnEnd は PP を変更しない**

```
handleTurnEnd()
  ├─ _beforeTurnEndHooks（モンスター攻撃・ターゲットロック・成長スライム EXP）
  ├─ turnPlayer / turn / round を更新
  ├─ addGameLog("[TURN] ...")
  ├─ evoContinuousDmgCount = 0 / evoBackwaterExpGained = false / _turnDmgHistory = {}
  ├─ firebaseClient.writeMatchData()
  ├─ firebaseClient.writeMyState()
  ├─ update()
  └─ _afterTurnEndHooks（モンスター先攻攻撃・ターゲット変更許可）
```

- **PP の変更は handleTurnEnd 内に存在しない**
- PP+1 はドロー処理（`drawCard()` 相当）内で `myState.pp = Math.min(currentPp + 1, maxPp)` として直接変更
  - `addVal()` を経由しない → PP ログが出ない ✅（意図的）
  - `pushMyStateDebounced()` も呼ばない → `saveAllImmediate()` + `update()` のみ

**PP が変わるタイミングの整理**

| タイミング | 方法 | ログ出力 |
|-----------|------|---------|
| ドロー時（PP+1） | `myState.pp = ...` 直接変更 | なし |
| PP ボタン（+/−） | `addVal()` 経由 | `[システム] PP: prev → next` |
| カード召喚（PP消費） | `st.pp -= cost` 直接変更 | なし |
| モンスター討伐（PP+2） | `addVal()` 経由 | `[システム] PP: prev → next` + `[MONSTER] PP +2 回復！` の2行 |
| ゲームリセット | `s.pp = 0` 直接変更 | なし |

- **`addVal()` 経由の PP 変更のみログが出る**
- ドロー・召喚・リセットは直接変更のためログなし
- PP ボタン操作のたびにゲームログ（相手にも見える）に出力されるのは**冗長**

---

### B. addGameLog の表示先（確定）

**ログの表示先: `#chatLogs` 要素（チャット欄と共用）**

```
addGameLog(msg)
  → state.logs に追加
  → Firebase rooms/{room}/logs に push（相手にも届く）

update()
  → updateGameLogs(state.logs)
       → #chatLogs の innerHTML を全再描画（logs.length が変わった場合のみ）
```

**chatUI.js の `updateGameLogs` の CSS クラス分類**

| 条件 | クラス | 用途 |
|------|--------|------|
| `[システム]` で始まる | `log-system` | PP変更・ゾーン操作等 |
| `[EXP\|HP\|PP\|DICE\|RESULT\|DEFEAT\|EVOLUTION\|MATCH\|TURN\|ZONE]` | `log-stat` | ゲームイベント |
| `[CHAT:color]` | `log-chat` + 色付き | チャット |
| `: ` を含む | `log-chat` + 白 | 旧形式チャット |

- `[システム] PP: 0 → 2` は `log-system` クラス → チャット欄に**システムメッセージとして表示**
- PP ボタンを押すたびにチャット欄が更新される → **ゲームプレイ中に非常に目立つ**

**`updateGameLogs` の再描画条件**

```js
if (logs.length !== existingCount) {
  chatLogs.innerHTML = "";  // 全クリア
  // 再描画
}
```

- ログ件数が変わった場合のみ再描画（差分更新なし）
- `new Set(logs)` で重複排除してから表示 → 同一内容のログは1件のみ表示
- ただし `addGameLog` の重複防止はタイムスタンプ付きのため、同じ内容でも時刻が違えば別エントリ → `new Set` では排除されない

**`checkAndLogStateChanges` の役割**

- `update()` 内で旧 state と新 state を比較
- レベルアップのみ `addGameLog` を呼ぶ（HP/EXP の細かい変更はログに出さない）
- `[PROTOCOL:RESET]` ログを検知して相手側のリセット追従処理を実行

---

### C. chatUI.js の重複定義問題

**`js/chat/chatUI.js` と `js/ui/chatUI.js` の2ファイルが存在する**

```
js/chat/chatUI.js   ← 関数定義のみ（window.* への公開なし）
js/ui/chatUI.js     ← window.updateGameLogs / window.checkAndLogStateChanges として公開
```

- 内容はほぼ同一（`js/ui/chatUI.js` が `window.*` 公開版）
- `game.html` でどちらが読み込まれているか要確認

---

### Round 17 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 20 | PP ボタン操作のたびにチャット欄に `[システム] PP: prev → next` が出力される | 低〜中 | game.js addVal |
| 21 | `chatUI.js` が2ファイル存在（`js/chat/` と `js/ui/`） | 低 | chatUI.js |
| 22 | `updateGameLogs` がログ件数変化時に全再描画（差分更新なし） | 低 | chatUI.js |

**設計上の特徴（意図的）**

- ドロー時・召喚時・リセット時の PP 変更は直接変更 → ログなし（意図的）
- `addVal()` 経由の PP 変更のみログが出る → PP ボタン操作の可視化が目的と思われる
- チャット欄とゲームログが共用 → 全イベントが1か所に集約される設計

**未解決**

- [ ] `game.html` で `js/chat/chatUI.js` と `js/ui/chatUI.js` のどちらが読み込まれているか
- [ ] PP ボタン操作ログを抑制するか（`addVal` の pp ログを削除 or デバッグフラグ化）

### 次に調べる場所

- `game.html` の script 読み込み順序（chatUI の重複確認）
- `js/game/core.js` の `normalizeState` が毎秒 hp をクランプする実害確認（Round 16 未解決）
- `js/ui/statusUI.js` → PP/HP バーの描画実装

---

## Round 18 — game.html script 読み込み順序 / normalizeState クランプ実害 / statusUI.js

### A. game.html の script 読み込み順序（確定）

```
1.  firebase-app/auth/database-compat.js（CDN）
2.  firebase-client.js
3.  messaging.js
4.  cardData.js
5.  deckCode.js
6.  gameState.js
7.  syncState.js          ← normalizeState / syncDerivedStats / checkLevelUp (window.*)
8.  damageCalc.js         ← applyDamageByRule (window.*)
9.  gameRules.js
10. core.js               ← addVal / syncLoop / addGameLog / applyLevelStats
11. cardManager.js
12. dragManager.js / drag.js
13. statusBlocks.js / handUI.js
14. statusBlockPresets.js / statusBlockPresetModal.js
15. dicePhase.js / firstDrawPhase.js
16. setupPhase.js / battlePhase.js
17. watcherRegistry.js / timerSync.js / timerUI.js
18. diceWatcher.js / phaseWatcher.js / roomWatcher.js
19. resultManager.js
20. statusUI.js           ← renderOwnerUI / updateFieldStatusPanels
21. overlayUI.js / animationUI.js
22. js/ui/chatUI.js       ← updateGameLogs / checkAndLogStateChanges (window.* 公開版)
23. game.js               ← initGame / executeReset / addVal (ローカル版)
24. deckViewer.js / menu.js / devTools.js
25. monsterData.js / MonsterManager.js / BattleTargetSystem.js
26. MonsterCombatSystem.js / MonsterUI.js / pvpveWatcher.js
27. contextMenu.js        ← applyCalculatedDamage
```

**chatUI の重複問題（確定）**

- `game.html` は `js/ui/chatUI.js` のみ読み込む（`js/chat/chatUI.js` は読み込まない）
- `js/chat/chatUI.js` は `game.html` では使われていない → デッドファイルの可能性
- `js/ui/chatUI.js` が `window.updateGameLogs` / `window.checkAndLogStateChanges` を公開 ✅

**script 読み込み順序の問題点**

- `game.js` は `syncState.js` より後に読み込まれる
  → `game.js` のローカル `syncDerivedStats` / `checkLevelUp` は `window.*` を上書きしない ✅（Round 15 確認済み）
- `contextMenu.js` は `game.js` より後に読み込まれる
  → `contextMenu.js` が `addVal` を呼ぶ時点で `game.js` のローカル `addVal` は定義済み ✅
- `pvpveWatcher.js` は `game.js` より後に読み込まれる
  → `_afterUpdateHooks` 等は `game.js` の `update()` が定義された後に登録される ✅

---

### B. normalizeState の毎秒 hp クランプ実害（確定）

**normalizeState の hp クランプロジック**

```js
["hp", "shield", "exp", "pp"].forEach(k => {
  const v  = Number(state[p][k]) || 0;
  const mx = Number(state[p][k + "Max"]) || defaultMax;
  state[p][k + "Max"] = mx;
  if (v > mx) state[p][k] = mx;  // ← クランプ
  if (v < 0)  state[p][k] = 0;
  else        state[p][k] = v;
});
```

- `hpMax` が `undefined` / `null` の場合: `defaultMax = 20` を使用
- `hpMax` が正しく設定されている場合: その値でクランプ

**`applyLevelStats` の hpMax 設定**

```js
function applyLevelStats(owner, force = false) {
  s.atk        = BASE_INITIAL_STATE.atk        + (LEVEL_STATS.atk[idx]        || 0);
  s.def        = BASE_INITIAL_STATE.def        + (LEVEL_STATS.def[idx]        || 0);
  s.instantDef = BASE_INITIAL_STATE.instantDef + (LEVEL_STATS.instantDef[idx] || 0);
  // ...
}
```

- **`applyLevelStats` は `hpMax` を変更しない**
- `hpMax` は `makeCharState()` の初期値 20 のまま、またはリセット時に `s.hpMax = 20` で設定
- `LEVEL_STATS` に `hpMax` の変動がない → 全レベルで `hpMax = 20` 固定

**実害の評価（確定）**

- `syncLoop` が毎秒 `normalizeState()` を呼ぶ
- `normalizeState` は `hpMax`（= 20）でクランプ
- `hpMax` は常に 20 固定 → **hp が 20 を超えることはない設計**
- `_bulk` 送信で相手から hp を受け取っても `hpMax = 20` でクランプ → 問題なし ✅
- **実害なし**（Round 7 の懸念は杞憂だった）

---

### C. statusUI.js の設計（確定）

**`updateFieldStatusPanels` の役割（PP/手札パネル）**

- `#field`（`position: fixed; inset: 0`）に `position: absolute` で配置
- 自分: 左下固定（`left: 16px; bottom: 16px`）、`pointer-events: auto`
- 相手: 右上固定（`right: 16px; top: 80px`）、`pointer-events: none`（操作不可）
- PP ボタン（+/−）は `data-key="pp"` `data-delta="±1"` → `game.js` のイベントデリゲーションで `addVal()` を呼ぶ

**`renderOwnerUI` の役割（詳細ステータスパネル）**

- HP バー・シールドバー・防御スタックバー・EXP リング・ATK/DEF チップを描画
- `devMode` が true の場合のみ ATK/DEF/instantDef が編集可能（通常は表示のみ）
- 相手パネルは全入力が `readonly disabled`
- `defstackOverMax` が false かつ `defstack >= defstackMax` の場合、defstack の＋ボタンを非表示

**`countOwnerHandCardsOnField` の手札カウントロジック**

- `zoneType` がないカード（ゾーン未配置）かつ:
  - player1: `y >= HAND_ZONE_Y_MIN`（1460以上）
  - player2: `y <= FIELD_H - HAND_ZONE_Y_MIN`（540以下）
- または `handOrder` を持つカード（手札整列済み）
- **ゾーン配置カードは手札にカウントしない** ✅

**`lorStatChip` の devMode 依存**

- `window.devMode` が true の場合のみ ATK/DEF/instantDef の入力フィールドを表示
- 通常プレイ中は `<span>` で表示のみ → 誤操作防止 ✅

---

### Round 18 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 23 | `js/chat/chatUI.js` が `game.html` で読み込まれていない（デッドファイル） | 低 | js/chat/chatUI.js |

**確定した設計（意図的）**

- `normalizeState` の毎秒 hp クランプは実害なし（hpMax = 20 固定） ✅
- `chatUI.js` は `js/ui/` 版のみ使用、`js/chat/` 版はデッドファイル
- `statusUI.js` の PP ボタンは `addVal()` 経由 → ログが出る（問題 #20 の根本原因）
- `applyLevelStats` は atk/def/instantDef のみ変更、hpMax は変更しない

**全体の未解決リスト（Round 1〜18）**

| # | 問題 | 深刻度 | 修正方針 |
|---|------|--------|---------|
| 2 | デッキ枚数 0 でも READY 可能 | 低 | matchSetup.js に枚数チェック追加 |
| 3 | プレビューと実際の適用でロジック重複 | 中 | contextMenu.js のリファクタ |
| 5 | MonsterCombatSystem が防御スタックを無視 | 要確認 | 仕様確認後に対応 |
| 13 | arcana が defstackMax をリセットしない | 低〜中 | damageCalc.js に1行追加 |
| 15 | `_lastRoundSeen` リセット漏れ | 中 | startPvpveWatcher() に `_lastRoundSeen = 0` 追加 + executeReset から再呼び出し |
| 17 | `_lastRoundSeen` リセット後の startPvpveWatcher 未呼び出し | 中 | executeReset に `startPvpveWatcher()` 追加 |
| 18 | モンスター討伐 PP+2 ログ2行出力 | 低 | MonsterCombatSystem の addGameLog 削除 |
| 20 | PP ボタン操作のたびにチャット欄にログ出力 | 低〜中 | addVal の pp ログを削除 or フラグ化 |
| 23 | `js/chat/chatUI.js` デッドファイル | 低 | ファイル削除 |

### 次に調べる場所

- `js/ui/contextMenu.js` の `applyCalculatedDamage` プレビューと実際の適用の重複ロジック（問題 #3 の詳細）
- `js/game/gameRules.js` → `getHandLimit` / `calcExpMax` 等のルール定義

---

## Round 19 — gameRules.js / contextMenu.js 重複ロジック詳細

### A. gameRules.js の設計（確定）

**定義されているルール**

| 関数/定数 | 内容 |
|----------|------|
| `TURNS_PER_ROUND = 5` | 1ラウンドのターン数 |
| `LEVEL_MAX_CONST = 6` | レベル上限 |
| `PHASE` | フェーズ文字列定数（freeze済み） |
| `getHandLimit(owner)` | 手札上限（忍耐の道でレベル依存増加） |
| `calcExpMax(level)` | EXP上限 = `level * 2` |
| `calcNextTurn(matchData)` | 次ターン計算（純粋関数） |
| `getEvolutionPathParam(path, level)` | 進化の道のレベル依存パラメータ x/t/y/z |

**`getEvolutionPathParam` のパラメータテーブル**

| レベル | x（忍耐） | t（背水） | y（継続） | z（奇撃） |
|--------|----------|----------|----------|----------|
| 1〜2 | 0 | 1 | 1 | 1 |
| 3〜4 | 1 | 2 | 3 | 3 |
| 5 | 3 | 3 | 4 | 4 |
| 6 | 4 | 4 | 6 | 6 |

**`calcNextTurn` の設計**

- 純粋関数（state を変更しない）
- `battlePhase.js` の `handleTurnEnd` は `calcNextTurn` を**使っていない**
  → `handleTurnEnd` が直接 `m.turnPlayer / m.turn / m.round` を変更している
  → `calcNextTurn` は定義されているが呼び出し元が存在しない（デッドコード）

**`getHandLimit` の忍耐の道ロジック**

```
忍耐の道の手札上限 = 6 + (1 + x)
  Lv1-2: 6 + 1 = 7
  Lv3-4: 6 + 2 = 8
  Lv5:   6 + 4 = 10
  Lv6:   6 + 5 = 11
```

---

### B. contextMenu.js の重複ロジック詳細（問題 #3）

**`updatePreview`（プレビュー）と `applyCalculatedDamage`（実際の適用）の比較**

#### 奇撃の道

| 項目 | updatePreview | applyCalculatedDamage |
|------|--------------|----------------------|
| 発動条件 | `amount >= 6` かつ `evolutionPath === "奇撃の道"` | 同じ |
| z の計算 | `[1,3,4,6][getLvIdx(lv)]` | `[1,3,4,6][idx]`（同じ値） |
| 適用方法 | `applyHit("fragile", z)` → `applyDamageByRule` 経由 | `s.defstack = Math.max(0, s.defstack - z)` → **直接変更** |
| ログ | なし | `[EVOLUTION] 奇撃の道 効果！` |

→ **結果は同じだが実装が異なる**（Round 5 確認済み）

#### 背水の道

| 項目 | updatePreview | applyCalculatedDamage |
|------|--------------|----------------------|
| 発動条件 | `type === "direct_attack"` かつ `evolutionPath === "背水の道"` | 同じ |
| 手札カウント | `window.prevMyHandCount` | `window.prevMyHandCount` |
| +1 ダメージ | `actualAmount += 1` | `actualAmount += 1` |
| PP+t ダメージ | `actualAmount += t` | `actualAmount += t` |
| EXP 獲得 | **なし**（プレビューのみ） | `myState.exp += 1` + `evoBackwaterExpGained = true` |
| ログ | なし | `[EVOLUTION] 背水の道 効果！` |

→ **プレビューは EXP 獲得をシミュレートしない**（HP ダメージ量は正しく表示される）

#### 継続の道

| 項目 | updatePreview | applyCalculatedDamage |
|------|--------------|----------------------|
| 発動条件 | `amount >= 1` かつ `evolutionPath === "継続の道"` | 同じ |
| y の計算 | `[1,3,4,6][getLvIdx(lv)]` | `[1,3,4,6][idx]`（同じ値） |
| カウント参照 | `me.evoContinuousDmgCount` | `myState2.evoContinuousDmgCount` |
| 追加ダメージ | `applyHit("damage", 1)` + `applyHit("pierce", 1)` | 再帰 `applyCalculatedDamage(...)` |
| カウント更新 | **なし**（プレビューのみ） | `evoContinuousDmgCount += 1` |
| ログ | なし | `[EVOLUTION] 継続の道 効果発動！` |

→ **プレビューはカウントを更新しない**（HP ダメージ量は正しく表示される）

**重複ロジックの問題点まとめ**

1. **レベルインデックス計算が2箇所に重複**
   - `updatePreview`: `getLvIdx(lv)` ローカル関数
   - `applyCalculatedDamage`: インライン `if/else` チェーン
   - `gameRules.js` に `getEvolutionPathParam` があるが**どちらも使っていない**

2. **奇撃の道の適用方法が不統一**
   - プレビュー: `applyDamageByRule` 経由（正しい）
   - 実際: `s.defstack -= z` 直接変更（`applyDamageByRule` を使わない）

3. **進化の道を追加・変更する際に3箇所を修正する必要がある**
   - `updatePreview`
   - `applyCalculatedDamage`
   - `gameRules.js` の `getEvolutionPathParam`（現状は使われていない）

**`window.prevMyHandCount` の設定箇所**

```js
// game.js の update() 内
window.prevMyHandCount = countOwnerHandCardsOnField(me);
```

- `update()` が呼ばれるたびに更新される
- ダメージポップアップ表示時点の手札枚数を使う → 正しい設計 ✅

**`applyCalculatedDamage` の Firebase 同期**

- 自分が対象: `pushMyStateDebounced()`
- 相手が対象: `sendChangeRequest(..., "_bulk", "set", { hp, shield, defstack, defstackOverMax })`
- 継続の道の再帰呼び出し（`isEvoDmg=true`）でも同じ同期処理が走る
  → 再帰1回目・2回目それぞれで `sendChangeRequest` が呼ばれる
  → デバウンスで最後の値のみ送信される ✅

---

### Round 19 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 24 | `calcNextTurn` が定義されているが `handleTurnEnd` で使われていない（デッドコード） | 低 | gameRules.js / battlePhase.js |
| 25 | 進化の道のレベルインデックス計算が3箇所に重複（`updatePreview` / `applyCalculatedDamage` / `getEvolutionPathParam`） | 中 | contextMenu.js / gameRules.js |

**設計上の特徴（意図的）**

- `updatePreview` は EXP 獲得・カウント更新をシミュレートしない → HP ダメージ量のプレビューのみ ✅
- `gameRules.js` は純粋関数のみ（state 変更なし）→ テスト可能な設計 ✅
- `getHandLimit` の忍耐の道ロジックは `gameRules.js` に集約済み ✅

**修正方針（問題 #3 / #25）**

```js
// contextMenu.js の両関数で getEvolutionPathParam を使うよう統一
// 例:
const z = window.getEvolutionPathParam("奇撃の道", me.level);
// 奇撃の道の適用も applyDamageByRule 経由に統一
applyHit("fragile", z);  // updatePreview と同じ方式
```

### 次に調べる場所

- `js/ui/contextMenu.js` の PP 回復処理（`applyCalculatedDamage` 内の PP 変更）
- `js/game/phases/firstDrawPhase.js` → ファーストドロー全体フロー（Round 1 で部分的に解析済み）
- `js/game/result/resultManager.js` → 勝敗判定フロー

---

## Round 20 — PP 回復処理 / firstDrawPhase 全体フロー / resultManager 勝敗判定

### A. contextMenu.js の PP 回復処理（確定）

**`takeOut()` 内の PP 回復**

```js
// takeOut() の末尾（カードをドローした後）
dState.pp = Math.min((Number(dState.pp) || 0) + actual, Number(dState.ppMax) || 2);
if (typeof addGameLog === "function") {
  const afterPp = Number(dState.pp) || 0;
  const beforePp = Math.max(0, afterPp - actual);
  addGameLog(`[システム] ${playerName} のPP: ${beforePp} → ${afterPp}`);
}
```

- `takeOut()` はドロー処理（山札からカードを引く）
- ドロー枚数分だけ PP を回復する（`actual` = 実際に引けた枚数）
- `addVal()` を経由しない → `addVal` 内の PP ログとは別に、ここでも `[システム] PP:` ログを出す
- `pushMyStateDebounced()` は呼ばない → `organizeHands()` + `update()` のみ

**PP 回復の全パターン整理（確定）**

| タイミング | 方法 | ログ |
|-----------|------|------|
| `takeOut()` ドロー時 | `dState.pp += actual` 直接変更 | `[システム] PP: prev → next`（contextMenu.js） |
| PP ボタン（+/−） | `addVal()` 経由 | `[システム] PP: prev → next`（game.js addVal） |
| カード召喚（PP消費） | `st.pp -= cost` 直接変更 | なし |
| モンスター討伐（PP+2） | `addVal()` 経由 | `[システム] PP: prev → next` + `[MONSTER] PP +2 回復！` の2行 |
| ゲームリセット | `s.pp = 0` 直接変更 | なし |
| ゲーム開始時ドロー（game.js） | `myState.pp = Math.min(...)` 直接変更 | なし |

- `takeOut()` と `addVal()` の両方が `[システム] PP:` ログを出す → **ドロー時も PP ログが出る**
- ドロー1回ごとにチャット欄に PP 変化が表示される

---

### B. firstDrawPhase 全体フロー（確定）

**フロー全体**

```
status === "setup_first_draw" になると update() → updateFirstDrawPhaseUI() が呼ばれる

updateFirstDrawPhaseUI()
  ├─ tryAdvanceFirstDrawToPlayingIfBothReady()  ← 双方 ready なら即 playing へ
  ├─ オーバーレイ DOM 生成（shellBuilt フラグで1回のみ）
  ├─ startFirstDrawPhase()
  │    ├─ _firstDrawPhaseStarted フラグで多重実行防止
  │    ├─ デッキが空なら initDeckFromCode() + shuffleDeck() で再初期化
  │    │    失敗時: 最大3回 500ms リトライ（_firstDrawRetryCount）
  │    └─ takeOut(n, { visibility: "self" }) で n 枚を手札に配置
  │         先攻: n=5、後攻: n=6
  └─ カード選択 UI 構築（cardsBound フラグで1回のみ）
       ├─ 各カードにクリックイベント（selected 配列で管理）
       ├─ ちょうど3枚選択時のみ「確定」ボタンが有効
       └─ 確定ボタン押下:
            ├─ 未選択カードを insertCardIntoDeckAtRandom() で山札のランダム位置に戻す
            ├─ 選択3枚を手札として配置（visibility: "self"）
            ├─ Firebase matchData に firstDrawP1Ready / firstDrawP2Ready を書き込む
            └─ 双方 ready → tryAdvanceFirstDrawToPlayingIfBothReady() → status: "playing"
```

**`tryAdvanceFirstDrawToPlayingIfBothReady` の冪等性保証**

```js
if (window.__playingStarted) return;
if (window._firstDrawAdvanceSent) return;
window.__playingStarted = true;
window._firstDrawAdvanceSent = true;
```

- 2つのフラグで二重遷移を防止
- Firebase 書き込み失敗時は `_firstDrawAdvanceSent = false` にリセット → リトライ可能

**先攻・後攻の枚数差の意図**

- 先攻: 5枚から3枚選ぶ（2枚戻す）
- 後攻: 6枚から3枚選ぶ（3枚戻す）
- 後攻は選択肢が多い → 後攻の不利を補う設計

**`insertCardIntoDeckAtRandom` の実装**

```js
const idx = Math.floor(Math.random() * (d.length + 1));
d.splice(idx, 0, storeId);
```

- 0 〜 deck.length のランダムな位置に挿入（均等分布）✅

**潜在的な問題**

- `takeOut()` が `update(true)` を呼ぶ → `updateFirstDrawPhaseUI()` が再帰的に呼ばれる
  - `cardsBound` フラグで二重バインドを防止 ✅
  - `_firstDrawPhaseStarted` フラグで `startFirstDrawPhase()` の多重実行を防止 ✅
- `firstDrawUnchosenMarked` 属性のカードを `tryAdvanceFirstDrawToPlayingIfBothReady` でクリーンアップ
  - ただし `firstDrawUnchosenMarked` を設定するコードが見当たらない → デッドコードの可能性

---

### C. resultManager 勝敗判定フロー（確定）

**`checkGameResult()` の判定条件**

```
checkGameResult() は update() の末尾で毎回呼ばれる

スキップ条件:
  - _resultShowing / _resultDismissed / _isResetting フラグが立っている
  - gameReady が false
  - status !== "playing"
  - round < 1 または turn < 1
  - 両デッキが空（ゲーム開始直後）

勝敗判定:
  1. Firebase から winner が同期されてきた場合:
     - winnerSetAt < _gameStartedAt → stale として無視・Firebase からクリア
     - それ以外 → showResultScreen(winner)
  2. ローカル判定（HP <= 0）:
     - 自分のみ HP=0 → 相手の勝利
     - 相手のみ HP=0 → 自分の勝利
     - 両方 HP=0 → 引き分け（player1 のみログを出す）
     - winner を Firebase に書き込む → 相手側でも checkGameResult が発火
```

**敗北条件の種類**

| 条件 | 処理 |
|------|------|
| HP <= 0 | `checkGameResult()` が検知 → `showResultScreen()` |
| オーバードロー（デッキ枚数超過） | `takeOut()` 内で `triggerOverdrawDefeat()` を 500ms 後に呼ぶ |
| デッキ空でドロー | `game.js` のドロー処理で `triggerOverdrawDefeat()` を 500ms 後に呼ぶ |

**`triggerOverdrawDefeat` の設計**

```js
function triggerOverdrawDefeat() {
  if (_resultShowing || _resultDismissed || _isResetting) return;
  const winner = opRole;
  state.matchData.winner = winner;
  state.matchData.winnerSetAt = Date.now();
  firebaseClient.writeMatchData(gameRoom, state.matchData);
  showResultScreen(winner);
}
```

- 自分が敗北者として winner = 相手 を書き込む
- 相手側は Firebase 経由で winner を受け取り `checkGameResult()` で `showResultScreen()` を呼ぶ

**再戦フロー**

```
requestRematch()
  → Firebase rooms/{room}/rematch/{me} に { requested: true } を書き込む

watchRematchRequest() (Firebase リスナー)
  → 両者の requested が true になったら executeReset() を呼ぶ
  → rematch ノードを削除
```

- `_rematchWatcher` は `showResultScreen()` 内で1回のみ登録
- `closeResultScreen()` でリスナーを解除しない → 閉じた後も相手の再戦申し込みを受け取れる ✅
- `closeResultScreen()` は `state.matchData.winner = null` にして Firebase に書き込む
  → `_resultDismissed = true` で再判定を防止

**潜在的な問題**

- `checkGameResult()` は `update()` のたびに呼ばれる → `syncLoop` の毎秒 `update()` でも呼ばれる
  - `_resultShowing` / `_resultDismissed` フラグで多重表示を防止 ✅
- 両者が同時に HP=0 になった場合、両クライアントが独立して `winner` を書き込む
  - player1 が `draw` を書き込み、player2 が `player1` を書き込む可能性がある（競合）
  - ただし `winnerSetAt` の stale チェックで古い値は無視される → 実害は少ない

---

### Round 20 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 26 | `takeOut()` でもドロー時に PP ログが出る（PP 変化のたびにチャット欄に表示） | 低 | contextMenu.js |
| 27 | `firstDrawUnchosenMarked` 属性を設定するコードが存在しない（デッドコード） | 低 | firstDrawPhase.js |
| 28 | 両者同時 HP=0 時の winner 競合（draw vs player1 の書き込み競合） | 低 | game.js checkGameResult |

**設計上の特徴（意図的）**

- 後攻は6枚から3枚選ぶ（先攻5枚より1枚多い）→ 後攻不利の補正 ✅
- `tryAdvanceFirstDrawToPlayingIfBothReady` は2フラグで冪等性を保証 ✅
- `closeResultScreen()` はリスナーを解除しない → 閉じた後も再戦申し込みを受け取れる ✅
- stale winner チェックでリセット後の誤判定を防止 ✅

### 次に調べる場所

- `js/ui/contextMenu.js` の `takeOut()` 全体（ドロー処理の詳細）
- `js/game/game.js` の `update()` 全体フロー（checkGameResult の呼び出し位置）
- `js/game/phases/dicePhase.js` → ダイスフェーズ全体フロー

---

## Round 21 — update() 全体フロー / takeOut() / dicePhase 全体フロー

### A. update() の全体フロー（確定）

```
update(skipLogCheck = false)
  ├─ applyInteractionLockState()
  ├─ runPhaseProgression()
  ├─ handleMatchStateTransitions()
  │    ├─ ターン開始ドロー（startTurnDraw を setTimeout で遅延実行）
  │    ├─ ラウンド通知 / ターン通知（showRoundNotification / showNotification）
  │    └─ checkGameResult()  ← 勝敗判定
  ├─ JSON.stringify(state) で状態文字列化
  ├─ updateZoneCountsInState()
  ├─ state 変化なし → 早期リターン（DOM 再構築スキップ）
  ├─ checkAndLogStateChanges(oldState, state)  ← レベルアップ検知
  ├─ lastStateJson = currentStateStr
  ├─ handOverflowDiscardOpen → 最小限更新で早期リターン
  ├─ renderUI()  ← 全 DOM 再描画
  └─ _afterUpdateHooks を順番に実行  ← pvpveWatcher._onAfterUpdate
```

**`update()` の最適化設計**

- `lastStateJson` との比較で state 変化がなければ DOM 再構築をスキップ ✅
- `skipLogCheck = true` の場合は `checkAndLogStateChanges` をスキップ（ログ重複防止）
- `invokeGuarded` でラップ → 各ステップの例外が他のステップに影響しない

**`handleMatchStateTransitions` のターン開始ドロー**

```js
const drawKey = `${m.round}-${m.turn}-${m.turnPlayer}`;
if (!shouldSkipNormalDrawInR1T1 && lastTurnDrawKey !== drawKey) {
  lastTurnDrawKey = drawKey;
  const drawDelay = roundChanged ? 4500 : 1500;
  setTimeout(() => startTurnDraw(), drawDelay);
}
```

- `drawKey` で同一ターンの二重ドローを防止 ✅
- R1T1 かつ `firstDrawDone !== true` の場合はスキップ（ファーストドロー優先）
- ラウンド変更時は 4500ms 遅延（ラウンド通知アニメーション後）

**`checkGameResult` の呼び出し位置**

- `handleMatchStateTransitions()` の末尾 → `update()` のたびに呼ばれる
- `syncLoop` の毎秒 `update()` でも呼ばれる → 毎秒勝敗チェックが走る
- `_resultShowing` / `_resultDismissed` フラグで多重表示を防止 ✅

---

### B. takeOut() の全体フロー（確定）

```
takeOut(count, opts)
  ├─ visMode = opts.visibility === "self" ? "self" : "none"
  ├─ オーバードローチェック:
  │    count > deck.length かつ status !== "setup_first_draw"
  │    → isOverdraw = true, actual = deck.length
  ├─ actual 枚ループ:
  │    ├─ deck.pop() でカードIDを取得
  │    ├─ createCard(id) で DOM 生成
  │    ├─ visibility / owner / origin を設定
  │    └─ placeCard() でフィールドに配置（デッキ位置付近）
  ├─ isOverdraw → addGameLog("[DEFEAT]") + setTimeout(triggerOverdrawDefeat, 500)
  ├─ addGameLog("カードをN枚取り出した")
  ├─ saveAllImmediate()
  ├─ updateDeckObject()
  ├─ pushMyStateDebounced()
  └─ update(true)  ← skipLogCheck=true
```

**PP 回復は `takeOut` 内ではなく呼び出し元で行われる**

- `takeOut()` 自体は PP を変更しない
- PP 回復（`dState.pp += actual`）は `takeOut` の**呼び出し元**（`drawCards` 関数内）で行われる
- Round 20 の「takeOut 内の PP 回復」は誤り → 正確には `drawCards()` 内

**`drawCards` と `takeOut` の関係**

```
drawCards(count)  ← ターン開始ドロー・手動ドロー
  ├─ takeOut(count, { visibility: "none" })  ← カードを引く
  └─ dState.pp += actual  ← PP 回復（addVal 非経由）
     addGameLog("[システム] PP: ...")

takeOut(count, opts)  ← ファーストドロー・直接呼び出し
  ← PP 変更なし
```

- `drawCards` 経由のドローのみ PP が回復する
- ファーストドロー（`takeOut` 直接呼び出し）は PP を変更しない ✅

**オーバードローの判定**

- `status === "setup_first_draw"` の場合はオーバードロー敗北を発動しない
  → ファーストドロー中にデッキが足りなくても敗北にならない ✅
- それ以外の場合は 500ms 後に `triggerOverdrawDefeat()` を呼ぶ

---

### C. dicePhase 全体フロー（確定）

**フロー全体**

```
status === "setup_dice" になると update() → updateDicePhaseUI() が呼ばれる

updateDicePhaseUI()
  ├─ status === "ready_check" → 「接続待ち」オーバーレイを表示
  ├─ status !== "setup_dice" → オーバーレイを削除して return
  └─ status === "setup_dice":
       ├─ 両者 diceValue >= 0 → phase = "result"
       │    ├─ 引き分け → 「振り直し」ボタン（handleResetDice）
       │    ├─ 勝者 → 先攻/後攻選択ボタン（handleChooseOrder）
       │    └─ 敗者 → 「相手が選択中...」表示
       └─ 片方または両方 diceValue = -1 → phase = "rolling"
            └─ 「ダイスを振る」ボタン（handleDiceRoll）

handleDiceRoll()
  ├─ diceValue !== -1 なら return（二重振り防止）
  ├─ 1000ms アニメーション待機
  ├─ Math.random() * 100 + 1 でロール（1〜100）
  ├─ state[playerKey].diceValue = roll（ローカル即反映）
  ├─ update()
  ├─ firebaseClient.setPlayerDice(gameRoom, playerKey, roll)
  └─ firebaseClient.writeMyState(gameRoom, playerKey, ...)

handleChooseOrder(goFirst)
  ├─ matchData.turnPlayer / firstPlayer / status / round / turn を設定
  ├─ status = "setup_evolution"
  ├─ 自分の evolutionPath / evoContinuousDmgCount / evoBackwaterExpGained をリセット
  ├─ firebaseClient.writeMatchData()
  └─ firebaseClient.writeMyState()

handleResetDice()
  ├─ 両者の diceValue を -1 にリセット
  ├─ firebaseClient.resetPlayerDice()
  └─ updateDicePhaseUI()
```

**ダイス値の管理パス**

- 書き込み: `rooms/{room}/playerDice/{playerKey}` （`setPlayerDice`）
- 読み込み: `diceWatcher.js` が `rooms/{room}/playerDice` を監視 → `state[p].diceValue` を更新
- `playerState` パスには `diceValue` を含めない（`_getMyStateForSync` で除外）

**引き分け時の振り直し**

- `handleResetDice()` は両者の `diceValue` を -1 にリセット
- Firebase の `playerDice` ノードを削除（`resetPlayerDice`）
- 両者が再度ボタンを押す必要がある

**先攻/後攻選択の設計**

- ダイスで勝ったプレイヤーのみ選択ボタンが表示される
- 選択後 `status = "setup_evolution"` → 進化の道選択フェーズへ
- `handleChooseOrder` は**ダイス勝者のクライアントのみ**が呼ぶ
  → `writeMatchData` で相手にも反映される ✅

**潜在的な問題**

- `handleDiceRoll` は `Math.random()` でクライアント側でロール → 両者が独立して乱数を生成
  → 引き分けの場合は `handleResetDice` で振り直し（サーバー側での乱数生成なし）
- ダイス値は 1〜100 の整数 → 引き分け確率は 1/100 = 1%

---

### Round 21 サマリー

**Round 20 の誤りを訂正**

- PP 回復は `takeOut()` 内ではなく `drawCards()` 内で行われる
- `takeOut()` 直接呼び出し（ファーストドロー）は PP を変更しない

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 29 | ダイスロールがクライアント側の `Math.random()` → サーバー検証なし（不正ロール可能） | 低（信頼前提のゲーム） | dicePhase.js |

**設計上の特徴（意図的）**

- `update()` の `lastStateJson` 比較で不要な DOM 再構築をスキップ ✅
- `drawKey` で同一ターンの二重ドローを防止 ✅
- ファーストドロー中のオーバードロー敗北を抑制 ✅
- ダイス勝者のみが先攻/後攻を選択 → `writeMatchData` で相手に反映 ✅

### 次に調べる場所

- `js/game/game.js` の `renderUI()` → 全 DOM 再描画の内容
- `js/game/game.js` の `startTurnDraw()` → ターン開始ドローの実装
- `js/phases/setupPhase.js` → 進化の道選択フェーズ

---

## Round 22 — renderUI() / startTurnDraw() / setupPhase 進化の道選択

### A. renderUI() の全体フロー（確定）

```
renderUI()
  ├─ renderOwnerUI(myOwner)  → #gameUiPlayerInner に innerHTML 設定
  ├─ renderOwnerUI(enemyOwner) → #gameUiEnemy に innerHTML 設定
  ├─ updateMatchUI()          → ラウンド/ターン表示・TURN ENDボタン・リザルトボタン
  ├─ updateDicePhaseUI()      → ダイスフェーズオーバーレイ
  ├─ updateDeckObject()       → デッキ枚数表示
  ├─ updateFieldStatusPanels() → PP/手札パネル（fixed）
  ├─ renderStatusBlocks()     → ステータスブロック
  ├─ updateGameLogs(state.logs) → チャット欄
  └─ lucide.createIcons()     → Lucide アイコン再生成
```

**設計上の特徴**

- `renderOwnerUI` は `innerHTML` を全置換 → 毎 `update()` で DOM を再構築
  - `lastStateJson` 比較で state 変化がない場合はスキップされる ✅
- `updateDicePhaseUI` / `updateMatchUI` は `renderUI` 内から呼ばれる
  - `update()` → `renderUI()` → `updateDicePhaseUI()` の呼び出しチェーン
  - `updateFirstDrawPhaseUI` / `updateEvolutionPhaseUI` は `updateMatchUI` 内から呼ばれる
- Lucide アイコンは `innerHTML` 更新後に毎回 `createIcons()` を呼ぶ
  - 存在しないアイコン名は `data-lucide` 属性を削除してスキップ（エラー握りつぶし）

**`renderUI` が呼ばない処理**

- `organizeBattleZones()` / `organizeHands()` → カード位置の整列は呼ばない
  - これらはドロー・ゾーン配置等のアクション側で明示的に呼ぶ設計

---

### B. startTurnDraw() / startR1T1() の実装（確定）

**startTurnDraw() — ターン開始ドロー（R1T1 以外）**

```
startTurnDraw()
  ├─ status !== "playing" or turnPlayer !== me or winner → return
  ├─ deck.length === 0 → addGameLog("[DEFEAT]") + triggerOverdrawDefeat()
  ├─ deck.pop() で1枚取得
  ├─ createCard(id) で DOM 生成
  ├─ visibility = "self"（自分のみ見える）
  ├─ placeCard() でフィールドに配置
  ├─ myState.pp = Math.min(currentPp + 1, maxPp)  ← PP+1（直接変更）
  ├─ organizeHands()
  ├─ アニメーション（上から落下）
  ├─ addGameLog("カードを1枚引いた")
  ├─ saveAllImmediate()
  └─ update()
```

- PP+1 は `addVal()` を経由しない → PP ログが出ない（意図的）
- `addVal` 経由にすると `[システム] PP:` ログが毎ターン出てしまうため

**startR1T1() — ラウンド1ターン1のフォールバック**

- `firstDrawDone === true` の場合はスキップ（ファーストドロー済み）
- `firstDrawDone !== true` の場合のみ実行（ファーストドローフェーズをスキップした場合）
- 5枚を `deck.pop()` で取り出して盤面に配置（非公開）
- `showR1T1Selection()` を呼ぶが、この関数は**空実装** `function showR1T1Selection(_n) {}`
  → **フォールバックが機能しない**（カードが盤面に置かれるだけで選択 UI が出ない）

**`drawCards()` との違い**

| 関数 | PP 変更 | ログ | 呼び出し元 |
|------|---------|------|-----------|
| `startTurnDraw()` | `myState.pp += 1` 直接 | `カードを1枚引いた` | `handleMatchStateTransitions` の setTimeout |
| `drawCards(n)` | `dState.pp += actual` 直接 | `[システム] PP: prev → next` | 手動ドロー操作 |
| `takeOut(n)` | なし | `カードをN枚取り出した` | ファーストドロー・直接呼び出し |

- `startTurnDraw` と `drawCards` はどちらも PP を直接変更するが、ログの出し方が異なる
- `startTurnDraw` は PP ログを出さない（意図的）
- `drawCards` は `[システム] PP:` ログを出す

---

### C. setupPhase.js — 進化の道選択フェーズ（確定）

**フロー全体**

```
status === "setup_evolution" になると update() → renderUI() → updateMatchUI()
  → updateEvolutionPhaseUI() が呼ばれる

updateEvolutionPhaseUI()
  ├─ status !== "setup_evolution" → オーバーレイを非表示
  ├─ myPath && opPath（両者選択済み）:
  │    ├─ turnPlayer === me かつ !_evoPhaseTransitioning → 1500ms 後に遷移
  │    │    status = "setup_first_draw"
  │    │    firstDrawDone / firstDrawP1Ready / firstDrawP2Ready = false
  │    │    writeMatchData()
  │    └─ 「ファーストドローフェーズへ移行します...」表示
  ├─ myPath のみ選択済み → 「相手の選択を待っています...」表示
  └─ 未選択 → 4択ボタン UI を表示（rendered フラグで1回のみ構築）

selectEvolutionPath(pathName)
  ├─ state[me].evolutionPath = pathName
  ├─ addGameLog("[EVOLUTION] ...")
  ├─ firebaseClient.writeMyState()
  ├─ overlay.dataset.rendered を削除（強制再描画）
  └─ update()
```

**遷移の責任分担**

- `setup_evolution → setup_first_draw` の遷移は **turnPlayer（先攻）のクライアントのみ**が実行
  - `_evoPhaseTransitioning` フラグで二重遷移を防止
  - 後攻クライアントは Firebase 経由で `matchData.status` の変化を受け取る

**`selectEvolutionPath` の設計**

- 自分の `evolutionPath` のみ書き込む（相手のデータは触らない）
- `writeMyState()` で Firebase に送信 → 相手の `roomWatcher` が `opStateListener` で受信
- 相手の `evolutionPath` が更新されると `updateEvolutionPhaseUI()` が再評価される

**潜在的な問題**

- `_evoPhaseTransitioning` は `finally` でリセットされる → 遷移失敗時もリセット ✅
- ただし `_evoPhaseTransitioning` はグローバル変数 → `executeReset` でリセットされるか要確認

---

### Round 22 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 30 | `showR1T1Selection()` が空実装 → R1T1 フォールバックが機能しない | 中 | game.js |
| 31 | `_evoPhaseTransitioning` が `executeReset` でリセットされるか未確認 | 低 | setupPhase.js |

**設計上の特徴（意図的）**

- `renderUI` は `innerHTML` 全置換 → `lastStateJson` 比較でスキップ最適化 ✅
- `startTurnDraw` は PP ログを出さない（`addVal` 非経由）→ チャット欄の汚染を防ぐ ✅
- 進化の道遷移は先攻クライアントのみが実行 → 競合防止 ✅
- `selectEvolutionPath` は自分のデータのみ書き込む → 設計原則遵守 ✅

**全体の未解決リスト（Round 1〜22 最終版）**

| # | 問題 | 深刻度 | 修正方針 |
|---|------|--------|---------|
| 2 | デッキ枚数 0 でも READY 可能 | 低 | matchSetup.js に枚数チェック追加 |
| 3/25 | 進化の道ロジックが3箇所に重複 | 中 | `getEvolutionPathParam` を統一使用 |
| 13 | arcana が defstackMax をリセットしない | 低〜中 | damageCalc.js に1行追加 |
| 15/17 | `_lastRoundSeen` リセット漏れ → ラウンド1モンスター未出現 | 中 | `startPvpveWatcher` に `_lastRoundSeen = 0` + `executeReset` から再呼び出し |
| 18/26 | モンスター討伐 PP+2 ログ2行 / ドロー時 PP ログ | 低 | `addVal` の pp ログ削除 or `MonsterCombatSystem` 側のログ削除 |
| 20 | PP ボタン操作のたびにチャット欄にログ | 低〜中 | `addVal` の pp ログをデバッグフラグ化 |
| 24 | `calcNextTurn` デッドコード | 低 | `handleTurnEnd` で使用するか削除 |
| 27 | `firstDrawUnchosenMarked` 設定コードなし | 低 | 属性設定コードを追加 or クリーンアップ処理を削除 |
| 28 | 両者同時 HP=0 時の winner 競合 | 低 | player1 のみ書き込む等の調整 |
| 29 | ダイスロールがクライアント側 `Math.random()` のみ | 低 | 信頼前提のゲームなので許容 |
| 30 | `showR1T1Selection()` が空実装 | 中 | 実装するか `startR1T1` 自体を削除 |
| 31 | `_evoPhaseTransitioning` が `executeReset` でリセットされるか未確認 | 低 | `executeReset` に追加 |
| 23 | `js/chat/chatUI.js` デッドファイル | 低 | ファイル削除 |

---

## Round 23 — firebase-client.js / runPhaseProgression / applyInteractionLockState

### A. firebase-client.js の設計（確定）

**クラス構造**

```
FirebaseClient
  ├─ initialize(config)          ← 匿名認証 → DB 接続
  ├─ setupConnectionMonitoring() ← .info/connected 監視
  ├─ createRoom / joinRoom       ← ルーム作成・参加
  ├─ watchRoom / watchRoomList   ← ルーム監視
  ├─ setReady / leaveRoom        ← プレイヤー操作
  ├─ setupOnDisconnect           ← 切断時自動退出
  ├─ writeMyState(roomName, playerKey, state)  ← 自分の状態書き込み（3回リトライ）
  ├─ writeMatchData(roomName, matchData)       ← matchData 書き込み（3回リトライ）
  ├─ sendChangeRequest(...)      ← 相手ステータス変更リクエスト
  ├─ clearChangeRequest(...)     ← pendingChange クリア
  ├─ setPlayerDice / resetPlayerDice ← ダイス値管理
  ├─ appendLog / resetRoomGameState  ← ログ・リセット
  └─ cleanupStaleRooms           ← ゴーストルーム削除
```

**Firebase パス構造（全体）**

```
rooms/{room}/
  ├─ players/{playerKey}         ← 接続状態（onDisconnect で自動削除）
  ├─ playerState/{playerKey}     ← ゲーム状態（writeMyState）
  ├─ matchData                   ← 試合進行（writeMatchData）
  ├─ playerDice/{playerKey}      ← ダイス値（setPlayerDice）
  ├─ fieldCards/{playerKey}      ← フィールドカード（writeFieldCards）
  ├─ pendingChange/{fromKey}     ← 相手ステータス変更リクエスト（sendChangeRequest）
  ├─ logs                        ← ゲームログ（push）
  ├─ rematch/{playerKey}         ← 再戦リクエスト
  └─ pvpve/                      ← PvPvE モンスター状態
       ├─ monsters               ← MonsterManager.serialize()
       └─ targets                ← BattleTargetSystem.serialize()
```

**`writeMyState` / `writeMatchData` のリトライ設計**

```js
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await this.db.ref(...).set(data);
    return true;
  } catch (e) {
    if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
    // 500ms, 1000ms の間隔でリトライ
  }
}
```

- 最大3回リトライ（500ms → 1000ms 間隔）
- 失敗時は `false` を返す（呼び出し元はエラーハンドリングなし）

**`sendChangeRequest` の設計**

```js
await this.db.ref(`rooms/${roomName}/pendingChange/${fromKey}`).set({
  target, key, type, value,
  ts: firebase.database.ServerValue.TIMESTAMP
});
```

- `fromKey`（送信者）のパスに上書き → 同一送信者からの複数リクエストは最後のみ残る
- `roomWatcher.js` の `pendingListener` が受信 → `pendingChange` ハンドラで処理

**`cleanupStaleRooms` の設計**

- プレイヤー0人のルーム → 即削除
- `waiting` かつ1人部屋で24時間超 → 削除
- ルーム一覧取得時（`watchRoomList` / `fetchRoomListOnce`）に自動実行

**`setupOnDisconnect` の設計**

```js
await playerRef.onDisconnect().remove();          // 切断時にプレイヤーノードを削除
await roomUpdatedRef.onDisconnect().set(TIMESTAMP); // updatedAt を更新
```

- ブラウザを閉じた時・ネットワーク切断時に Firebase サーバーが自動実行
- `cancelOnDisconnect()` でキャンセル可能（リロード前に呼ぶ）

**`updateRoomGameState` は deprecated**

- `@deprecated` コメントあり → `writeMyState` / `writeMatchData` を使うこと
- 内部では `matchData` のみ書き込む（後方互換）

---

### B. runPhaseProgression() の設計（確定）

```
runPhaseProgression()
  ├─ matchData がない → return
  └─ _bothPlayersConnected かつ status === "ready_check"
       → status = "setup_dice"（ローカル即反映）
       → GameTimer.start("dice", 10000)（タイマー開始）
       → firebaseClient.writeMatchData()（Firebase に書き込み）
```

- `update()` のたびに呼ばれる → 両者接続済みになった瞬間に `ready_check → setup_dice` へ遷移
- **両者接続済みの判定は `_bothPlayersConnected` フラグ**（`roomWatcher.js` の `playersListener` が設定）
- Firebase 書き込みは非同期（`.then().catch()`）→ ローカルは即時反映、Firebase は後から追従

**`isGameInteractionLocked()` の判定ロジック**

```js
window.isGameInteractionLocked = function() {
  if (!isGamePage) return false;
  if (state.matchData?.winner || window._lastWinner) return true;  // 勝者決定後はロック
  const inGamePhase = status && status !== "ready_check" && status !== "setup_dice";
  if (inGamePhase) return false;  // ゲーム中フェーズは切断でもロックしない
  return !window._soloStartMode && (!window._bothPlayersConnected || status === "ready_check");
};
```

- 勝者決定後 → 常にロック（TURN END ボタン等が無効化）
- `setup_evolution` / `setup_first_draw` / `playing` → 切断中でもロックしない
- `ready_check` / `setup_dice` → 両者未接続の場合はロック

**`_syncGate` の設計**

```js
window._syncGate = {
  firebaseReady: false,
  roomWatcherReady: false,
  playersReady: false,
  phaseReady: false,
  initDone: false
};
```

- 全フラグが `true` になるとローディングオーバーレイが非表示になる
- `executeReset` では `initDone` / `roomWatcherReady` / `phaseReady` を `false` にリセット → オーバーレイ再表示

---

### C. resetAllGameVariables() の設計（確定）

- 両プレイヤーが退出した場合（`roomWatcher.js` の `playerCount === 0`）に呼ばれる
- `gameReady = false` / `state` を初期値にリセット / `localStorage` をクリア
- `_evoPhaseTransitioning` は**リセットされない** → 問題 #31 確定

**`executeReset` と `resetAllGameVariables` の違い**

| 項目 | executeReset | resetAllGameVariables |
|------|-------------|----------------------|
| 呼び出し元 | 再戦合意時 | 両者退出時 |
| Firebase 削除 | 不要データを削除 | `resetRoomGameState` を呼ぶ |
| watcher 再設定 | `setupRoomWatcher()` を呼ぶ | `stopAllWatchers()` を呼ぶ |
| localStorage | 一部削除 | 全削除（gameRoom 含む） |
| `_evoPhaseTransitioning` | リセットされない | リセットされない |

---

### Round 23 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 31 | `_evoPhaseTransitioning` が `executeReset` / `resetAllGameVariables` でリセットされない | 低 | setupPhase.js / game.js |
| 32 | `writeMyState` / `writeMatchData` のリトライ失敗時に呼び出し元がエラーハンドリングしない | 低 | firebase-client.js |

**設計上の特徴（意図的）**

- `sendChangeRequest` は `fromKey` パスに上書き → 同一送信者の複数リクエストは最後のみ残る（デバウンス効果）✅
- `isGameInteractionLocked` はゲーム中フェーズ（`setup_evolution` 以降）では切断中でもロックしない → 一時的な切断でゲームが止まらない ✅
- `runPhaseProgression` は `update()` のたびに呼ばれるが、`ready_check` 以外では何もしない → 軽量 ✅
- `cleanupStaleRooms` はルーム一覧取得時に自動実行 → ゴーストルームが蓄積しない ✅

### 次に調べる場所

- `js/network/timerSync.js` → GameTimer の実装
- `js/ui/animationUI.js` → showNotification / showRoundNotification の実装
- `js/state/gameState.js` → makeCharState の定義（初期状態の全フィールド確認）


---

## Round 24 — timerSync.js / animationUI.js / gameState.js

### A. timerSync.js — GameTimer の実装（確定）

**ClockSync の設計**

```js
async function sync(attempts = 3) {
  // GitHub Pages 等で /api/time が 404 になるため NTP 廃止
  _offset = 0;
  _rtt = 0;
  _synced = true;
}
```

- **NTP は実質無効化**（`_offset = 0` 固定）
- `ClockSync.now()` は `Date.now() + 0` = `Date.now()` と等価
- 「ホスト権威タイマー」の設計思想はあるが、クロック補正は機能していない
- タブ非アクティブ復帰時に `ClockSync.sync(3)` を呼ぶが、`_offset = 0` のまま → 再同期の意味がない

**GameTimer の設計**

```
start(key, remainingMs, seq=0)
  → endTimestamp = Date.now() + remainingMs
  → _timers[key] = { endTimestamp, pausedRemaining: null, seq, paused: false }

getRemainingMs(key)
  → Math.max(0, endTimestamp - Date.now())

tick()  ← rAF ループで 100ms ごとに呼ばれる
  → 各タイマーの _displayRemaining を trueVal に向けて lerp 補正
  → |diff| > 2000ms なら即ジャンプ（reconnect 後の大きなズレ対応）
```

**rAF ループの設計**

```js
function _timerRafLoop(timestamp) {
  _rafId = requestAnimationFrame(_timerRafLoop);
  if (timestamp - _lastRafTime < 100) return;  // 100ms 未満はスキップ
  _lastRafTime = timestamp;
  GameTimer.tick();
  if (typeof onTimerTick === "function") onTimerTick();
}
```

- `requestAnimationFrame` を使用 → タブ非アクティブ時は停止（`setInterval` より省電力）
- 100ms ごとに `GameTimer.tick()` + `onTimerTick()` を呼ぶ
- `onTimerTick` は `game.js` 側で定義（タイマー切れ時の処理）

**`applyFromServer` の seq チェック**

```js
if (seq < existing.seq) return;  // 古いパケットを無視
if (seq === existing.seq && existing.endTimestamp === endTimestamp) return;  // 重複を無視
```

- seq 番号で古いパケットを無視 → パケット順序の乱れに対応
- ただし `start()` は常に `seq=0` で呼ぶ → seq チェックが機能しない（全て seq=0）
- `applyFromServer` は Firebase 経由でタイマー状態を受け取る想定だが、**Firebase へのタイマー書き込みコードが存在しない**

**GameTimer の実際の使用状況**

- `runPhaseProgression()` で `GameTimer.start("dice", 10000)` を呼ぶ（ダイスフェーズ 10 秒）
- `onTimerTick` の定義が `game.js` にあるか要確認
- `applyFromServer` / `serialize` / `pause` / `resume` の呼び出し元が存在しない可能性がある

**潜在的な問題**

- **NTP が無効化されているため、クライアント間のクロックズレが補正されない**
  - 両クライアントの `Date.now()` が異なる場合、タイマーの残り時間表示がズレる
  - ただし `endTimestamp` はホストが設定し Firebase 経由で共有する設計のため、`applyFromServer` が正しく呼ばれれば問題ない
  - **実際には `applyFromServer` が呼ばれていない可能性がある**（Firebase 書き込みコードが見当たらない）
- **`start()` の seq=0 固定** → 複数回 `start()` を呼んでも seq が増えない → `applyFromServer` の seq チェックが機能しない
- **`onTimerTick` の定義場所が不明** → タイマー切れ時の処理が実装されているか要確認

---

### B. animationUI.js — showNotification / showRoundNotification（確定）

**`showNotification(text, color)` の設計**

```
DOM 生成 → document.body.appendChild → 2700ms 後に自動削除
```

- `position: fixed; top: 40%; left: 50%` → 画面中央やや上に表示
- `pointer-events: none` → クリックを透過（ゲーム操作を妨げない）
- `text === "あなたのターン"` の場合のみサブテキスト「自動で1枚ドローします。」を表示
- CSS アニメーション: `notifyIn`（0.8s）→ 表示 → `notifyOut`（0.5s、1.8s 後）
- `notifyIn` / `notifyOut` のキーフレームは **animationUI.js に定義されていない**
  → 別ファイル（おそらく CSS ファイル）で定義されているか、または未定義

**`showRoundNotification(round)` の設計**

```
DOM 生成 → document.body.appendChild → 3200ms 後に自動削除
```

- `position: fixed; inset: 0` → 全画面オーバーレイ
- `background: radial-gradient(...)` → 中央が明るい暗転エフェクト
- `round === 1` の場合のみ「新たな戦いが始まる」サブタイトルを表示
- CSS アニメーション: `roundFadeIn`（0.6s）→ 表示 → `roundFadeOut`（0.6s、2.4s 後）
- `roundFadeIn` / `roundFadeOut` / `roundContentScale` / `roundNumberPulse` / `roundSubtitleSlide` のキーフレームも **animationUI.js に定義されていない**

**潜在的な問題**

- **CSS アニメーションのキーフレームが animationUI.js に定義されていない**
  - `notifyIn` / `notifyOut` / `roundFadeIn` 等が未定義の場合、アニメーションが動作しない
  - ただし `showNotification` 内で `notificationStyles` を動的に追加しているが、`subNotifyIn` のみ定義
  - `notifyIn` / `notifyOut` は別の CSS ファイルで定義されている可能性がある
- **`showRoundNotification` のアニメーションキーフレームは全て外部 CSS 依存**
  - 外部 CSS が読み込まれていない場合、アニメーションなしで表示される（機能的には問題なし）
- **複数の通知が同時に表示される可能性**
  - `showNotification` は既存の通知を削除せずに新規追加する
  - 連続して呼ばれると複数の通知が重なる

---

### C. gameState.js — makeCharState / 初期状態（確定）

**`BASE_INITIAL_STATE` の全フィールド**

```js
{
  level: 1,      levelMax: 6,
  exp: 0,        expMax: 2,
  hp: 20,        hpMax: 20,
  shield: 0,     shieldMax: 5,
  defstack: 0,   defstackMax: 0,   defstackOverMax: false,
  atk: 1,        atkMax: 999,
  def: 0,        defMax: 999,
  instantDef: 0, instantDefMax: 999,
  pp: 0,         ppMax: 2,
  deck: [],
  backImage: null,
  statusBlocks: []
}
```

**重要な発見: `defstackMax` の初期値が 0**

- `defstackMax: 0` → 初期状態では防御スタックが機能しない
- `defstack: 0` かつ `defstackMax: 0` の状態で `damage` 攻撃を受けると:
  - `defstack > 0` は false → `passDamage += 1` + `defstack = defstackMax = 0` → 毎回1ダメ通過
  - **初期状態では全ての通常ダメージが1ダメずつ通過する**
- `defstackMax` は `applyLevelStats` または手動設定で増加する設計と思われる

**`window.state` の初期構造**

```js
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
```

- `diceValue: -1` は「未ロール」を示す（0〜100 がロール済み）
- `matchData` は `state` の直下（`state.player1` / `state.player2` と同列）
- `logs` は `state.logs`（`addGameLog` が追加する）

**`makeCharState()` の実装**

```js
function makeCharState() {
  return JSON.parse(JSON.stringify(BASE_INITIAL_STATE));
}
```

- `JSON.parse(JSON.stringify(...))` でディープコピー → `deck: []` / `statusBlocks: []` が共有されない ✅
- `BASE_INITIAL_STATE` は `Object.freeze` されていない → 直接変更可能（ただし `makeCharState` 経由で使う設計）

**`normalizeState` との整合性**

- `normalizeState` は `makeCharState()` で再生成する条件: `state.player1` / `state.player2` が不正な場合のみ
- 通常は `makeCharState()` の初期値が `normalizeState` のデフォルト値として使われる
- `defstackMax: 0` が `normalizeState` でクランプされると `defstack` も 0 にクランプされる → 問題なし

**`evolutionPath` / `evoContinuousDmgCount` / `evoBackwaterExpGained` が `BASE_INITIAL_STATE` に含まれない**

- これらは `game.js` の `executeReset` / `handleFreshStart` で直接 `state[p].evolutionPath = null` 等として設定される
- `makeCharState()` には含まれない → `normalizeState` でも初期化されない
- `executeReset` でリセットされるが、`resetAllGameVariables` でリセットされるか要確認（問題 #31 と関連）

---

### Round 24 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 33 | `ClockSync.sync()` が `_offset = 0` 固定で NTP が無効化されている | 低 | timerSync.js |
| 34 | `GameTimer.start()` の `seq=0` 固定 → `applyFromServer` の seq チェックが機能しない | 低 | timerSync.js |
| 35 | `GameTimer.applyFromServer` / `serialize` の呼び出し元が存在しない可能性 → タイマーが Firebase 同期されていない | 中 | timerSync.js |
| 36 | `showNotification` / `showRoundNotification` の CSS アニメーションキーフレームが animationUI.js に未定義 | 低 | animationUI.js |
| 37 | `showNotification` が既存通知を削除せずに追加 → 連続呼び出しで通知が重なる | 低 | animationUI.js |
| 38 | `defstackMax` の初期値が 0 → 初期状態では全通常ダメージが通過する | 要確認 | gameState.js |
| 39 | `evolutionPath` / `evoContinuousDmgCount` / `evoBackwaterExpGained` が `BASE_INITIAL_STATE` に含まれない → `makeCharState()` で初期化されない | 低 | gameState.js |

**設計上の特徴（意図的）**

- `GameTimer` は lerp による視覚的な滑らかさを重視した設計 ✅
- rAF ループで 100ms ごとに tick → タブ非アクティブ時は停止（省電力）✅
- `makeCharState()` は `JSON.parse(JSON.stringify(...))` でディープコピー → 参照共有なし ✅
- `defstackMax: 0` は「防御スタックなし」の初期状態を表す（`applyLevelStats` で設定される設計）

**全体の未解決リスト（Round 1〜24 最終版）**

| # | 問題 | 深刻度 | 修正方針 |
|---|------|--------|---------|
| 2 | デッキ枚数 0 でも READY 可能 | 低 | matchSetup.js に枚数チェック追加 |
| 3/25 | 進化の道ロジックが3箇所に重複 | 中 | `getEvolutionPathParam` を統一使用 |
| 13 | arcana が defstackMax をリセットしない | 低〜中 | damageCalc.js に1行追加 |
| 15/17 | `_lastRoundSeen` リセット漏れ → ラウンド1モンスター未出現 | 中 | `startPvpveWatcher` に `_lastRoundSeen = 0` + `executeReset` から再呼び出し |
| 18/26 | モンスター討伐 PP+2 ログ2行 / ドロー時 PP ログ | 低 | `addVal` の pp ログ削除 or `MonsterCombatSystem` 側のログ削除 |
| 20 | PP ボタン操作のたびにチャット欄にログ | 低〜中 | `addVal` の pp ログをデバッグフラグ化 |
| 24 | `calcNextTurn` デッドコード | 低 | `handleTurnEnd` で使用するか削除 |
| 27 | `firstDrawUnchosenMarked` 設定コードなし | 低 | 属性設定コードを追加 or クリーンアップ処理を削除 |
| 28 | 両者同時 HP=0 時の winner 競合 | 低 | player1 のみ書き込む等の調整 |
| 30 | `showR1T1Selection()` が空実装 | 中 | 実装するか `startR1T1` 自体を削除 |
| 31 | `_evoPhaseTransitioning` が `executeReset` / `resetAllGameVariables` でリセットされない | 低 | `executeReset` / `resetAllGameVariables` に追加 |
| 32 | `writeMyState` / `writeMatchData` のリトライ失敗時に呼び出し元がエラーハンドリングしない | 低 | 呼び出し元で `false` チェックを追加 |
| 35 | `GameTimer` が Firebase 同期されていない可能性 | 中 | `onTimerTick` の実装確認 + Firebase 書き込み追加 |
| 36 | アニメーションキーフレームが animationUI.js に未定義 | 低 | CSS ファイルの確認 |
| 38 | `defstackMax: 0` 初期値 → 初期状態で全通常ダメージ通過 | 要確認 | `applyLevelStats` の確認 |
| 39 | `evolutionPath` 等が `BASE_INITIAL_STATE` に含まれない | 低 | `BASE_INITIAL_STATE` に追加 or `executeReset` で確実にリセット |
| 23 | `js/chat/chatUI.js` デッドファイル | 低 | ファイル削除 |

### 次に調べる場所

- `game.js` の `onTimerTick` 定義 → タイマー切れ時の処理
- `game.js` の `applyLevelStats` → `defstackMax` の設定タイミング
- CSS ファイル（`notifyIn` / `roundFadeIn` 等のキーフレーム定義）


---

## Round 25 — timerSync / animationUI / gameState 詳細確認（訂正・補足）

### A. CSS アニメーションキーフレームの実際の定義場所（問題 #36 訂正）

**`notifyIn` / `notifyOut` → `game.js` の `injectGameStyles()` IIFE で動的注入**

```js
(function injectGameStyles() {
  if (document.getElementById('gameAnimStyles')) return;
  const s = document.createElement('style');
  s.id = 'gameAnimStyles';
  s.textContent = `
    @keyframes notifyIn { ... }
    @keyframes notifyOut { ... }
    @keyframes resultFadeIn { ... }
    @keyframes fadeIn { ... }
    @keyframes dicePulse { ... }
    @keyframes diceRolling { ... }
    @keyframes pulse { ... }
    ...
  `;
  document.head.appendChild(s);
})();
```

**`roundFadeIn` / `roundFadeOut` / `roundContentScale` / `roundNumberPulse` / `roundSubtitleSlide` → `game.js` の `injectRoundNotificationStyles()` IIFE で動的注入**

```js
(function injectRoundNotificationStyles() {
  if (document.getElementById('roundNotificationStyles')) return;
  const s = document.createElement('style');
  s.id = 'roundNotificationStyles';
  s.textContent = `
    @keyframes roundFadeIn { ... }
    @keyframes roundFadeOut { ... }
    @keyframes roundContentScale { ... }
    @keyframes roundNumberPulse { ... }
    @keyframes roundSubtitleSlide { ... }
  `;
  document.head.appendChild(s);
})();
```

- **問題 #36 は誤り** → キーフレームは `game.js` の IIFE で `<head>` に動的注入される ✅
- `animationUI.js` が `game.js` より後に読み込まれるため、`showNotification` / `showRoundNotification` が呼ばれる時点でキーフレームは定義済み ✅
- `subNotifyIn` のみ `animationUI.js` 内で動的追加（`notificationStyles` スタイルタグ）

**`messaging.js` の `showNotification` との重複**

- `messaging.js` にも `showNotification` 相当の関数が存在し、`notifyIn` / `notifyOut` を使用
- `game.js` の `injectGameStyles` が先に実行されるため、`messaging.js` の通知も正しくアニメーションする ✅

---

### B. `onTimerTick` の実際の定義場所（確定）

**`timerUI.js` に定義（`game.js` ではなかった）**

```js
window.onTimerTick = function() {
  if (typeof GameTimer === "undefined") return;
  const diceRemaining = GameTimer.getRemainingMs('dice');
  const statusMsg = document.getElementById("dice-status-msg");
  if (statusMsg) {
    let html = "";
    if (diceRemaining > 0) {
      html = `ダイスロール開始まで: ${Math.ceil(diceRemaining / 1000)} 秒`;
    } else if (state.matchData.status === "setup_dice" && s.diceValue < 0) {
      html = `ダイスを振ってください！`;
    }
    if (html !== lastStatusHtml) {
      statusMsg.innerHTML = html;
      lastStatusHtml = html;
    }
  }
};
```

- `onTimerTick` は **ダイスフェーズのカウントダウン表示のみ**を担当
- タイマー切れ時の処理（自動ダイスロール等）は**実装されていない**
- `GameTimer.isExpired('dice')` を呼ばない → タイマー切れを検知しない

**`GameTimer` の実際の使用状況（確定）**

| 関数 | 呼び出し元 | 用途 |
|------|-----------|------|
| `GameTimer.start('dice', 10000)` | `runPhaseProgression()` | ダイスフェーズ開始時に 10 秒タイマーをセット |
| `GameTimer.getRemainingMs('dice')` | `timerUI.js` の `onTimerTick` | カウントダウン表示 |
| `GameTimer.applyFromServer` | **呼び出し元なし** | Firebase 同期用だが未使用 |
| `GameTimer.serialize` | **呼び出し元なし** | Firebase 書き込み用だが未使用 |
| `GameTimer.pause` / `resume` / `stop` | **呼び出し元なし** | 未使用 |
| `GameTimer.isExpired` | **呼び出し元なし** | タイマー切れ検知なし |

**結論（問題 #35 確定）**

- `GameTimer` は「ダイスフェーズのカウントダウン表示」にのみ使われている
- Firebase 同期（`applyFromServer` / `serialize`）は**完全に未使用**
- タイマー切れ時の自動処理（強制ダイスロール等）は**実装されていない**
- 「ホスト権威タイマー」の設計思想は実装されていない → **表示専用タイマー**として機能している

---

### C. `_evoPhaseTransitioning` のリセット状況（問題 #31 確定）

**`executeReset` のリセット対象フラグ一覧**

```js
window._gameStartInitiated = false;
window._gameStartedAt = Date.now();
window._resultDismissed = false;
window._resultShowing = false;
window.__playingStarted = false;
window._firstDrawPhaseStarted = false;
window._firstDrawAdvanceSent = false;
window._lastWinner = null;
window._soloStartMode = false;
// ← _evoPhaseTransitioning は含まれない ❌
```

**`resetAllGameVariables` のリセット対象フラグ一覧**

```js
gameReady = false;
lastResetAt = 0;
lastTurnPlayer = null;
window._lastRound = undefined;
window._isResetting = false;
window._resultShowing = false;
window._resultDismissed = false;
window._firstDrawPhaseStarted = false;
window._firstDrawAdvanceSent = false;
window.__playingStarted = false;
window._orderPhaseAutoStartScheduled = false;
window._soloStartMode = false;
window._gameStartInitiated = false;
// ← _evoPhaseTransitioning は含まれない ❌
```

**問題 #31 確定: `_evoPhaseTransitioning` は両方でリセットされない**

- `setupPhase.js` の `finally` ブロックで `_evoPhaseTransitioning = false` にリセットされる
- ただし遷移中に例外が発生して `finally` が実行されない場合（ページリロード等）は `true` のまま残る
- リセット後に `setup_evolution` フェーズに入ると、`_evoPhaseTransitioning = true` のまま → 遷移が実行されない
- **修正**: `executeReset` と `resetAllGameVariables` に `window._evoPhaseTransitioning = false;` を追加

---

### D. `applyLevelStats` と `defstackMax` の設定（問題 #38 確定）

**`applyLevelStats` の実装（確定）**

```js
function applyLevelStats(owner, force = false) {
  const s = state[owner];
  const lv = s.level || 1;
  if (!force && s._lastAppliedLv === lv) return;  // 同レベルなら再計算しない
  const idx = Math.min(lv - 1, LEVEL_MAX - 1);
  const prevDef = Number(s.def) || 0;
  s.atk        = BASE_INITIAL_STATE.atk        + (LEVEL_STATS.atk[idx]        || 0);
  s.def        = BASE_INITIAL_STATE.def        + (LEVEL_STATS.def[idx]        || 0);
  s.instantDef = BASE_INITIAL_STATE.instantDef + (LEVEL_STATS.instantDef[idx] || 0);
  const defIncrease = (Number(s.def) || 0) - prevDef;
  if (defIncrease > 0) {
    s.defstack = (Number(s.defstack) || 0) + defIncrease;  // def 増加分だけ defstack も増やす
  }
  s.defstackMax = Number(s.def) || 0;  // ← defstackMax = def に設定
  s._lastAppliedLv = lv;
}
```

**`syncDerivedStats` との関係**

```js
function syncDerivedStats(owner) {
  const s = state[owner];
  s.defstackMax = s.def || 0;  // ← defstackMax = def に設定（applyLevelStats と同じ）
  s.expMax = calcExpMax(s.level || 1);
}
```

**`defstackMax` の設定フロー（確定）**

```
ゲーム開始時:
  makeCharState() → defstackMax = 0, def = 0
  ↓
  applyLevelStats(owner, true) が executeReset 内で呼ばれる
  ↓
  LEVEL_STATS.def[0] が設定されていれば def > 0 → defstackMax = def > 0
  LEVEL_STATS.def[0] = 0 の場合は defstackMax = 0 のまま
```

**問題 #38 の評価（確定）**

- `defstackMax: 0` は初期値だが、`applyLevelStats` が呼ばれると `LEVEL_STATS.def[0]` の値に更新される
- `LEVEL_STATS.def[0]` が 0 の場合（レベル1の def ボーナスなし）は `defstackMax = 0` のまま
- **実際の挙動は `LEVEL_STATS` の内容に依存** → `LEVEL_STATS` の確認が必要
- `syncDerivedStats` も `defstackMax = def` を設定するため、`addVal` / `setVal` 後も正しく更新される ✅

---

### Round 25 サマリー

**問題 #36 訂正**

- CSS アニメーションキーフレームは `game.js` の IIFE で動的注入される → **問題なし** ✅
- 問題 #36 を「解決済み」に変更

**確定した問題（更新）**

| # | 問題 | 深刻度 | 修正方針 |
|---|------|--------|---------|
| 31 | `_evoPhaseTransitioning` が `executeReset` / `resetAllGameVariables` でリセットされない | 低 | 両関数に `window._evoPhaseTransitioning = false;` を追加 |
| 35 | `GameTimer` が表示専用タイマーとして機能（Firebase 同期・タイマー切れ処理なし） | 低〜中 | 仕様として許容するか、タイマー切れ時の自動処理を追加 |
| 38 | `defstackMax` の初期値 0 → `LEVEL_STATS.def[0]` が 0 の場合は初期状態で防御スタックなし | 要確認 | `LEVEL_STATS` の内容確認 |

**設計上の特徴（意図的）**

- `injectGameStyles` / `injectRoundNotificationStyles` は IIFE で初回のみ実行 → 重複注入なし ✅
- `onTimerTick` はダイスフェーズのカウントダウン表示のみ → シンプルな設計
- `applyLevelStats` は `_lastAppliedLv` キャッシュで同レベルの再計算をスキップ → 最適化 ✅
- `syncDerivedStats` と `applyLevelStats` の両方が `defstackMax = def` を設定 → 冗長だが安全

**全体の未解決リスト（Round 1〜25 最終版）**

| # | 問題 | 深刻度 | 修正方針 |
|---|------|--------|---------|
| 2 | デッキ枚数 0 でも READY 可能 | 低 | matchSetup.js に枚数チェック追加 |
| 3/25 | 進化の道ロジックが3箇所に重複 | 中 | `getEvolutionPathParam` を統一使用 |
| 13 | arcana が defstackMax をリセットしない | 低〜中 | damageCalc.js に1行追加 |
| 15/17 | `_lastRoundSeen` リセット漏れ → ラウンド1モンスター未出現 | 中 | `startPvpveWatcher` に `_lastRoundSeen = 0` + `executeReset` から再呼び出し |
| 18/26 | モンスター討伐 PP+2 ログ2行 / ドロー時 PP ログ | 低 | `addVal` の pp ログ削除 or `MonsterCombatSystem` 側のログ削除 |
| 20 | PP ボタン操作のたびにチャット欄にログ | 低〜中 | `addVal` の pp ログをデバッグフラグ化 |
| 24 | `calcNextTurn` デッドコード | 低 | `handleTurnEnd` で使用するか削除 |
| 27 | `firstDrawUnchosenMarked` 設定コードなし | 低 | 属性設定コードを追加 or クリーンアップ処理を削除 |
| 28 | 両者同時 HP=0 時の winner 競合 | 低 | player1 のみ書き込む等の調整 |
| 30 | `showR1T1Selection()` が空実装 | 中 | 実装するか `startR1T1` 自体を削除 |
| 31 | `_evoPhaseTransitioning` が `executeReset` / `resetAllGameVariables` でリセットされない | 低 | 両関数に `window._evoPhaseTransitioning = false;` を追加 |
| 32 | `writeMyState` / `writeMatchData` のリトライ失敗時に呼び出し元がエラーハンドリングしない | 低 | 呼び出し元で `false` チェックを追加 |
| 35 | `GameTimer` が表示専用タイマーとして機能（Firebase 同期・タイマー切れ処理なし） | 低〜中 | 仕様として許容するか、タイマー切れ時の自動処理を追加 |
| 38 | `defstackMax` 初期値 0 → `LEVEL_STATS.def[0]` 依存 | 要確認 | `LEVEL_STATS` の内容確認 |
| 39 | `evolutionPath` 等が `BASE_INITIAL_STATE` に含まれない | 低 | `BASE_INITIAL_STATE` に追加 or `executeReset` で確実にリセット（現状は `executeReset` でリセット済み） |
| 23 | `js/chat/chatUI.js` デッドファイル | 低 | ファイル削除 |

### 次に調べる場所

- `data/levelStats.json` または `LEVEL_STATS` の定義 → `def[0]` の値確認（問題 #38）
- `js/game/core.js` の `load()` → `LEVEL_STATS` の読み込みフロー
- `js/game/game.js` の `startR1T1()` → 空実装の `showR1T1Selection` の影響範囲（問題 #30）


---

## Round 26 — LEVEL_STATS 実データ / startR1T1 詳細 / firstDrawUnchosenMarked / calcNextTurn

### A. LEVEL_STATS 実データ（問題 #38 確定）

**`data/levelStats.json` の内容**

```json
{
  "atk":        [0, 0, 1, 2, 2, 3],
  "def":        [0, 1, 1, 2, 3, 4],
  "instantDef": [1, 1, 2, 2, 3, 3]
}
```

**`core.js` のデフォルト値（`loadLevelStats` 失敗時のフォールバック）**

```js
let LEVEL_STATS = {
  atk:        [0, 0, 1, 2, 2, 3],
  def:        [0, 1, 1, 2, 3, 4],
  instantDef: [1, 1, 2, 2, 3, 3]
};
```

- `data/levelStats.json` とデフォルト値が**完全に一致** → ファイル読み込み失敗時も同じ値が使われる ✅

**`applyLevelStats` の計算結果（Lv1）**

```
BASE_INITIAL_STATE.def = 0
LEVEL_STATS.def[0]     = 0   ← Lv1 の def ボーナスは 0

s.def        = 0 + 0 = 0
s.defstackMax = 0
```

- **Lv1 では `def = 0` → `defstackMax = 0`** → 初期状態で防御スタックなし
- `defstack = 0` かつ `defstackMax = 0` → 通常ダメージが毎回1ダメ通過する
- **これは意図的な設計**: Lv1 は防御スタックなし、Lv2 以降で `def` が増加して防御スタックが機能する

**レベル別 def / defstackMax の推移**

| Lv | def ボーナス | def 合計 | defstackMax |
|----|------------|---------|-------------|
| 1 | 0 | 0 | 0 |
| 2 | 1 | 1 | 1 |
| 3 | 1 | 1 | 1 |
| 4 | 2 | 2 | 2 |
| 5 | 3 | 3 | 3 |
| 6 | 4 | 4 | 4 |

- Lv2 で初めて `defstackMax = 1` → 通常ダメージを1回吸収できる
- Lv6 で `defstackMax = 4` → 4回連続で通常ダメージを吸収できる

**問題 #38 → 解決済み（意図的な設計）**

- `defstackMax: 0` の初期値は「Lv1 は防御スタックなし」という仕様を正しく表現している ✅
- `applyLevelStats` が Lv2 以降で `defstackMax` を増加させる設計 ✅

---

### B. startR1T1 の詳細（問題 #30 詳細確認）

**`startR1T1()` の実装（確定）**

```
startR1T1()
  ├─ firstDrawDone === true → return（ファーストドロー済みならスキップ）
  ├─ deck.length < 5 → return（デッキ不足）
  ├─ deck.pop() × 5 → takenCards（5枚取り出し）
  ├─ 各カードを createCard() で DOM 生成
  │    visibility = "none"（非公開）
  │    placeCard() でデッキ位置付近に配置（x: deckX+100+i*80, y: deckY-200）
  ├─ showR1T1Selection(takenCards.length)  ← 空実装
  └─ addGameLog("R1T1を開始しました")
```

**`showR1T1Selection` の実装**

```js
/** R1T1 用の追加 UI（未実装）。盤面への5枚配置のみ startR1T1 が担当。 */
function showR1T1Selection(_n) {}
```

- コメントに「未実装」と明記されている
- `startR1T1` は5枚を盤面に配置するが、**3枚選択 UI が出ない**
- 5枚が非公開で盤面に置かれたまま → プレイヤーは手動で3枚を選んで残り2枚を山札に戻す必要がある
- ファーストドローフェーズ（`setup_first_draw`）が正常に動作している場合は `startR1T1` は呼ばれない
  → `firstDrawDone === true` チェックで早期リターン

**`startR1T1` が呼ばれる条件**

```
handleMatchStateTransitions()
  └─ roundChanged && isFirstTurnOfRound && m.round === 1 && m.firstDrawDone !== true
       → setTimeout(() => startR1T1(), 4500)
```

- `firstDrawDone !== true` の場合のみ呼ばれる
- 通常フロー（`setup_first_draw` → `playing`）では `firstDrawDone = true` が設定される → `startR1T1` は呼ばれない
- **フォールバックとして設計されているが、UI が未実装のため実質的に機能しない**

**問題 #30 の評価（確定）**

- `showR1T1Selection` が空実装 → 選択 UI なし
- ただし通常フローでは呼ばれない（`firstDrawDone = true` で保護）
- 呼ばれるのは「ファーストドローフェーズをスキップした場合」のみ → 現実的には発生しにくい
- **深刻度: 低〜中**（通常フローでは問題なし、フォールバックが機能しないだけ）

---

### C. firstDrawUnchosenMarked の実態（問題 #27 確定）

**読み取り箇所（firstDrawPhase.js）**

```js
const unchosenCards = Array.from(
  field.querySelectorAll('[data-firstDrawUnchosenMarked="true"]')
);
unchosenCards.forEach((card) => {
  if (card.dataset.firstDrawReturned !== "1") {
    const rawId = card.dataset.id;
    if (rawId) insertCardIntoDeckAtRandom(card.dataset.owner, storeId);
  }
  card.remove();
});
```

- `tryAdvanceFirstDrawToPlayingIfBothReady()` 内で呼ばれる
- `data-firstDrawUnchosenMarked="true"` を持つカードを山札に戻してから削除する

**書き込み箇所（全ファイル検索結果）**

- `data-firstDrawUnchosenMarked="true"` を**設定するコードが存在しない**（確定）
- `querySelectorAll('[data-firstDrawUnchosenMarked="true"]')` は常に空配列を返す
- クリーンアップ処理は**デッドコード**

**問題 #27 の評価（確定）**

- `firstDrawUnchosenMarked` 属性を設定するコードが存在しない → クリーンアップ処理は機能しない
- ただし通常フローでは「確定ボタン押下時に未選択カードを `insertCardIntoDeckAtRandom` で戻す」処理が別途実装されている
  → `firstDrawUnchosenMarked` なしでも正しく動作している ✅
- このクリーンアップは「何らかの理由でカードが残った場合の安全弁」として設計されたが、属性設定コードが実装されなかった
- **実害なし**（空のクリーンアップが走るだけ）

---

### D. calcNextTurn のデッドコード状況（問題 #24 確定）

**`calcNextTurn` の定義**

```js
function calcNextTurn(matchData) {
  const { turn, round, turnPlayer, firstPlayer } = matchData;
  const op = turnPlayer === "player1" ? "player2" : "player1";
  // ... ターン/ラウンド計算ロジック
}
window.calcNextTurn = calcNextTurn;
```

- `gameRules.js` に定義、`window.calcNextTurn` としてグローバル公開
- `handleTurnEnd`（`battlePhase.js`）は `calcNextTurn` を**使わず**、直接 `m.turn` / `m.round` / `m.turnPlayer` を計算している

**呼び出し元の検索結果**

- `calcNextTurn` を呼ぶコードは `gameRules.js` の定義のみ → **完全なデッドコード**
- `window.calcNextTurn` として公開されているが、どこからも参照されていない

**問題 #24 の評価（確定）**

- `calcNextTurn` は定義・公開されているが呼び出し元なし → デッドコード
- `handleTurnEnd` が独自にターン計算を行っている → 将来的に `calcNextTurn` を使うよう統一するか削除するかの判断が必要
- **実害なし**（デッドコードが存在するだけ）

---

### Round 26 サマリー

**問題 #38 → 解決済み（意図的な設計）**

- `defstackMax: 0` の初期値は「Lv1 は防御スタックなし」という仕様 ✅
- Lv2 以降で `applyLevelStats` が `defstackMax` を増加させる ✅

**問題 #27 → 実害なし（デッドコード）**

- `firstDrawUnchosenMarked` 設定コードなし → クリーンアップは空振りするだけ
- 通常フローは別の処理で正しく動作している ✅

**問題 #24 → 実害なし（デッドコード）**

- `calcNextTurn` は定義のみ、呼び出し元なし

**問題 #30 → 低〜中（フォールバック未実装）**

- `showR1T1Selection` は空実装、コメントに「未実装」と明記
- 通常フローでは呼ばれない（`firstDrawDone = true` で保護）

**全体の未解決リスト（Round 1〜26 最終版）**

| # | 問題 | 深刻度 | 修正方針 |
|---|------|--------|---------|
| 2 | デッキ枚数 0 でも READY 可能 | 低 | matchSetup.js に枚数チェック追加 |
| 3/25 | 進化の道ロジックが3箇所に重複 | 中 | `getEvolutionPathParam` を統一使用 |
| 13 | arcana が defstackMax をリセットしない | 低〜中 | damageCalc.js に1行追加 |
| 15/17 | `_lastRoundSeen` リセット漏れ → ラウンド1モンスター未出現 | 中 | `startPvpveWatcher` に `_lastRoundSeen = 0` + `executeReset` から再呼び出し |
| 18/26 | モンスター討伐 PP+2 ログ2行 / ドロー時 PP ログ | 低 | `addVal` の pp ログ削除 or `MonsterCombatSystem` 側のログ削除 |
| 20 | PP ボタン操作のたびにチャット欄にログ | 低〜中 | `addVal` の pp ログをデバッグフラグ化 |
| 24 | `calcNextTurn` デッドコード | 低 | `handleTurnEnd` で使用するか削除 |
| 27 | `firstDrawUnchosenMarked` 設定コードなし（クリーンアップが空振り） | 低 | 実害なし。属性設定コードを追加 or クリーンアップ処理を削除 |
| 28 | 両者同時 HP=0 時の winner 競合 | 低 | player1 のみ書き込む等の調整 |
| 30 | `showR1T1Selection()` が空実装（フォールバック未実装） | 低〜中 | 実装するか `startR1T1` 自体を削除 |
| 31 | `_evoPhaseTransitioning` が `executeReset` / `resetAllGameVariables` でリセットされない | 低 | 両関数に `window._evoPhaseTransitioning = false;` を追加 |
| 32 | `writeMyState` / `writeMatchData` のリトライ失敗時に呼び出し元がエラーハンドリングしない | 低 | 呼び出し元で `false` チェックを追加 |
| 35 | `GameTimer` が表示専用タイマーとして機能（Firebase 同期・タイマー切れ処理なし） | 低〜中 | 仕様として許容するか、タイマー切れ時の自動処理を追加 |
| 39 | `evolutionPath` 等が `BASE_INITIAL_STATE` に含まれない | 低 | `executeReset` で確実にリセット済み（現状は問題なし） |
| 23 | `js/chat/chatUI.js` デッドファイル | 低 | ファイル削除 |

**解決済みに変更**

| # | 問題 | 理由 |
|---|------|------|
| 36 | アニメーションキーフレーム未定義 | `game.js` の IIFE で動的注入済み ✅ |
| 38 | `defstackMax` 初期値 0 | Lv1 は防御スタックなしという意図的な設計 ✅ |

### 次に調べる場所

- `js/game/phases/battlePhase.js` の `handleTurnEnd` → `calcNextTurn` を使わない独自ターン計算の詳細
- `js/ui/contextMenu.js` の `arcana` ダメージ後の `defstackMax` リセット問題（問題 #13）の修正コスト確認
- 問題 #15/17 の修正: `pvpveWatcher.js` の `_lastRoundSeen` リセット + `executeReset` からの `startPvpveWatcher` 再呼び出し


---

## Round 27 — damageCalc arcana 問題 / battlePhase handleTurnEnd ターン計算 / 全体総括

### A. arcana の defstackMax リセット問題（問題 #13 詳細確認）

**`arcana` ケースの実装（確定）**

```js
case "arcana": {
  const brokenDef = Math.min(result.defstack, hits);
  result.defstack -= brokenDef;
  applyToShieldAndHp(hits - brokenDef);
  break;
}
```

- `defstack` を削るが、`defstackMax` へのリセットは**行わない**
- `defstack` が 0 になった後、次の `damage` 攻撃では:
  - `defstack = 0` → `passDamage += 1` + `defstack = defstackMax`（リセット）
  - つまり `arcana` で `defstack` を 0 にした後、次の `damage` 攻撃で即1ダメ通過 + defstack がリセットされる

**`damage` との比較（defstack=2, defstackMax=2, hits=3 の場合）**

| type | 処理 | 結果 |
|------|------|------|
| `damage` | defstack 2→1→0(1ダメ通過+リセット)→2 | 1ダメ通過、defstack=2 |
| `arcana` | defstack 2→0、余剰1をシールド/HPへ | 1ダメ通過、defstack=0 |

- `arcana` 後は `defstack = 0` のまま → 次の `damage` 攻撃で即1ダメ通過
- `damage` 後は `defstack = defstackMax` にリセット → 次の `damage` 攻撃は defstack から削る

**問題 #13 の評価（確定）**

- `arcana` は `defstack` を 0 にするが `defstackMax` へリセットしない → 次の `damage` 攻撃が有利になる
- これは**意図的な設計の可能性がある**:
  - `arcana` の説明文: 「防御突破時のバースト」→ 防御を突破した後の追撃が有利になる設計
  - `damage` は「防御スタックを削り、0 到達時にリセット」→ 防御が自動回復する
  - `arcana` は「防御を突破したまま維持」→ 防御が回復しない
- **修正するかどうかはゲームデザインの判断**

---

### B. battlePhase.js の handleTurnEnd ターン計算（確定）

**ターン計算ロジック（`calcNextTurn` を使わない独自実装）**

```js
const firstPlayer = m.firstPlayer || "player1";

if (m.turnPlayer === firstPlayer) {
  // 先攻のターン終了 → 後攻へ
  m.turnPlayer = op;
} else {
  // 後攻のターン終了 → 先攻へ、ターン+1
  m.turnPlayer = firstPlayer;
  m.turn += 1;
  if (m.turn > (window.TURNS_PER_ROUND || 5)) {
    m.turn = 1;
    m.round += 1;
    addGameLog(`[MATCH] 第 ${m.round} ラウンド開始！`);
  }
}
```

- `calcNextTurn`（`gameRules.js`）と**同じロジック**だが独自実装
- `window.TURNS_PER_ROUND`（= 5）を参照 → `gameRules.js` の定数を使用 ✅
- `firstPlayer` が `null` の場合は `"player1"` をデフォルトとして使用

**`calcNextTurn` との差異**

| 項目 | `handleTurnEnd` | `calcNextTurn` |
|------|----------------|----------------|
| 実装 | `m` を直接変更（mutation） | 新しいオブジェクトを返す（純粋関数） |
| ログ | `addGameLog("[MATCH] ...")` を呼ぶ | ログなし |
| 戻り値 | なし | `{ turn, round, turnPlayer, roundChanged }` |
| `roundChanged` | 計算しない（`_lastRound` で別途検知） | 返す |

- `handleTurnEnd` は state を直接変更する設計 → `calcNextTurn` の純粋関数設計と相容れない
- `calcNextTurn` を `handleTurnEnd` に組み込むには、戻り値を `m` に適用する処理が必要
- **現状の実装は機能的に正しい** → `calcNextTurn` は削除するか、将来のリファクタリング用として保持

**`handleTurnEnd` の全体フロー（最終確認）**

```
handleTurnEnd(skipHandLimitCheck = false)
  ├─ isGameInteractionLocked() → return
  ├─ turnPlayer !== me → return
  ├─ winner → return
  ├─ 手札上限チェック（skipHandLimitCheck=false の場合）
  │    超過 → showHandOverflowDiscardModal() → return
  ├─ _beforeTurnEndHooks を順番に実行
  ├─ ターン計算（m.turnPlayer / m.turn / m.round を直接変更）
  ├─ addGameLog("[TURN] ...")
  ├─ evoContinuousDmgCount = 0 / evoBackwaterExpGained = false / _turnDmgHistory = {}
  ├─ await firebaseClient.writeMatchData()
  ├─ await firebaseClient.writeMyState()
  ├─ update()
  └─ _afterTurnEndHooks を順番に実行
```

- `writeMatchData` / `writeMyState` の戻り値（`false` = 失敗）を**チェックしない**（問題 #32 の具体例）
- `_beforeTurnEndHooks` / `_afterTurnEndHooks` の例外は `try/catch` で握りつぶす ✅

---

### C. 全体総括（Round 1〜27）

**解析済みファイル一覧**

| ファイル | Round | 主な発見 |
|---------|-------|---------|
| `firstDrawPhase.js` | 1, 20, 22 | 無限ループ修正済み、ファーストドロー全体フロー |
| `cardData.js` / `deckCode.js` | 1, 2 | CARD_DB ロードタイミング、v3 形式 |
| `matchSetup.js` / `deckSelect.js` | 3 | deckCode 書き込みフロー |
| `damageCalc.js` | 4, 14, 27 | 純粋関数設計、arcana 問題 |
| `contextMenu.js` | 5, 19, 20 | PvP 攻撃フロー、進化の道重複 |
| `roomWatcher.js` | 6 | pendingChange ハンドラ |
| `core.js` | 7, 15, 16 | normalizeState、addVal、syncLoop |
| `MonsterCombatSystem.js` / `MonsterManager.js` | 8, 10, 12 | PvE システム |
| `pvpveWatcher.js` | 8, 10, 15, 16 | _lastRoundSeen 問題 |
| `battlePhase.js` | 9, 27 | handleTurnEnd、ターン計算 |
| `phaseWatcher.js` / `diceWatcher.js` | 9 | Firebase 監視フロー |
| `game.js` | 10, 15, 21, 22, 23, 25, 26 | executeReset、update、renderUI |
| `syncState.js` | 7, 15 | 重複定義 |
| `gameRules.js` | 19, 26 | calcNextTurn デッドコード |
| `resultManager.js` | 20 | 勝敗判定フロー |
| `dicePhase.js` | 21 | ダイスフェーズ全体フロー |
| `setupPhase.js` | 22, 23 | 進化の道選択、_evoPhaseTransitioning |
| `firebase-client.js` | 23 | Firebase パス構造、リトライ設計 |
| `timerSync.js` | 24, 25 | GameTimer 表示専用 |
| `animationUI.js` | 24, 25 | キーフレーム動的注入 |
| `gameState.js` | 24, 26 | BASE_INITIAL_STATE、defstackMax |
| `timerUI.js` | 25 | onTimerTick |
| `levelStats.json` | 26 | def[0]=0、Lv1 防御スタックなし |
| `battlePhase.js` | 27 | handleTurnEnd ターン計算 |

**修正優先度別リスト（最終版）**

**高優先度（中深刻度・実害あり）**

| # | 問題 | 修正コスト |
|---|------|-----------|
| 15/17 | `_lastRoundSeen` リセット漏れ → ラウンド1モンスター未出現 | 低（1行追加 + executeReset に1行追加） |
| 3/25 | 進化の道ロジックが3箇所に重複 | 中（contextMenu.js のリファクタ） |
| 13 | arcana が defstackMax をリセットしない（設計判断が必要） | 低（1行追加） |

**中優先度（低深刻度・コード品質）**

| # | 問題 | 修正コスト |
|---|------|-----------|
| 31 | `_evoPhaseTransitioning` リセット漏れ | 低（2行追加） |
| 20 | PP ボタン操作のたびにチャット欄にログ | 低（addVal の pp ログ削除） |
| 30 | `showR1T1Selection()` が空実装 | 中（UI 実装 or 削除） |
| 32 | writeMyState/writeMatchData 失敗時のエラーハンドリングなし | 低（呼び出し元に `if (!result)` 追加） |

**低優先度（デッドコード・軽微）**

| # | 問題 | 修正コスト |
|---|------|-----------|
| 24 | `calcNextTurn` デッドコード | 低（削除） |
| 27 | `firstDrawUnchosenMarked` 設定コードなし | 低（削除 or 追加） |
| 28 | 両者同時 HP=0 時の winner 競合 | 低 |
| 35 | `GameTimer` Firebase 未同期 | 中（設計判断が必要） |
| 23 | `js/chat/chatUI.js` デッドファイル | 低（削除） |
| 2 | デッキ枚数 0 でも READY 可能 | 低 |
| 18/26 | モンスター討伐 PP+2 ログ2行 | 低 |

**意図的な設計として確定したもの**

- `defstackMax: 0`（Lv1 は防御スタックなし）✅
- `arcana` が defstackMax をリセットしない（防御突破後の追撃有利）→ 設計判断
- `GameTimer` が表示専用（Firebase 同期なし）→ 現状の仕様
- `calcNextTurn` が `handleTurnEnd` で使われない → 独自実装が先行
- モンスター攻撃が防御スタックを無視（hp_reduce 相当）→ 意図的
- `sendChangeRequest` のデバウンスで最後の値のみ送信 → 意図的
- ダイスロールがクライアント側 `Math.random()` → 信頼前提のゲーム


---

## Round 28 — 未解析ファイル一括解析（messaging / firebase-sync / card / cardManager / handUI / overlayUI / statusBlocks / dragManager / watcherRegistry / render）

### A. messaging.js（確定）

**役割: `window.alert()` の代替 UI メッセージシステム**

| 関数 | 表示方法 | 用途 |
|------|---------|------|
| `showMessageToast(text, type)` | `#toast` 要素に 1.7 秒表示 | 汎用トースト |
| `showGameplayMessage(text, color)` | 画面中央に DOM 生成・2.5 秒後削除 | ゲームプレイ通知 |
| `showErrorMessage(text)` | 赤トースト + `console.error` | エラー |
| `showWarningMessage(text)` | 黄トースト + `console.warn` | 警告 |
| `showSuccessMessage(text)` | 緑トースト | 成功 |
| `showInfoMessage(text)` | 白トースト | 情報 |
| `attachTooltip(el, text, pos)` | hover で表示するツールチップ | ホバー説明 |

- `showGameplayMessage` は `animationUI.js` の `showNotification` と**ほぼ同じ実装**（フォントサイズ・アニメーション名が微妙に異なる）
  - `showNotification`: font-size 60px、letter-spacing 15px、2700ms
  - `showGameplayMessage`: font-size 48px、letter-spacing 10px、2500ms
- **重複実装**（問題 #40 として記録）
- `attachTooltip` は `element.parentElement.style.position = 'relative'` を設定する → 親要素のレイアウトに影響する可能性

---

### B. firebase-sync.js（確定）

**役割: 旧世代の Firebase 同期モジュール（現在は未使用）**

- `window.FirebaseSync` として公開
- `initFirebase` / `createRoom` / `joinRoom` / `leaveRoom` / `markReady` 等を実装
- **`game.html` で読み込まれているか要確認**
- `firebase-client.js`（現行）と機能が重複している
- `watchRoom` の実装が `firebase-client.js` と異なる（`hasJoined` フラグ管理等）
- ハートビート（30秒ごとに `.info/connected` を確認）を実装しているが、`firebase-client.js` にはない
- **デッドコードの可能性が高い**（問題 #41 として記録）

---

### C. card.js（確定）

**役割: 旧世代のカード定義（現在は未使用）**

```js
const CARDS = {
  "atk":   { name: "攻撃",  image: "assets/cards/NF404.png" },
  "heavy": { name: "強撃",  image: "assets/cards/NF404.png" },
  "guard": { name: "防御",  image: "assets/cards/スライド1.png" }
};
```

- 3枚のみ定義、全て `NF404.png`（存在しない画像）
- `CARD_DB`（`cardData.js`）が現行のカードデータ → `card.js` は**デッドコード**（問題 #42）
- `render.js` の `renderField` が `cards[obj.id]` を参照しているが、`CARDS` を使っている可能性がある

---

### D. render.js（確定）

**役割: 旧世代のフィールド描画（現在は未使用）**

```js
function renderField(player) {
  const area = document.getElementById("field");
  area.innerHTML = "";
  field.forEach(obj => {
    if (!isVisible(obj.visibility, player)) return;
    const card = cards[obj.id];  // ← CARDS を参照（旧世代）
    const el = document.createElement("img");
    el.src = card.image || "assets/404.png";
    // ...
  });
}
```

- `cards` 変数（`CARDS`）と `field` 変数（未定義）を参照
- `cardManager.js` の `createCard` / `placeCard` が現行の描画処理
- **デッドコード**（問題 #43）

---

### E. cardManager.js（確定）

**主要な発見（未解析部分）**

**座標変換（player2 の視点反転）**

```js
function toServerX(localX) {
  if (window.myRole === "player2") return FIELD_W - Number(localX) - CARD_W;
  return Number(localX);
}
```

- player2 は X/Y 座標を反転して保存 → Firebase 上は player1 視点の座標で統一
- `toLocalX` / `toLocalY` で逆変換して表示

**フィールドサイズ定数**

```
FIELD_W = 3000, FIELD_H = 2000
CARD_W = 320, CARD_H = 453
HAND_ZONE_Y_MIN = 1460  ← 手札ゾーンの Y 座標下限
```

**ゾーンアンカー座標（自分視点）**

| ゾーン | X | Y |
|-------|---|---|
| attacker | 1340（中央） | 1027（FIELD_H - CARD_H - 520） |
| skill | 930（attacker - CARD_W - 90） | 1027 |
| grave | 2660（FIELD_W - CARD_W - 20） | 1147（FIELD_H - CARD_H - 400） |

**`showBattleZonePpCostModal` の `onDone` コールバック**

- Round 13/14 で解析した実装に `onDone` パラメータが追加されている
- `close()` 時に `onDone()` を呼ぶ → キャンセル時も `onDone` が呼ばれる
- ドラッグ完了後の後処理に使用

**`repairDuplicateDomInstanceIds` / `normalizeFieldCardData`**

- DOM 上の重複 instanceId を修復する関数
- `isBrokenCardInstanceId` で `"cardInstance_NaN"` を検出
- `restoreFieldCards` 等でフィールドを復元する際に呼ばれる

**`updateHandReorderGuides`（手札並べ替えガイド）**

- ドラッグ中に手札内の挿入位置を縦線で表示
- `myHandZoneBg` 要素の矩形を参照して手札ゾーンを判定
- `handReorderGuide` クラスの DOM を動的生成

**潜在的な問題**

- `beginZoneHoverCardDrag` が `showZoneStackInspectHover` を参照しているが、コメントに「obsolete」とある → デッドコード（問題 #44）

---

### F. handUI.js（確定）

**`organizeHands()` の設計**

- 手札カードを `handOrder` でソートして中央寄せに整列
- 手札枚数が多い場合は `actualSpacing` を縮小して重ねる（最小間隔なし → 枚数が多いと完全に重なる）
- `status === "playing"` の場合は `firstDrawHideVisLabel` クラスを自動解除
- 自分の手札: Y = `FIELD_H - CARD_H - 20` = 1527px
- 相手の手札: Y = 20px（画面上部）

**`prevMyHandCount`**

- `window.prevMyHandCount = -1` として初期化
- `update()` 内で `countOwnerHandCardsOnField(me)` の結果を代入
- `contextMenu.js` の背水の道判定で参照

---

### G. overlayUI.js（確定）

**`openEvolutionPathModal(owner)` の設計**

- 進化の道の詳細説明モーダルを表示
- `getEvolutionPathHTML(owner)` でレベル依存のパラメータを計算して HTML 生成
- **`getEvolutionPathParam`（`gameRules.js`）を使わず独自にレベルインデックスを計算**（問題 #3/25 の追加例）
- Escape キーで閉じる、背景クリックで閉じる ✅

**`showHandOverflowDiscardModal(owner, needCount)` の設計**

- 手札上限超過時に捨てるカードを選択するモーダル
- `handOverflowDiscardOpen` フラグで多重表示を防止
- 捨てたカードを `placeCardInZone(c, owner, "grave")` で墓地へ
- 忍耐の道: 捨てた枚数分 EXP 獲得（最大 2）→ `addVal(owner, "exp", gain)`
- 捨て終わったら `handleTurnEnd(true)` を呼ぶ（`skipHandLimitCheck=true`）

**`getEvolutionPathHTML` の独自レベルインデックス計算**

```js
let idx = 0;
if (lv >= 6) idx = 3;
else if (lv >= 5) idx = 2;
else if (lv >= 3) idx = 1;
```

- `gameRules.js` の `getEvolutionPathParam` と同じロジックだが**3箇所目の重複**（問題 #3/25）

---

### H. statusBlocks.js（確定）

**設計概要**

- `state[owner].statusBlocks` 配列に格納されたブロックを描画
- `type: "field"` → `#fieldContent` 内の絶対座標に配置（ズーム・パンに追従）
- `type: "ui"` → `#uiStatusBlocksLayer`（`position: fixed`）に配置（画面固定）
- `ownerType: "shared"` → 両プレイヤーに表示（座標は player2 視点で反転）
- `ownerType: "self"` → 自分のみ編集可能（相手は `readonly disabled`）

**Firebase 同期**

- 自分のブロック変更: `pushMyStateDebounced()` → `writeMyState` 経由
- 相手のブロック変更（双方向編集）: `firebaseClient.writeMyState(gameRoom, owner, state[owner])` を直接呼ぶ
  - **`_getMyStateForSync()` を経由しない** → デッキ内容が `HIDDEN` 化されずに送信される可能性（問題 #45）

**ローカルプレゼンテーション**

- `sb_presentation` キーで `localStorage` に位置・サイズを保存
- `shared` ブロックは Firebase 同期、`self` ブロックはローカル保存
- `type` 変更時にローカルプレゼンテーションをリセット ✅

**潜在的な問題**

- `updateAndSyncBlockOwner` で相手のブロックを変更する際、`state[owner]` を直接 Firebase に書き込む → デッキ内容が漏洩する可能性（問題 #45）

---

### I. dragManager.js（確定）

**設計**

```js
window.DragManager = {
  activeDrags: new Set(),
  register(releaseCallback) { ... },
  unregister(releaseCallback) { ... },
  releaseAll(e) { ... }
};
```

- `pointerup` / `pointercancel` / `mouseup` / `blur` / `visibilitychange` で `releaseAll` を呼ぶ
- ドラッグ中にタブを切り替えた場合も `releaseAll` が呼ばれる → ドラッグが確実に終了する ✅
- `capture: true` で最優先にイベントを捕捉

---

### J. watcherRegistry.js（確定）

**設計**

```js
window.registerWatcher(name, unsubscribeFn)
  → 既存の同名ウォッチャーを解除してから登録

window.clearAllWatchers()
  → 全ウォッチャーを一括解除
```

- `_activeWatchers` オブジェクトで名前→解除関数を管理
- `pvpve` リスナーは `watcherRegistry` に登録されていない → `clearAllWatchers` で解除されない（Round 15 確認済み）

---

### Round 28 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 40 | `showGameplayMessage`（messaging.js）と `showNotification`（animationUI.js）が重複実装 | 低 | messaging.js / animationUI.js |
| 41 | `firebase-sync.js` が `firebase-client.js` と機能重複（デッドコードの可能性） | 低 | firebase-sync.js |
| 42 | `card.js` の `CARDS` 定義が旧世代でデッドコード | 低 | card.js |
| 43 | `render.js` の `renderField` が旧世代でデッドコード | 低 | render.js |
| 44 | `beginZoneHoverCardDrag` 内の `showZoneStackInspectHover` 参照が obsolete | 低 | cardManager.js |
| 45 | `statusBlocks.js` の `updateAndSyncBlockOwner` が `_getMyStateForSync()` を経由せず相手の state を直接送信 → デッキ内容漏洩の可能性 | 中 | statusBlocks.js |

**設計上の特徴（意図的）**

- `DragManager` は `capture: true` + `visibilitychange` でドラッグを確実に終了させる ✅
- `watcherRegistry` はシンプルな名前→解除関数マップ ✅
- `statusBlocks` の `shared` ブロックは座標反転で両プレイヤーに同じ位置に表示 ✅
- `handUI.js` の `organizeHands` は手札枚数に応じて間隔を自動調整 ✅
- `overlayUI.js` の `showHandOverflowDiscardModal` は忍耐の道の EXP 獲得を正しく処理 ✅

**全体の未解決リスト（Round 1〜28 最終版）**

| # | 問題 | 深刻度 | 修正方針 |
|---|------|--------|---------|
| 2 | デッキ枚数 0 でも READY 可能 | 低 | matchSetup.js に枚数チェック追加 |
| 3/25 | 進化の道ロジックが4箇所に重複（overlayUI.js も含む） | 中 | `getEvolutionPathParam` を統一使用 |
| 13 | arcana が defstackMax をリセットしない（設計判断） | 低〜中 | ゲームデザイン確認後に対応 |
| 15/17 | `_lastRoundSeen` リセット漏れ → ラウンド1モンスター未出現 | 中 | `startPvpveWatcher` に `_lastRoundSeen = 0` + `executeReset` から再呼び出し |
| 20 | PP ボタン操作のたびにチャット欄にログ | 低〜中 | `addVal` の pp ログをデバッグフラグ化 |
| 24 | `calcNextTurn` デッドコード | 低 | 削除 |
| 27 | `firstDrawUnchosenMarked` 設定コードなし | 低 | 実害なし |
| 28 | 両者同時 HP=0 時の winner 競合 | 低 | player1 のみ書き込む等 |
| 30 | `showR1T1Selection()` が空実装 | 低〜中 | 実装 or 削除 |
| 31 | `_evoPhaseTransitioning` リセット漏れ | 低 | 両関数に1行追加 |
| 32 | writeMyState/writeMatchData 失敗時のエラーハンドリングなし | 低 | 呼び出し元で `false` チェック |
| 35 | `GameTimer` Firebase 未同期（表示専用） | 低〜中 | 仕様として許容 |
| 40 | `showGameplayMessage` と `showNotification` の重複 | 低 | どちらかに統一 |
| 41 | `firebase-sync.js` デッドコードの可能性 | 低 | game.html の読み込み確認後に削除 |
| 42 | `card.js` の `CARDS` デッドコード | 低 | 削除 |
| 43 | `render.js` の `renderField` デッドコード | 低 | 削除 |
| 44 | `beginZoneHoverCardDrag` の obsolete 参照 | 低 | 削除 |
| 45 | `statusBlocks.js` が相手の state を直接送信（デッキ内容漏洩の可能性） | 中 | `_getMyStateForSync()` 経由に変更 |
| 23 | `js/chat/chatUI.js` デッドファイル | 低 | 削除 |
| 18/26 | モンスター討伐 PP+2 ログ2行 | 低 | MonsterCombatSystem 側のログ削除 |

### 次に調べる場所

- `game.html` の script 読み込みリスト → `firebase-sync.js` / `card.js` / `render.js` が実際に読み込まれているか確認
- `js/ui/deckViewer.js` / `js/ui/menu.js` → 未解析 UI ファイル
- `js/statusBlocks/statusBlockPresets.js` → プリセット管理
- `js/ui/preview/cardPreview.js` → カードプレビュー


---

## Round 29 — 残存ファイル一括解析（deckViewer / menu / drag / statusBlockPresets / cardPreview）+ デッドファイル確定

### A. デッドファイル確定（game.html 読み込み確認）

`game.html` の script タグを検索した結果、以下のファイルは**読み込まれていない**ことが確定：

| ファイル | 状態 |
|---------|------|
| `js/network/firebase-sync.js` | game.html 未読み込み → **デッドファイル** |
| `js/card/card.js` | game.html 未読み込み → **デッドファイル** |
| `js/ui/render.js` | game.html 未読み込み → **デッドファイル** |
| `js/ui/preview/cardPreview.js` | 空ファイル → **デッドファイル** |
| `js/game/result.js` | 空ファイル → **デッドファイル** |
| `js/chat/chatUI.js` | game.html 未読み込み → **デッドファイル**（Round 18 確認済み） |

---

### B. deckViewer.js（確定）

**役割: ゲーム中のデッキ内容確認オーバーレイ**

- `window.openDeckViewer()` → `#deckViewerOverlay` を生成・表示
- デッキデータ取得: `state[me].deck` → `TEMP:` / `HIDDEN` プレフィックスを除去してカード ID を取得
- `HIDDEN` カードも ID として表示される → **デッキ内容が見えてしまう可能性**
  - ただし `HIDDEN` は `"HIDDEN"` という文字列 → `getCardData("HIDDEN")` は `null` を返す → 画像は `404.png` で表示
  - カード名は `id`（= `"HIDDEN"`）として表示 → 実際のカード名は漏洩しない ✅
- `window.injectPhaseOverlayDeckBtn()` → フェーズオーバーレイ中に「デッキを確認」ボタンを左上に表示
  - `updateMatchUI` から呼ばれる（`setup_dice` / `setup_evolution` / `setup_first_draw` フェーズ中）

---

### C. menu.js（確定）

**役割: ゲーム内ハンバーガーメニュー（IIFE）**

| メニュー項目 | 表示条件 | 処理 |
|------------|---------|------|
| タイトルへ戻る | 常時 | `index.html` へ遷移（確認ダイアログあり） |
| 降参 | playing かつ winner なし | 相手を winner として Firebase に書き込む |
| 盤面リセット | ゲーム画面かつ非ロック | `window.resetField()` |
| デッキを確認 | playing フェーズ | `window.openDeckViewer()` |
| 1人で始める | ゲーム画面かつロック中かつ相手未接続 | `window.startSoloGame()` |
| オプション | 常時 | BGM/SE 音量スライダー |

**降参処理の設計**

```js
state.matchData.winner = op;
state.matchData.winnerSetAt = Date.now();
firebaseClient.writeMatchData(gameRoom, state.matchData);
```

- `showResultScreen()` を呼ばない → Firebase 経由で `checkGameResult()` が発火して表示される
- `winnerSetAt` を設定 → stale チェックで古い勝利判定を防止 ✅

**`deleteAccount` の実装**

```js
localStorage.removeItem("username");
localStorage.removeItem("matchSetup");
localStorage.removeItem("deckList");
localStorage.removeItem("gameState");
location.href = "login.html";
```

- Firebase 上のユーザーデータは削除しない → **アカウント削除が不完全**（問題 #46）
- ローカルストレージのみクリアして `login.html` へ遷移

**`startSoloGame` の参照**

- `window.startSoloGame` を呼ぶが、定義場所が不明 → `game.js` に存在するか要確認

---

### D. drag.js（確定）

**役割: 旧世代のドラッグ実装（現在は未使用）**

```js
function makeDraggable(el, obj) {
  el.onmousedown = (e) => { dragged = {el, obj}; };
}
document.onmousemove = (e) => {
  if (!dragged) return;
  dragged.obj.x = e.pageX;
  dragged.obj.y = e.pageY;
  dragged.el.style.left = dragged.obj.x + "px";
  dragged.el.style.top = dragged.obj.y + "px";
};
window.DragManager.register(releaseDrag);
```

- `render.js` の `makeDraggable(el, obj)` から呼ばれる設計
- `cardManager.js` の `enablePointerDrag` が現行のドラッグ実装
- `document.onmousemove` を直接上書き → 他のマウスイベントと競合する可能性
- `game.html` で読み込まれているか要確認（`render.js` と同様にデッドの可能性）

---

### E. statusBlockPresets.js（確定）

**役割: ステータスブロックのプリセット管理**

```js
window.StatusBlockPresets = {
  presets: [],
  load: async function() {
    const res = await fetch("presets/statusBlockPresets.json?" + Date.now());
    if (res.ok) this.presets = await res.json();
  },
  get: function() { return this.presets; }
};
```

- `DOMContentLoaded` で自動ロード
- `presets/statusBlockPresets.json` を fetch → キャッシュバスター付き（`?timestamp`）
- `StatusBlockPresets.get()` でプリセット一覧を取得
- `statusBlockPresetModal.js` / `statusBlockPresetStorage.js` と連携

---

### F. cardPreview.js（確定）

- **空ファイル** → デッドファイル

---

### G. `startSoloGame` の確認
<br>

```
grep 結果: game.js に window.startSoloGame が定義されている
```

- `window._soloStartMode = true` を設定して `runPhaseProgression` を強制実行
- 相手が接続していなくても `setup_dice` フェーズに進める
- `_bothPlayersConnected` が false でも動作するための緊急手段

---

### Round 29 サマリー

**確定した問題（追加分）**

| # | 問題 | 深刻度 | 場所 |
|---|------|--------|------|
| 46 | `deleteAccount` が Firebase 上のユーザーデータを削除しない（不完全なアカウント削除） | 低〜中 | menu.js |
| 47 | `drag.js` が旧世代実装でデッドコードの可能性 | 低 | drag.js |

**デッドファイル確定リスト**

| ファイル | 理由 |
|---------|------|
| `js/network/firebase-sync.js` | game.html 未読み込み |
| `js/card/card.js` | game.html 未読み込み |
| `js/ui/render.js` | game.html 未読み込み |
| `js/ui/preview/cardPreview.js` | 空ファイル |
| `js/game/result.js` | 空ファイル |
| `js/chat/chatUI.js` | game.html 未読み込み |

**設計上の特徴（意図的）**

- `deckViewer.js` は IIFE でスコープを閉じている ✅
- `menu.js` は IIFE でスコープを閉じている ✅
- 降参処理は Firebase 経由で相手に通知 → `checkGameResult` が自動発火 ✅
- `StatusBlockPresets` はキャッシュバスター付きで fetch ✅

---

## 全体解析完了サマリー（Round 1〜29）

### 解析済みファイル一覧（全 JS ファイル）

**ゲームコア**
- `gameState.js` / `syncState.js` / `core.js` / `game.js` / `gameRules.js`

**フェーズ**
- `dicePhase.js` / `firstDrawPhase.js` / `setupPhase.js` / `battlePhase.js`

**ネットワーク**
- `firebase-client.js` / `firebase-sync.js`（デッド） / `messaging.js` / `timerSync.js`

**ウォッチャー**
- `roomWatcher.js` / `phaseWatcher.js` / `diceWatcher.js` / `watcherRegistry.js`

**カード**
- `cardData.js` / `deckCode.js` / `cardManager.js` / `damageCalc.js` / `card.js`（デッド）

**モンスター**
- `MonsterManager.js` / `MonsterCombatSystem.js` / `MonsterUI.js` / `BattleTargetSystem.js` / `pvpveWatcher.js` / `monsterData.js`

**UI**
- `statusUI.js` / `animationUI.js` / `chatUI.js`（デッド） / `contextMenu.js` / `overlayUI.js` / `handUI.js` / `statusBlocks.js` / `deckViewer.js` / `menu.js` / `timerUI.js` / `dragManager.js` / `drag.js` / `render.js`（デッド）

**その他**
- `resultManager.js` / `matchSetup.js` / `deckSelect.js` / `statusBlockPresets.js` / `devTools.js`

---

### 修正優先度別 最終リスト

**高優先度（実害あり・修正コスト低）**

| # | 問題 | 修正コスト |
|---|------|-----------|
| 15/17 | `_lastRoundSeen` リセット漏れ → ラウンド1モンスター未出現 | 低（2行追加） |
| 31 | `_evoPhaseTransitioning` リセット漏れ | 低（2行追加） |
| 45 | `statusBlocks.js` が相手の state を直接送信（デッキ内容漏洩） | 低（`_getMyStateForSync()` 経由に変更） |

**中優先度（コード品質・軽微な実害）**

| # | 問題 | 修正コスト |
|---|------|-----------|
| 3/25 | 進化の道ロジックが4箇所に重複 | 中（リファクタ） |
| 20 | PP ボタン操作のたびにチャット欄にログ | 低（フラグ化） |
| 30 | `showR1T1Selection()` が空実装 | 中（実装 or 削除） |
| 32 | writeMyState/writeMatchData 失敗時のエラーハンドリングなし | 低 |
| 46 | `deleteAccount` が Firebase データを削除しない | 低〜中 |

**低優先度（デッドコード・軽微）**

| # | 問題 | 修正コスト |
|---|------|-----------|
| 24 | `calcNextTurn` デッドコード | 低（削除） |
| 40 | `showGameplayMessage` と `showNotification` の重複 | 低（統一） |
| 41〜44, 47 | デッドファイル / デッドコード | 低（削除） |
| 13 | arcana が defstackMax をリセットしない | 設計判断 |
| 28 | 両者同時 HP=0 時の winner 競合 | 低 |
| 35 | `GameTimer` Firebase 未同期 | 設計判断 |
| 2 | デッキ枚数 0 でも READY 可能 | 低 |
| 18/26 | モンスター討伐 PP+2 ログ2行 | 低 |


---

## 修正ログ（Fix Log）

### 完了済み修正

| # | 問題 | ファイル | 修正内容 | ステータス |
|---|------|---------|---------|-----------|
| 15/17 | `_lastRoundSeen` リセット漏れ | `pvpveWatcher.js` / `game.js` | `startPvpveWatcher` 先頭に `_lastRoundSeen = 0` 追加。`executeReset` に `startPvpveWatcher()` 再呼び出しを追加 | ✅ 完了 |
| 31 | `_evoPhaseTransitioning` リセット漏れ | `game.js` | `executeReset` と `resetAllGameVariables` の両方に `window._evoPhaseTransitioning = false` を追加 | ✅ 完了 |
| 45 | `statusBlocks.js` デッキ内容漏洩 | `statusBlocks.js` | `updateAndSyncBlockOwner` で相手 state 送信時にデッキを `HIDDEN` 化するよう修正 | ✅ 完了 |
| 20 | PP ログがチャット欄に毎回出力 | `game.js` | `addVal` の PP ログを `window.devMode` フラグ時のみ出力するよう変更 | ✅ 完了 |
| 32 | Firebase 書き込み失敗時のエラーハンドリングなし | `battlePhase.js` | `writeMatchData` / `writeMyState` の戻り値を確認し、失敗時に `console.warn` を出力するよう修正 | ✅ 完了 |
| 28 | 両者同時 HP=0 時の winner 競合 | `game.js` | `draw` の場合は `player1` のみ Firebase に書き込むよう修正 | ✅ 完了 |
| 2 | デッキ枚数 0 でも READY 可能 | `matchSetup.js` | `toggleReady` に `getDeckCardCount` チェックを追加（0枚なら READY 不可） | ✅ 完了 |
| 24 | `calcNextTurn` デッドコード | `battlePhase.js` / `gameRules.js` | `handleTurnEnd` で `calcNextTurn` を使うよう統一。デッドコード解消 | ✅ 完了 |
| 23/41/42/43 | デッドファイル削除 | 各ファイル | `chatUI.js`(chat/) / `card.js` / `render.js` / `firebase-sync.js` / `cardPreview.js` / `result.js` を削除 | ✅ 完了 |
| 47 | `drag.js` の `document.onmousemove` 上書き | `drag.js` | 危険な `document.onmousemove` 上書きを除去してファイルを無害化 | ✅ 完了 |
| 40 | `showGameplayMessage` と `showNotification` 重複 | `messaging.js` / `game.js` | `showGameplayMessage` を削除し、呼び出し元を `showNotification` に統一 | ✅ 完了 |
| 3/25 | 進化の道ロジック重複（overlayUI.js） | `overlayUI.js` | `getEvolutionPathHTML` の独自 idx 計算を `getEvolutionPathParam` 呼び出しに統一 | ✅ 完了 |
| 30 | `showR1T1Selection()` 空実装 | `game.js` | 空関数定義と呼び出しを削除。`startR1T1` にコメントで意図を明記 | ✅ 完了 |

### 未対応（設計判断 or 低優先度）

| # | 問題 | 理由 |
|---|------|------|
| 3/25 | 進化の道ロジック4箇所重複 | リファクタコスト中。動作に影響なし |
| 13 | arcana が defstackMax をリセットしない | ゲームデザインの判断が必要 |
| 24 | `calcNextTurn` デッドコード | 削除可能だが実害なし |
| 30 | `showR1T1Selection()` 空実装 | 通常フローでは呼ばれない |
| 35 | `GameTimer` Firebase 未同期 | 現状の仕様として許容 |
| 40 | `showGameplayMessage` と `showNotification` 重複 | 動作に影響なし |
| 41〜44, 47 | デッドファイル / デッドコード | 削除可能だが実害なし |
| 46 | `deleteAccount` が Firebase データを削除しない | 別途 Firebase 側の実装が必要 |

---

## Round 6 — 自動進行 + カード効果データ拡張（2026-05-31）

### 実装内容

- `js/card/cardCombatData.js` を新規追加
  - 既存 `cards.json` のカードに対して、ゲーム進行に必要な情報を動的付与:
    - `cardKind`（`attacker` / `skill` / `support`）
    - `cost`
    - `attack`
    - `effectTiming`
    - `effectText`
    - `effectActions`
  - 属性（近接/遠隔/魔法）× 役割（アタッカー/スキル/サポート）ごとの効果ライブラリを実装
  - `loadCardData()` 完了後に自動で全カードへエンリッチ

- `js/game/auto/autoBattleEngine.js` を新規追加
  - 既存フック `window._afterUpdateHooks` を利用し、重複実装なしで自動行動を挿入
  - 自動行動優先順位:
    1. スキル使用（場にアタッカーがいる場合）
    2. ユニット配置（アタッカー/サポート）
    3. 直接攻撃
    4. ターン終了
  - PP消費、効果適用、ダメージ適用、ログ出力、保存同期を自動で実行

- `js/game/auto/autoBattleUI.js` を新規追加
  - 画面左下に `AUTO BATTLE` パネルを追加
  - ON/OFF トグル、現在ステータス、直近ログを表示

- `game.html` を最小編集
  - 新規ファイルの読み込みを追加:
    - `js/card/cardCombatData.js`
    - `js/game/auto/autoBattleEngine.js`
    - `js/game/auto/autoBattleUI.js`

### 目的適合

- **ゲーム自動進行**: ターン中の主要アクションを自律実行
- **カード効果の明確化**: 機械可読な効果データを全カードで利用可能に
- **システム構築/データ管理/UI**: エンジン・データ拡張・操作UIを分離実装
- **新機能は既存JSと別ファイル**: 主要機能はすべて新規ファイルで実装
- **同様機能の重複回避**: 既存 `handleTurnEnd` / `_afterUpdateHooks` / `applyCalculatedDamage` を再利用

### 残課題

- [ ] カード個別固有効果（現状は属性×役割ベース）
- [ ] サポートカードのルール厳密化（場に存在時のスキル化条件など）
- [ ] AIの判断強化（相手状態を見た最適行動）

---

## Round 7 — カード編集画面拡張 + DSL土台（2026-05-31）

### 要件対応

- 開発者モードでカードの `カード名 / 攻撃力 / 効果テキスト` を編集可能にした
- カード一覧で以下を追加
  - 検索（カード名 / タグ / 効果テキスト）
  - ソート（ID順 / 名前順 / 攻撃力 高→低 / 低→高）
- `cards.json` 出力時に以下を保存
  - `name`
  - `attack`
  - `effectText`
  - `effectDsl`（原文から自動コンパイルしたDSL。未解釈は UNKNOWN）

### DSL土台

- `js/card/cardDsl.js` 新規追加
  - 効果分類辞書（DRAW / DAMAGE / HEAL / DESTROY / DISCARD / SEARCH / SUMMON / BUFF / DEBUFF）
  - `compileText(effectText)` を実装
    - 原文を行分割し trigger + effects へ変換
    - 不明語彙は `UNKNOWN` に統一
  - `validateDsl(dsl)` を実装（最小検証）

### データ管理の変更

- `js/card/cardData.js`
  - `attack`, `effectText`, `effectDsl` 正規化を追加
  - `effectDsl` が未定義時は `CardDSL.compileText(effectText)` で補完
- `js/dev/devTools.js`
  - 一括作成時の新規カードに上記フィールドの初期値を付与

### 戦闘値への接続（基礎攻撃力 + カード攻撃力）

- `js/card/cardCombatData.js`
  - カード攻撃力は `card.attack` を優先利用
  - `getCardBattleAttack(id, owner)` を追加（`state[owner].atk + card.attack`）
- `js/game/auto/autoBattleEngine.js`
  - 自動直接攻撃ダメージを `基礎攻撃力 + カード攻撃力` に変更

### UI接続

- `dev.html`, `game.html` に `js/card/cardDsl.js` を追加読み込み

### 注意（今回の範囲）

- まだ「カード個別の詳細効果フロー実装」は未着手
- 今回はあくまで、DSL化に進むための標準化土台と編集導線を実装

---

## Round 8 — デッキ構築カード整列の安定化（2026-05-31）

### 症状

- カード一覧グリッドで、フィルター条件により1段表示へ切替時に `gridTemplateRows = "1fr"` を直接適用していた。
- `1fr` はコンテナ高さに依存して伸縮するため、カード整列が環境やリサイズで不安定になりやすかった。

### 修正

- `js/deck/deck.js`
  - `renderCatalogGrid()` の行数制御を inline style から class 制御へ変更
  - 追加クラス:
    - `catalogSingleRow`
    - `catalogTwoRow`
- `css/style.css`
  - `#cards.cardRow` の行定義を `max-content` ベースへ統一
  - `catalogSingleRow` / `catalogTwoRow` の行定義を明示
  - `align-content:start` を追加して上寄せ固定
  - `.cardListScroll` に `contain: layout paint` を追加して再レイアウト影響を局所化

### 期待効果

- 1段/2段切替時の行高揺れを抑制
- リサイズ時やフィルター変更時のカード配置ジャンプを低減
- カード一覧の横スクロール領域の描画安定性向上

---

## Round 9 — 手動効果選択用の汎用モーダル追加（2026-05-31）

### 追加

- `js/ui/effectChoiceUI.js` を新規追加
  - `showEffectChoiceModal(options)` を提供（Promise返却）
  - `openEffectChoiceModal(options, onDone)` も提供（callback互換）

### 仕様

- 単一選択 / 複数選択モード
- 最小選択数 / 最大選択数の制約
- キャンセル可否
- 背景クリック閉じる可否
- Esc / Enter 操作
- 返却データ
  - `confirmed`
  - `selectedIds`
  - `selectedChoices`
  - `selectedChoice`

### UI方針

- 既存の overlay/modal 系UIと同様、`document.body` 直下に固定オーバーレイを表示
- 既存の画面内パネル方式とは分離し、カード効果の「自由選択」用途に特化した汎用モーダルとして実装

### 接続

- `game.html` に `js/ui/effectChoiceUI.js` を読み込み追加

### 備考

- まだカード個別の具体効果フローには未接続
- 本実装は「手動自由選択系効果」の土台UI/APIの提供が目的

---

## Round 10 — PP確認モーダル一時無効化 + オプション化（2026-05-31）

### 対応内容

- **PP確認モーダル**
  - 初期値を `OFF`（無効）に設定
  - `OFF`時は、カードを `attacker/skill` ゾーンに置いた際に確認モーダルを出さず、そのまま配置
  - PP消費は既存の `PlayerActionResolver` 側コスト処理に委譲

- **オプション追加**
  - `js/ui/menu.js` の設定に以下を追加（初期値はいずれも `false`）
    - `ppCostModalEnabled`
    - `autoPlayEnabled`
  - オプションモーダルにチェックボックスを追加
    - 「カード配置時のPP確認モーダル」
    - 「オートプレイ」

### 実装上の整合

- PP確認モーダルを `ON` にした場合、モーダル側で先にPPを減らす
- その後の `PlayerActionResolver` で二重消費しないように、
  - `cardEl.dataset.ppCostHandled = "1"` を付与
  - resolver側で検出時にコスト再消費をスキップ

### 変更ファイル

- `js/ui/menu.js`
- `js/card/cardManager.js`
- `js/game/auto/playerActionResolver.js`

---

## Round 11 — カード効果用語追加（ジョーカー / オールイン）（2026-05-31）

### 追加仕様

- **ジョーカー**
  - 使用時: PP現在値を無視
  - PP消費: なし
- **オールイン**
  - 使用時: PP現在値を無視
  - PP消費: 現在PPを全消費（0なら消費なし）

### 実装

- `js/card/cardCombatData.js`
  - `card.effectText` から `cardCostPolicy` を判定
    - `ジョーカー` を含む → `joker`
    - `オールイン` を含む → `all_in`
    - それ以外 → `normal`
  - `cardCostPolicy` をカードプロファイルへ付与
  - `effectText` は cards.json由来を優先（未設定時のみ既定文を使用）

- `js/game/auto/playerActionResolver.js`
  - `spendCardCost()` に `cardCostPolicy` を反映
    - `joker`: PP無視・消費なし
    - `all_in`: PP無視・全消費
    - `normal`: 従来通り `cost` 消費
  - `COST_RULE ...` のフローログを追加
  - `ACTION` ログに `CostRule` を追記

- `js/card/cardManager.js`
  - PP確認モーダルがONでも、`joker` / `all_in` カードはモーダルをバイパスして直接配置
  - コスト処理の整合は resolver 側に委譲

- `js/card/cardDsl.js`
  - 効果辞書に `JOKER`, `ALL_IN` を追加（DSL土台）

### 備考

- カード個別の具体効果フローは未実装のまま
- 今回は「用語に対応したコストルール」のみ追加

---

## Round 12 — 先頭8枚（cd001-001〜008）の効果発動対応（2026-05-31）

### 対応方針

- `data/cards.json` 先頭8枚（`cd001-001`〜`cd001-008`）を対象に、専用スクリプトを新規追加
- 汎用DSL処理より優先して8枚専用処理を実行
- スキル使用時に、場のアタッカーの `攻撃時` 効果も自動発火

### 追加ファイル

- `js/game/auto/firstEightCardEffects.js`
  - 8枚専用の効果解決ロジック
  - ターン終了時の遅延回復（`cd001-008`）フック

### 連携変更

- `game.html`
  - `firstEightCardEffects.js` を `playerActionResolver.js` より前に読み込み
- `js/game/auto/playerActionResolver.js`
  - 8枚専用スクリプト連携
  - 専用処理が有効な場合はDSL既定処理を抑止（`scripted=first8` ログ）
  - スキル使用時にアタッカーの `攻撃時` 効果を発火

### 実装した主効果（抜粋）

- `cd001-001` 登場時PP下限回復
- `cd001-002` 条件時: 場カード墓地送り + HP減少 + 手札増加
- `cd001-003` 登場時条件ドロー/PP回復、攻撃時 回復+シールド
- `cd001-004` 攻撃時効果の追加発動
- `cd001-005` 攻撃時回復（場にいる間1回:2回復、以降1回復）
- `cd001-006` 条件時: 墓地送り + 回復 + HP差ダメージ
- `cd001-007` 登場時PP回復、攻撃時 条件HP減少 + 攻撃力上昇
- `cd001-008` 使用時回復 + ターン終了時回復予約

### 未実装/簡略化（今後）

- 退場時分岐、直接攻撃時専用分岐、継続監視の完全再現
- テキスト中の全条件分岐（厳密裁定）


---

## Round 13 — 場の並び順再整列漏れの修正（2026-05-31）

### 原因

- `cardManager.js` のドラッグ終了処理に早期 `return` 分岐があり、
  - `window._isDraggingCard` が解除されないケース
  - ゾーン再整列（`organizeBattleZones`）が呼ばれないケース
  が発生していた。
- その結果、以後の `organizeHands()` がスキップされ、手札に空白が残ることがあった。
- ゾーン→デッキ戻し時に、ゾーン側再整列が抜けていた。

### 修正

- `js/card/cardManager.js`
  - 早期 `return` となる分岐（手札→デッキ戻し、手札→ゾーン配置、PPモーダル経由）で `window._isDraggingCard = false` を確実に実行
  - 手札→デッキ戻し時に `organizeBattleZones()` も実行
  - `pointerup` の `finally` でも `window._isDraggingCard = false` を実行して取りこぼしを防止

- `js/ui/contextMenu.js`
  - 「デッキに戻す」実行時に `organizeBattleZones()` を追加

### 効果

- 手札/スキル場/墓地の並び順が、移動完了後に詰まらない問題を低減
- 「手札から場へ出した後に元の場所が空白になる」再現条件を解消

---

## Round 14 — 墓地送り時の退場時判定を挿入（2026-05-31）

### 指摘反映

- `cd001-002` 等で「場のカードを墓地へ送る」際、
  - **墓地送りの直前に退場時判定を挟む**処理を追加

### 実装

- `js/game/auto/firstEightCardEffects.js`
  - `triggerLeaveEffects(cardEl, owner)` を追加
  - `moveOwnerBattleCardsToGrave(owner)` 内で、各カードごとに退場時判定を先行実行
  - 退場時効果でカードが手札へ戻る等で処理済みになった場合は墓地送りをスキップ

### 反映済み退場時効果（先頭8枚範囲）

- `cd001-001` 黒魔術師
  - 直接攻撃していないなら: HP-1 / PPを1まで回復 / 手札へ戻る
- `cd001-005` 創世の賢者
  - 直接攻撃していないなら: HPを3回復

### 補足

- 直接攻撃済み判定は `dataset.didDirectAttack` を参照（将来的に直接攻撃処理側で明示フラグ管理を強化予定）

---

## Round 15 — ゲーム内変数トラッキング基盤の接続（2026-05-31）

### 要件

- ゲーム中およびターン単位で、ステータス増減回数/量・効果発動回数などを記録
- カード側から追跡値を参照可能にする

### 実装

- `js/game/statTracker.js`
  - `game` / `turn` スコープで、`player1` / `player2` / `global` の統計を保持
  - `addVal` / `setVal` / `applyCalculatedDamage` をラップして、
    - `incCount`, `incAmount`, `decCount`, `decAmount`, `setCount` を記録
  - 効果発動回数を `recordEffectActivation` でキー集計
  - ターン履歴スナップショット（直近100件）を保持
  - `resolvePath("turn.hp.incCount", owner)` 形式で参照可能

- `game.html`
  - `js/game/statTracker.js` を読み込み追加

- `js/game/auto/playerActionResolver.js`
  - カード使用フローで以下を記録
    - フロー開始/終了カウンタ
    - PP不足スキップ
    - DSL効果ごとの発動回数
    - 効果定義なし (`NONE` / `NONE_DSL`) も記録
    - 先頭8枚のスクリプト実行は `SCRIPTED_FIRST8` で記録

- `js/game/auto/firstEightCardEffects.js`
  - 先頭8枚のスクリプト効果に対して、
    - `onSummon` / `onAttack` / `onLeave` / `onTurnEnd` の発動を記録

- `js/card/cardDsl.js`
  - `CardDSL.readTrackerValue(path, owner)` を追加し、カード側からトラッカー値参照を可能化

### 例

- `CardDSL.readTrackerValue("turn.hp.decAmount", "player1")`
- `CardDSL.readTrackerValue("game.pp.incCount", "player2")`

### 検証

- `node --check` 実行:
  - `js/game/statTracker.js`
  - `js/game/auto/playerActionResolver.js`
  - `js/game/auto/firstEightCardEffects.js`
  - `js/card/cardDsl.js`
  - すべて構文エラーなし

---

## Round 16 — カード表示レイアウト統一（2026-05-31）

### 要件

- 全カードに `カード名 / 属性アイコン / 攻撃力 / 効果テキスト` を表示
- 種別ごとの見た目差分
  - アタッカー: 左上攻撃力、右にカード名、攻撃力下に属性アイコン、下部40%に効果テキスト
  - スキル: 左上攻撃力を円囲み、右にカード名、下部40%に効果テキスト
  - サポート: 左上は短い横線（攻撃力無効）、右にカード名、攻撃力下に属性アイコン、下部40%に効果テキスト

### 実装

- 新規: `js/card/cardVisualLayout.js`
  - カード表示レイアウト生成を共通化
  - `CardVisualLayout.applyToCardElement(el, card)`
  - `CardVisualLayout.buildDeckCardInnerHtml(card, options)`

- `js/card/cardManager.js`
  - ゲーム中カード生成時に共通レイアウトを適用
  - 裏面表示時に表面オーバーレイも非表示化

- `js/deck/deck.js`
  - デッキ構築画面カードを共通レイアウトで描画

- `js/dev/dev.js`
  - 開発者モードのカード一覧を共通レイアウト化

- `game.html` / `deck.html` / `dev.html`
  - `js/card/cardVisualLayout.js` を読み込み追加

- `css/style.css`
  - 共通カードレイアウトスタイルを追加
  - `#field` 上のカード向けに文字・要素サイズを別調整
  - 効果テキスト領域をカード下部40%で固定

### 検証

- `node --check`:
  - `js/card/cardVisualLayout.js`
  - `js/card/cardManager.js`
  - `js/deck/deck.js`
  - `js/dev/dev.js`
  - すべて構文エラーなし

---

## Round 17 — カード名中央表示 + 拡大表示の共通レイアウト化（2026-05-31）

### 対応

- カード名をカード中央に表示するように変更
- 拡大表示（deck/dev/gameのコンテキストズーム）を画像単体ではなく共通カードレイアウト描画へ統一
- デッキ構築の右側プレビューも共通カードレイアウト化
- 開発者モードの編集プレビューも共通カードレイアウト化

### 変更ファイル

- `css/style.css`
  - `.cvName` を中央配置（`top: 50%; transform: translateY(-50%)`）へ変更
  - 拡大表示カード用 `.cardZoomCardWrap` を追加
- `deck.html`, `dev.html`
  - 拡大モーダル内を `<img id="cardZoomImage">` から `<div id="cardZoomCard">` へ変更
- `js/deck/deck.js`
  - `showCardZoom` を共通カードレイアウト描画に変更
  - `updateDeckCardPreview` も共通カードレイアウト描画へ変更
- `js/dev/dev.js`
  - `showCardZoom` を共通カードレイアウト描画に変更
  - 編集プレビュー (`showPreview`) も共通カードレイアウト描画へ変更
- `js/ui/contextMenu.js`
  - ゲーム中「拡大表示」オーバーレイを共通カードレイアウト描画へ変更

### 検証

- `node --check`:
  - `js/deck/deck.js`
  - `js/dev/dev.js`
  - `js/ui/contextMenu.js`
  - すべて構文エラーなし

---

## Round 18 — デッキ構築レイアウト崩れ修正（2026-05-31）

### 原因

- `deckPage` で `body.deckPage .deckBuilder` に対して `--deck-scale` の全体 `transform: scale(...)` が適用されていた
- 同時に `js/deck/deck.js` 側で、実寸ベースのカードサイズ計算（`updateCardSizes`）と分割リサイザ（縦分割/プレビュー幅）が動作
- 結果として「全体縮尺」と「要素実寸リサイズ」が二重に効き、崩れやすい状態になっていた

### 対応

- `css/style.css`
  - `body.deckPage .deckBuilder` の全体スケールを無効化
  - `transform: none; width: 100%; height: 100dvh;` に統一

### 方針

- デッキ構築画面は `deck.js` の実寸リサイズロジックを唯一の基準にする
- 旧来のページ全体スケールは併用しない

---

## Round 19 — カード内テキストの相対リサイズ対応（2026-05-31）

### 要件

- カードの攻撃力 / 名前 / 効果テキストを、カードサイズに応じて相対リサイズ

### 対応

- `css/style.css`
  - `.cardVisualApplied` に `container-type: inline-size` を追加
  - `cvAttack / cvName / cvAttribute / cvEffectText` のフォント・寸法を `cqw` + `clamp()` へ変更
  - これによりカード幅変化（デッキ画面・ゲーム画面・拡大表示）へ自動追従
  - `#field` 用の固定px上書きは廃止し、同じく相対値ベースへ統一

### 効果

- カードサイズが変わっても、攻撃力・名前・効果テキストが過小/過大になりにくい
- 画面ごとに別実装せず、同一レイアウト仕様でスケール

---

## Round 20 — 固定座標 + 親スケール方式へ移行（2026-05-31）

### 方針

- カード内部レイアウトを基準サイズ `320x453` の固定座標で定義
- 画面ごとの差は、カード幅に応じた親スケールで吸収

### 実装

- `css/style.css`
  - `.cardVisualApplied` に基準サイズ変数を追加
    - `--cv-base-w: 320`
    - `--cv-base-h: 453`
    - `--cv-scale: calc(100cqw / var(--cv-base-w))`
  - `.cardVisualOverlay` を固定キャンバス化
    - 固定 `width/height`（320x453）
    - `transform: scale(var(--cv-scale)); transform-origin: top left;`
  - 攻撃力/名前/属性アイコン/効果テキストを固定px座標へ統一
  - `#field` 専用の上書きスケールは削除（全画面同一ルール化）

### 効果

- カードサイズ変更時に「内部要素の相対位置崩れ」が起きにくい
- デッキ構築/ゲーム/拡大表示すべてで同一レイアウトを維持

---

## Round 21 — カード内テキストの中心ズレ/過大表示を調整（2026-06-01）

### 症状

- カード内テキスト群の中心がずれる
- 全体に文字が大きすぎる
- 拡大縮小率そのものは概ね正常

### 原因

- 固定キャンバス（320x453）のスケールが左上原点だったため、表示コンテナとの縦横比差で中心ズレが発生
- 固定px文字サイズがやや強め

### 対応

- `css/style.css`
  - `.cardVisualApplied`
    - `container-type: inline-size` → `container-type: size`
    - `--cv-scale` を `min(width比, height比)` に変更
  - `.cardVisualOverlay`
    - 左上原点スケール → 中央原点スケール
    - `left/top: 50%` + `translate(-50%, -50%) scale(...)`
  - フォント/記号サイズを一段縮小
    - 攻撃力、カード名、属性アイコン、効果テキスト、スキル円、サポート横線

### 期待効果

- カード中央基準で情報レイヤーが安定
- 画面別（通常/拡大/デッキ）で文字が過大になりにくい

---

## Round 22 — 同時座標指定の調査 + スケール計算方式修正（2026-06-01）

### 調査結果

- `cardVisual/cv*` の座標指定は CSS 内で単一系統（重複上書きなし）
- JS側で `left/top/transform` を追加上書きする処理なし

### 実原因

- `--cv-scale` が `cqw` 依存だったため、環境によって無効化
- 無効時、`.cardVisualOverlay` の `transform` 全体が落ち、`left:50% top:50%` のみ有効
- 見かけ上「テキスト群の左上端が中央」に固定される

### 対応

- `css/style.css`
  - `--cv-scale` の `cqw` 計算を廃止し、JS注入値を使う初期値 `1` へ変更
- `js/card/cardVisualLayout.js`
  - `clientWidth / 320` の実測値で `--cv-scale` を設定
  - `ResizeObserver` でカード幅変化時に自動再計算
  - フォールバックとして `window.resize` 対応

### 効果

- ブラウザ依存のコンテナ単位に左右されず、常にスケールが有効
- 中央固定の意図どおり表示される

---

## Round 23 — デッキ構築のカード一覧/デッキ一覧でテキスト過大問題を修正（2026-06-01）

### 原因

- ゲーム中カードは `applyToCardElement()` 経由で `syncScale()` が呼ばれる
- 一方、デッキ構築画面（カード一覧/デッキ一覧）は `buildDeckCardInnerHtml()` のみを使っており、`syncScale()` 未実行
- そのため `--cv-scale` が初期値 `1` のままになり、カード本体に対してテキストが大きく表示されていた

### 対応

- `js/deck/deck.js`
  - カード生成・拡大表示・デッキプレビュー後に `CardVisualLayout.syncScale(el)` を実行
- `js/dev/dev.js`
  - 編集プレビュー・拡大表示後に `CardVisualLayout.syncScale(el)` を実行
- `js/ui/contextMenu.js`
  - ゲーム内拡大表示カードにも `syncScale(el)` を実行

### 備考

- `requestAnimationFrame` でDOM配置後に実測スケール反映するため、一覧内の実寸に追従

---

## Round 24 — 開発者モード向け「ブロック組み換え式カード効果」準備（2026-06-02）

### 目的

- 最終的に開発者モードで Scratch 的に効果ブロックを組み換えられるようにするための土台を先行実装
- 先に仕様を固定し、保存時のデータモデルを拡張して既存DSL実行基盤へ接続可能にする

### 仕様整理

- 仕様書を追加: `docs/dev-card-effect-block-spec.md`
- 構成は `[発動タイミング] -> [効果カテゴリ内ブロック]`
- 効果カテゴリ:
  - 攻撃力調整系
  - ダメージ系
  - カード系
  - PP系
  - HP操作系
  - 効果付与系
  - カードに対する効果系

### 実装（準備）

- `js/dev/cardEffectBlockCatalog.js`
  - 発動タイミング定義
  - 効果カテゴリ定義
  - ブロック定義（`add_atk`, `damage`, `draw`, `recover_pp`, `heal` など）

- `js/dev/cardEffectBlockCompiler.js`
  - `effectBlocks` の簡易バリデーション
  - `effectBlocks -> dependrap.dsl.v1` 変換
  - 未対応ブロック（現時点では `grant_status`）を安全にスキップ

- `dev.html`
  - 上記2スクリプトを読み込み

- `js/dev/dev.js`
  - カード編集データに `effectBlocks` を保持
  - 保存時は `effectBlocks` 由来DSLを優先し、未設定時のみ `effectText` 由来DSLへフォールバック
  - `cards.json` 出力時に `effectBlocks` を保持

### 備考

- 今回は「土台のみ」。ブロックUI（ドラッグ&ドロップ編集、条件式GUI、リアルタイムプレビュー）は次段で追加する。

---

## Round 25 — 開発者モードにブロックエディタUIを追加（2026-06-02）

### 実装内容

- `dev.html`
  - 編集パネルにブロック編集領域を追加
    - `useEffectBlocks`（有効/無効）
    - `newTimingSelect` + `addTimingBtn`（発動タイミング追加）
    - `effectBlocksContainer`（タイミング/効果ブロック編集本体）
  - UI用の最小スタイル（`blockEditor`, `timingCard`, `effectRow`）を追加

- `js/dev/dev.js`
  - `effectBlocks` 編集ヘルパーを追加
    - 空プログラム生成
    - 選択カード取得
    - タイミング/効果のレンダリング
  - タイミング単位で以下を編集可能化
    - 発動タイミング変更
    - 効果ブロック追加/削除
  - 効果ブロック単位で以下を編集可能化
    - カテゴリ
    - 効果種別
    - 対象
    - 値
    - `damage` の追加パラメータ（`damageType`, `subType`）
  - カード選択時に `effectBlocks` の有無を反映してエディタを再描画

### 現在の到達点

- 開発者モード内で `effectBlocks.timings[]` をGUI経由で編集できる状態になった
- 保存処理は前Round実装により `effectBlocks -> effectDsl` 優先で出力される

### 残課題

- Scratch 的なドラッグ&ドロップ並べ替えは未実装（クリック編集方式）
- 条件式ブロック（`condition`/`variables`）のGUI入力は未実装

---

## Round 26 — 効果条件/スキル前後タイミング/対象仕様の拡張（2026-06-02）

### 追加要件対応

- 効果ごとに条件を設定
  - `whileOnField`（これが場にある間）
  - `thisTurn`（このターン中）
  - `trackerCheck`（増/減/増減 × 量/回数 の数値判定）
- スキルタイミング追加
  - `onSkillBeforeAttackEffect`
  - `onSkillAfterAttackEffect`
- ダメージ設定を一覧選択化
  - ダメージタイプ: `通常/貫通/脆弱/アルカナ`
  - ダメージ属性: `なし/追加`
- HP操作系に `HPを減らす` を追加
- 対象を3択へ変更
  - `自身プレイヤー`
  - `現在のターゲット`
  - `自身と現在のターゲット`

### 実装

- `js/dev/cardEffectBlockCatalog.js`
  - 新タイミング、新ブロック（`hp_reduce`）を追加
  - ブロックparamsに `condition` を追加

- `js/dev/cardEffectBlockCompiler.js`
  - 新対象指定を許可
  - `damageAttr` を `subType` に変換
  - `hp_reduce` を `DAMAGE + damageType:hp_reduce` へ変換
  - 効果ごとの `condition` を DSL 効果へ引き継ぎ

- `js/game/effects/effectEngine.js`
  - 新対象指定（単体/現在ターゲット/両方）を解決
  - 効果ごとの `condition` 判定を追加
  - `trackerCheck` は `GameStatTracker.resolvePath` を使って比較演算で評価

- `js/game/auto/playerActionResolver.js`
  - スキル使用時に以下トリガーを実行
    - 攻撃時効果発動前: `onSkillBeforeAttackEffect`
    - 攻撃時効果発動後: `onSkillAfterAttackEffect`

- `js/dev/dev.js`
  - 条件GUI（チェックボックス + 記録条件セレクタ群）を追加
  - ダメージタイプ/属性をセレクト化
  - 対象を3択に変更

### 補足

- `thisTurn` は条件評価時に tracker 参照スコープを `turn` に強制する挙動で扱う。

---

## Round 27 — 「条件の有無」切替を追加（2026-06-02）

### 対応内容

- 効果ごとに `条件を使う` チェックボックスを追加
- OFF時は条件入力UIをグレーアウトし、編集不可にする
- コンパイル時は `useCondition === true` のときのみ `effect.condition` をDSLへ出力

### 実装ファイル

- `js/dev/dev.js`
  - `effect.useCondition` フィールド追加（初期値 `false`）
  - `条件を使う` UI + conditionエリアの有効/無効制御を追加
- `js/dev/cardEffectBlockCompiler.js`
  - `useCondition` が true のときのみ `compiled.condition` を付与

---

## Round 28 — スキル発動手順の仕様修正（2026-06-02）

### 仕様変更

- スキル使用時に通常の `onAttack` は使わない
- スキル使用時の効果タイミングは
  - `onSkillBeforeAttackEffect`
  - `onSkillAfterAttackEffect`
  のみを使用
- スキルカードに対して `onLeave` は実行しない

### 実装

- `js/game/auto/playerActionResolver.js`
  - `resolveCardOnPlay` のデフォルトトリガーを `onSummon` 固定に変更（スキル `onAttack` 起動を回避）
  - デフォルトDSL実行ブロックを `profile.cardKind !== "skill"` の場合のみ実行
  - 墓地移動時の `resolveCardOnLeave` 呼び出し対象を `prevZoneType === "attacker"` のみに限定

---

## Round 29 — タイミング選択制限 + 例外文脈選択（2026-06-02）

### 要件対応

- タイミング追加の候補を文脈別に制限
  - アタッカー使用時: `onSummon/onAttack/onDirectAttack/onTurnStart/onTurnEnd/onLeave/continuous/manual`
  - スキル使用時: `onSkillBeforeAttackEffect/onSkillAfterAttackEffect/continuous/manual`
- ただし特例対応として、カード種別がアタッカーでも `スキル使用時` 文脈を選択可能にした

### 実装

- `dev.html`
  - `timingContextSelect`（アタッカー使用時 / スキル使用時）を追加
- `js/dev/dev.js`
  - 文脈ごとの許可タイミング配列を追加
  - `newTimingSelect` の候補を `timingContextSelect` に応じてフィルタ
  - カード選択時に種別が `スキル` なら初期文脈を `skill`、それ以外は `attacker` に設定

---

## Round 30 — DSL自動生成（effectText由来）を削除（2026-06-02）

### 変更

- `effectText -> CardDSL.compileText` の自動生成経路を完全削除
- 保存時の `effectDsl` は `effectBlocks` からのみ生成
- `effectBlocks` 未設定/不正時は空DSL（`triggers: []`）を出力

### 反映

- `js/dev/dev.js`
  - `fromText` / `CardDSL.compileText` フォールバックを削除
  - `compiledDsl` を `fromBlocks` 専用に変更
- `dev.html`
  - `js/card/cardDsl.js` の読み込みを削除
  - 効果テキストのラベルを「表示/検索用メモ」へ変更

---

## Round 31 — PP「Nまで回復（不足分のみ）」設定を明示追加（2026-06-02）

### 対応

- PP系ブロックに `recover_pp_to` を追加
  - 例: 値を `1` にすると「現在値が0なら1まで回復」
- 既存の `set_pp_min` も同じ挙動としてラベルを明確化
- どちらもコンパイル時は `SET_PP_MIN` に変換

### 変更ファイル

- `js/dev/cardEffectBlockCatalog.js`
- `js/dev/cardEffectBlockCompiler.js`
- `docs/dev-card-effect-block-spec.md`

---

## Round 32 — PP回復ブロック重複を整理（2026-06-02）

### 結論

- `set_pp_min` と `recover_pp_to` は同一挙動だったため、UI定義上の重複を解消

### 対応

- `js/dev/cardEffectBlockCatalog.js`
  - `recover_pp_to` を削除
  - PP「Nまで回復」は `set_pp_min` のみを使用
- `docs/dev-card-effect-block-spec.md`
  - PP系一覧から `recover_pp_to` を削除
  - 変換ルールの `recover_pp_to` 記述を削除

### 互換

- 既存データ互換のため、コンパイラ側は `recover_pp_to` 入力を受理できる状態を維持

---

## Round 33 — 攻撃力調整の対象仕様を拡張（2026-06-02）

### 追加仕様

- `add_atk` に `増加/減少` モードを追加
- 対象を以下6種に拡張
  - `attacker_zone_card`
  - `this_card`
  - `target_attacker_zone_card`
  - `target_skill_card`
  - `self_base_atk`
  - `target_base_atk`
- ターゲット系対象で現在ターゲットがモンスターの場合は、モンスター攻撃力を対象にする

### 実装

- `js/dev/dev.js`
  - 攻撃力調整専用UI（増減/対象セレクト）を追加
- `js/dev/cardEffectBlockCatalog.js`
  - `add_atk` のparamsを `atkMode/atkTarget/value` へ更新
- `js/dev/cardEffectBlockCompiler.js`
  - `atkMode/atkTarget` を DSL 効果に出力
- `js/game/effects/effectEngine.js`
  - `ADD_ATK` 実行時に対象6種を解決
  - カード攻撃力補正を `cardEl.dataset.attackBonus` として管理
  - モンスター対象時は `MonsterManager.addMonsterAttack` を呼ぶ
- `js/game/monsters/MonsterManager.js`
  - モンスターに `atkBonus` を追加
  - `getMonsterAttack/addMonsterAttack` を追加
  - モンスター攻撃計算で `def.atk + atkBonus` を使用
- `js/game/auto/autoBattleEngine.js`
  - 直接攻撃計算時に `attacker.dataset.attackBonus` を反映

---

## Round 34 — 攻撃力「Nにする」効果を追加（2026-06-02）

### 追加

- 攻撃力調整モードに `set`（Nにする）を追加

### 実装

- `js/dev/dev.js`
  - 攻撃力調整モードに `Nにする` を追加
- `js/game/effects/effectEngine.js`
  - `ADD_ATK` 実行時、`atkMode === "set"` なら対象攻撃力を指定値へ設定
  - カード対象は `attackBonus` を再計算して設定
  - プレイヤー基礎攻撃力は `state[owner].atk` を指定値へ更新
  - モンスター対象は `MonsterManager.setMonsterAttack()` を使用
- `js/game/monsters/MonsterManager.js`
  - `setMonsterAttack(slotIndex, value)` を追加
- `docs/dev-card-effect-block-spec.md`
  - `add_atk` モードに `set` を追記

---

## Round 35 — 効果付与系/カード系仕様の再編（2026-06-02）

### 効果付与系

- カテゴリを `effect_grant`（効果付与系）へ統一
- ブロック `grant_effect_bundle` を追加
  - 重複可否チェック（同名カード + 同効果名を重複判定）
  - 継続期間設定（回数 / ターン / 両方）
  - 付与する効果をカテゴリから再選択して複数追加

### カード系

- カード系ブロックを以下へ差し替え
  - `draw_card`
  - `add_hand`
  - `add_hand_to_n`
  - `fetch_card`
  - `return_to_hand`
  - `send_to_grave`
  - `return_to_deck`
  - `duplicate_to_hand`
  - `play_to_field`
  - `reveal_card`

### 実装

- `js/dev/cardEffectBlockCatalog.js`
  - カテゴリ定義とカード系効果リストを更新
- `js/dev/dev.js`
  - 効果付与系のUI（重複可否/継続期間/付与効果複数）を追加
  - カード系の `toZone` 編集UIを追加
- `js/dev/cardEffectBlockCompiler.js`
  - 新カード系/効果付与系のDSL変換を追加
- `js/game/effects/effectEngine.js`
  - `GRANT_EFFECT_BUNDLE` 受理と付与情報の登録処理を追加
- `docs/dev-card-effect-block-spec.md`
  - 仕様とマッピングを更新

---

## Round 36 — カード系対象を「カード対象/プレイヤー対象」で分離（2026-06-02）

### 要件対応

- カード系効果を以下に分離
  - カード対象:
    - アタッカー場のカード
    - 現在のターゲットのアタッカー場のカード
    - 自身と現在のターゲットのアタッカー場のカード
    - このカード
    - 墓地のカード
    - 手札のカード
  - プレイヤー対象:
    - 自身
    - 現在のターゲット
    - 自身と現在のターゲット
- 現在のターゲット系でターゲットがモンスターの場合、成立しないカード系効果は無効化

### 実装

- `js/dev/dev.js`
  - カード系の対象セレクト (`cardTarget`) を追加
  - カード対象効果時はプレイヤー対象セレクトを隠す
  - プレイヤー対象効果時は既存対象セレクトを使用
- `js/dev/cardEffectBlockCompiler.js`
  - `cardTarget` をDSLへ出力
  - カード系の target 文字列許容リストを拡張
- `js/game/effects/effectEngine.js`
  - `cardTarget` から実カードを解決する処理を追加
  - `MOVE_SOURCE_TO_HAND/GRAVE/DECK`, `FETCH_CARD`, `PLAY_SOURCE_TO_FIELD`, `DUPLICATE_SOURCE_TO_HAND`, `REVEAL_CARD` へ適用
  - モンスターターゲット時の不成立カード系を `skippedByInvalidTarget` で無効化

---

## Round 37 — タイミング一括条件 + 条件項目拡張（2026-06-02）

### タイミング一括条件

- 各タイミングに `このタイミングの条件を使う` を追加
- 条件成立時のみ、そのタイミング配下効果を順番実行
- コンパイル時は `trigger.bundleCondition` として出力

### 条件仕様更新

- 退場時条件に `直接攻撃したか`（`any/did/not`）を追加
- 記録条件 `何が` に以下を追加
  - `HP/PP/シールド/防御力(合計)/攻撃力/スキルカードの使用枚数/アタッカーカードの使用枚数/手札/山札/墓地`
- 記録条件モードを以下へ変更
  - `現在値`
  - `がN以上増加`
  - `がN以上減少`
  - `がN以上増減`

### 実装

- `js/dev/dev.js`
  - タイミング単位の一括条件UIを追加
  - 効果条件UIを新モードへ更新
  - `onLeave` のときだけ `直接攻撃したか` を表示
- `js/dev/cardEffectBlockCompiler.js`
  - タイミング条件を `bundleCondition` 出力
- `js/game/effects/effectEngine.js`
  - `bundleCondition` 評価を追加
  - `directAttack` 条件を評価
  - 新 `trackerCheck.mode`（current/inc_n/dec_n/both_n）を評価
  - `skill_use/attacker_use/hand/deck/grave` の値解決を追加
- `js/game/auto/playerActionResolver.js`
  - カード使用時に `use.skill/use.attacker` カウンタを記録

---

## Round 38 — 条件階層拡張 + 効果番号連動（2026-06-02）

### 追加仕様

- 条件同階層に以下を追加
  - `アタッカー場のカードのT効果によって`（T選択）
  - `スキルカードの効果によって`
  - `この一連(同じタイミング内)の効果中`
- `N番目が発動したなら` を追加（複数番号選択）
- 同タイミング内の効果番号を表示し、上下移動可能にした
  - 実行順は番号（上から1..N）の昇順
  - 並べ替え後は位置に応じて番号が更新される
- 記録条件 owner を拡張
  - `アタッカー場のカード / 使用したスキルカード / このカード`

### 実装

- `js/dev/dev.js`
  - 効果番号表示、上下移動ボタンを追加
  - 新条件UI（T効果/スキル効果/同一連/N番目）を追加
  - タイミング一括条件にも同等入力を追加
  - 記録条件 owner の選択肢を拡張
- `js/game/effects/effectEngine.js`
  - 同一タイミング実行チェーン (`__chain.executedOrders`) を導入
  - `requiredExecutedOrder`（N番目条件）評価を追加
  - `byAttackerEffect / attackerTriggerT / bySkillEffect / inSameChain` を評価
  - 記録条件 owner（attacker_card/used_skill_card/this_card）評価を追加

---

## Round 39 — N番目条件の OR/AND 切替を追加（2026-06-02）

### 追加

- `N番目が発動したなら` の判定モードを追加
  - `どれか(OR)` = any
  - `すべて(AND)` = all

### 実装

- `js/dev/dev.js`
  - `requiredExecutedOrderMode` UI を追加
  - 条件デフォルトに `requiredExecutedOrderMode: "any"` を追加
- `js/game/effects/effectEngine.js`
  - `requiredExecutedOrderMode` に応じて `some/every` で判定
- `docs/dev-card-effect-block-spec.md`
  - 判定モード仕様を追記

---

## Round 40 — 現在値判定3種 + スコープ選択廃止（2026-06-03）

### 変更

- 現在値判定を3種へ分離
  - `現在値がN`
  - `現在値がN以上`
  - `現在値がN以下`
- `このターン中/ゲーム中` の明示セレクトを廃止
  - `thisTurn=true` なら `turn`
  - `thisTurn=false` なら自動で `game`

### 実装

- `js/dev/dev.js`
  - `TRACKER_MODE_OPTIONS` を更新（`current_eq/current_gte/current_lte`）
  - `trackerScope` UI（タイミング条件・効果条件）を削除
  - デフォルトモードを `current_gte` に変更
- `js/game/effects/effectEngine.js`
  - scope決定を `thisTurn` 連動へ変更（`turn/game` 自動）
  - 新 mode 3種を比較演算で評価
- `docs/dev-card-effect-block-spec.md`
  - mode と scope 自動化仕様を追記

---

## Round 41 — 直接攻撃有無のT/F判定をチェックボックス化（2026-06-03）

### 変更

- 退場時条件の `直接攻撃` 判定をセレクト式からチェックボックス式へ変更
  - `直接攻撃したかで判定`（有効化）
  - `直接攻撃した(True) / 未チェック=False`（期待値）
- タイミング一括条件 / 効果条件の両方に適用

### 実装

- `js/dev/dev.js`
  - 条件デフォルトに `directAttackEnabled / directAttackValue` を追加
  - 退場時条件UIをチェックボックス2つへ変更
- `js/game/effects/effectEngine.js`
  - `directAttackEnabled === true` の場合は `didDirectAttack` と `directAttackValue` を比較
  - 旧 `directAttack(any/did/not)` は後方互換として維持

## Round 2026-06-04 — 効果フローの割り込み原則を実装ルール化

### 反映した原則

- 効果は現在フローに割り込んで即時実行する。
- アタッカー場 / スキル場のカードを起点にした効果フロー中、
  途中でカード移動（墓地・手札・山札相当）が発生した時点で、そのフローを中断する。
- 処理順序は「一回の効果フロー中に条件が達成される」前提を崩さないよう固定する。

### 墓地へ送るフロー（統一）

1. 退場時効果を先に発動
2. その後、カードを墓地へ移動

補足: 退場時効果の結果として移動先が変わった場合（例: 手札へ戻る）は墓地移動を中止する。

### 手札へ戻るフロー（置換）

- 「墓地 or 山札へ行くなら代わりに手札へ戻る」は、移動先を手札に確定した時点でフローを終了する。

### 実装箇所

- `js/game/auto/playerActionResolver.js`
  - `placeCardInZone(..., "grave")` フックを前処理型に変更
  - 退場時効果を先に実行し、移動先変更時は墓地遷移を中断
- `js/game/effects/effectEngine.js`
  - `MOVE_SOURCE_TO_GRAVE/HAND/DECK` を flowBreak 扱いに変更
  - sourceカードが起点ゾーン（attacker/skill）を離れたら即時break


## Round 2026-06-04 — 開発者モード「カードデバッグ」追加

### 追加内容

- 開発者メニュー（デッキ右クリック）に `カードデバッグ (Dev)` を追加。
- 新規 `js/dev/cardDebug.js` を追加し、ゲーム上でモーダル起動できる1人用シミュレーターを実装。

### 機能

- ゾーン: アタッカー場 / スキル場 / 手札 / 墓地 / 山札 / 直接攻撃フィールド
- 操作: 山札再構築、ドロー、任意カードを手札へ追加、手札→場、場→墓地、直接攻撃
- 直接攻撃フロー（デバッグ内）:
  1. `onDirectAttack` 実行
  2. 直接攻撃ダメージ適用
  3. `onLeave` 実行
  4. 墓地へ移動
- 効果条件向け記録データ: tracker値（turn/game + custom/use + hp/pp/shield/atk）を一覧表示し手動編集可能
- フローログ: 効果フローをチャットログに追記、手入力メモ送信にも対応

### 実装上の方針

- 既存ゲーム状態を汚さないため、デバッグ実行時のみ `window.state` / `addVal` / `applyCalculatedDamage` / `GameStatTracker.resolvePath` などを一時差し替え、
  `EffectEngine.execute` をローカル状態で実行する。


## Round 2026-06-04 — カードデバッグの起動ボタン/起動前デッキ構築

### 変更

- `js/dev/cardDebug.js` を更新。
- 開発者モード時に常設の起動ボタン `カードデバッグ` を右下に配置。
- 起動直後はデバッグ本画面ではなく「起動設定」画面を表示。
  - カード一覧を検索しながら、カードごとに枚数指定
  - 合計枚数を表示
  - `このデッキで開始` でシミュレーター開始

### 挙動

- 0枚では開始不可（アラート表示）。
- 開始時に選択枚数ぶんの山札を生成してシャッフル。
- 既存のデバッグ操作（手札追加/場移動/直接攻撃/トラッカー編集/ログ）はそのまま利用可能。


## Round 2026-06-04 — カードデバッグのフロー処理ずれ修正

### 問題

- デバッグ画面で `EffectEngine.execute` を直接呼んでおり、
  本編の `PlayerActionResolver` が担う順序・中断判定とズレていた。

### 修正

- `手札→アタッカー/スキル` は `resolveCardOnPlay` を優先して実行。
- `墓地へ送る` は `resolveCardOnLeave` を先に実行し、
  退場時効果で移動先が変わった場合は墓地移動を中断。
- `直接攻撃` は `resolveDirectAttack` → ダメージ適用 → `resolveCardOnLeave` → 墓地移動（中断判定あり）に統一。

### 404ログについて

- `Failed to load resource ... %25E3...` は画像パスの二重エンコード/存在しない画像由来の可能性が高く、
  デバッグフロー処理そのものとは別問題。


## Round 2026-06-05 — `grant_effect_bundle` の発火/継続消費を EffectEngine へ実装

### 問題

- 2026-06-02 時点では `GRANT_EFFECT_BUNDLE` で `state[owner].grantedEffects` へ登録するのみで、
  付与効果の実行・継続期間（turn/count）の消費・期限切れ削除が未実装だった。

### 実装

- `js/game/effects/effectEngine.js`
  - `executeGrantedEffects(context)` を追加。
  - `grantedEffects` をイベント文脈（owner/opponent/source/event）で実行できるようにした。
  - duration を正規化して保持（`mode/turns/counts` を数値クランプ）。
  - 期限切れ判定を追加し、失効エントリを自動削除。
  - 消費ルール:
    - `count`: 付与効果で1つ以上 `applied` されたイベントで `counts -1`
    - `turn`: `onTurnStart` のタイミングで `turns -1`
    - `both`: 上記両方を適用し、どちらか0で失効
  - 同一ターン中の重複 turn 消費防止として、`round:turn:owner` 単位で `onTurnStart` の減算を1回化。

- 呼び出し側拡張（イベント発生時に通常トリガーと同じ文脈で付与効果を先に実行）
  - `js/game/game.js`
    - `startTurnDraw()` の `onTurnStart` で `executeGrantedEffects(...)` を1回呼ぶ。
  - `js/game/auto/playerActionResolver.js`
    - `onSummon` / `onDirectAttack` の実行経路（`resolveWithEffectEngine`）で付与効果を実行。
    - `onLeave` 経路（`resolveCardOnLeave`）でも付与効果を実行。
  - `js/game/auto/autoBattleEngine.js`
    - 自動戦闘の `onDirectAttack` 実行時に付与効果を実行。
  - `js/game/auto/firstEightCardEffects.js`
    - `onAttack` 実行時に付与効果を実行。

### 仕様/制約

- 付与効果 (`grantedEffects[]`) は「付与先プレイヤーがイベントを起こした時」に、そのイベント文脈で実行される。
- `turn` モードの付与効果は `onTurnStart` 時のみ発火する（毎イベント発火しない）。
- `count` / `both` の回数消費は「効果が1件以上適用されたイベント」のみで行う（全件 `skipped` の場合は消費しない）。
- 今回は最小差分を優先し、`data/cards.json` への検証用カード追加は行っていない。
