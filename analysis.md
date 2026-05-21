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
