# DepenDrap_Online 継続解析ログ

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
