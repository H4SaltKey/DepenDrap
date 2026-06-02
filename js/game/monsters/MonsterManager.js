/**
 * MonsterManager.js
 * モンスターの状態管理・ラウンド開始時の配置・討伐処理
 * 既存コードへの直接依存なし（window.state / window.addGameLog 経由のみ）
 */

window.MonsterManager = (function() {

  const SLOT_COUNT = 6;

  // ===== 内部状態 =====
  // slots: Array(6) of { monsterId, currentHp, hitCountThisTurn, retreatCountdown } | null
  let _slots = Array(SLOT_COUNT).fill(null);
  // 討伐済みスロット（次ラウンドで再出現）
  let _defeatedSlots = new Set();

  // ===== ユーティリティ =====
  function _getDef(id) {
    return (window.MONSTER_DEFINITIONS || []).find(m => m.id === id) || null;
  }

  function _randomPool(exclude = []) {
    const pool = (window.MONSTER_ID_POOL || []).filter(id => !exclude.includes(id));
    if (pool.length === 0) return window.MONSTER_ID_POOL?.[0] || "goblin";
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ===== 公開API =====

  /**
   * ラウンド開始時にスロットを初期化・再配置
   * 討伐済みスロットのみ新モンスターを配置
   */
  function initRound(round) {
    if (round === 1) {
      // 初回: 全スロットにランダム配置
      const used = [];
      for (let i = 0; i < SLOT_COUNT; i++) {
        const id = _randomPool(used);
        used.push(id);
        const def = _getDef(id);
        _slots[i] = {
          slotIndex: i,
          monsterId: id,
          currentHp: def?.hp || 5,
          maxHp: def?.hp || 5,
          atkBonus: 0,
          shield: Number(def?.shield || 0),
          def: Number(def?.def || 0),
          hitCountThisTurn: 0,
          retreatCountdown: 0
        };
      }
      _defeatedSlots.clear();
    } else {
      // 2ラウンド以降: 討伐済みスロットのみ再配置
      const used = _slots.filter(s => s !== null).map(s => s.monsterId);
      _defeatedSlots.forEach(i => {
        const id = _randomPool(used);
        used.push(id);
        const def = _getDef(id);
        _slots[i] = {
          slotIndex: i,
          monsterId: id,
          currentHp: def?.hp || 5,
          maxHp: def?.hp || 5,
          atkBonus: 0,
          shield: Number(def?.shield || 0),
          def: Number(def?.def || 0),
          hitCountThisTurn: 0,
          retreatCountdown: 0
        };
      });
      _defeatedSlots.clear();
    }

    // ターン開始時カウントリセット
    _slots.forEach(s => { if (s) s.hitCountThisTurn = 0; });

    if (typeof window.addGameLog === "function") {
      window.addGameLog(`[MONSTER] ラウンド${round}: モンスターが出現しました。`);
    }
  }

  /**
   * ターン開始時の処理（ヒットカウントリセット）
   */
  function onTurnStart() {
    _slots.forEach(s => { if (s) s.hitCountThisTurn = 0; });
  }

  /**
   * モンスターへのダメージ処理
   * @returns { defeated: bool, actualDmg: number }
   */
  function dealDamage(slotIndex, rawDmg, attacker, dmgType = "damage") {
    const slot = _slots[slotIndex];
    if (!slot) return { defeated: false, actualDmg: 0 };

    const def = _getDef(slot.monsterId);
    slot.hitCountThisTurn = (slot.hitCountThisTurn || 0) + 1;

    // 特性によるダメージ変換
    let dmg = rawDmg;
    if (def?.traits) {
      const ctx = { attacker, hitCountThisTurn: slot.hitCountThisTurn };
      def.traits.forEach(trait => {
        if (typeof trait.onDamageReceived === "function") {
          dmg = trait.onDamageReceived(dmg, ctx);
        }
      });
    }
    dmg = Math.max(0, dmg);

    // ダメージ種別に応じた適用処理（damageCalc.js の applyDamageByRule と同様）
    let remain = dmg;
    switch (dmgType) {
      case "hp_reduce":
        // HP を直接減らす（防御無視）
        slot.currentHp = Math.max(0, slot.currentHp - dmg);
        remain = dmg;
        break;
      case "fragile":
        // 脆弱ダメージ: 防御力を削る
        slot.def = Math.max(0, (slot.def || 0) - dmg);
        remain = 0;
        break;
      case "pierce":
        // 貫通ダメージ: シールド → HP
        const shieldAbsorb = Math.min(slot.shield || 0, dmg);
        slot.shield = Math.max(0, (slot.shield || 0) - shieldAbsorb);
        remain = dmg - shieldAbsorb;
        slot.currentHp = Math.max(0, slot.currentHp - remain);
        break;
      case "arcana":
        // アルカナダメージ: 防御 → シールド → HP
        const defAbsorb = Math.min(slot.def || 0, dmg);
        slot.def = Math.max(0, (slot.def || 0) - defAbsorb);
        remain = dmg - defAbsorb;
        const shieldAbsorb2 = Math.min(slot.shield || 0, remain);
        slot.shield = Math.max(0, (slot.shield || 0) - shieldAbsorb2);
        remain -= shieldAbsorb2;
        slot.currentHp = Math.max(0, slot.currentHp - remain);
        break;
      case "direct_attack":
      case "damage":
      default:
        // 通常ダメージ/直接攻撃: 防御力 → シールド → HP
        const defVal = Math.max(0, Number(slot.def || 0));
        if (defVal > 0) remain = Math.max(0, remain - defVal);
        const shieldVal = Math.max(0, Number(slot.shield || 0));
        if (shieldVal > 0 && remain > 0) {
          const absorb = Math.min(shieldVal, remain);
          slot.shield = shieldVal - absorb;
          remain -= absorb;
        }
        slot.currentHp = Math.max(0, slot.currentHp - remain);
        break;
    }

    if (typeof window.addGameLog === "function") {
      const dmgTypeStr = dmgType === "damage" ? "" : `[${dmgType}] `;
      window.addGameLog(`[MONSTER] ${def?.name || slot.monsterId} に ${dmgTypeStr}${dmg} ダメージ（残HP: ${slot.currentHp}/${slot.maxHp} / シールド:${slot.shield || 0} / 防御:${slot.def || 0}）`);
    }

    if (slot.currentHp <= 0) {
      return _defeatMonster(slotIndex, attacker);
    }

    return { defeated: false, actualDmg: remain };
  }

  /**
   * モンスター討伐処理
   */
  function _defeatMonster(slotIndex, killer) {
    const slot = _slots[slotIndex];
    if (!slot) return { defeated: false, actualDmg: 0 };

    const def = _getDef(slot.monsterId);
    const expReward = def?.expReward || 1;

    if (typeof window.addGameLog === "function") {
      window.addGameLog(`[MONSTER] ${def?.name || slot.monsterId} を討伐！ラストヒット: ${killer}`);
    }

    // 特性の討伐時処理
    if (def?.traits) {
      def.traits.forEach(trait => {
        if (typeof trait.onDefeat === "function") {
          trait.onDefeat({ killer, slotIndex });
        }
      });
    }

    _defeatedSlots.add(slotIndex);
    _slots[slotIndex] = null;

    return { defeated: true, actualDmg: slot.currentHp, expReward, killer, monsterId: slot.monsterId };
  }

  /**
   * モンスターの攻撃処理（ターン終了時に呼ぶ）
   * @param slotIndex 攻撃するモンスターのスロット
   * @param targetPlayer "player1" | "player2"
   * @returns { dmg: number, actionLabel: string, actionType: string }
   */
  function monsterAttack(slotIndex, targetPlayer) {
    const slot = _slots[slotIndex];
    if (!slot) return { dmg: 0, actionLabel: "", actionType: "" };

    const def = _getDef(slot.monsterId);
    if (!def) return { dmg: 0, actionLabel: "", actionType: "" };

    // 行動パターンから重み付きランダム選択
    const actions = def.actions || [{ type: "attack", label: "攻撃", weight: 1 }];
    const totalWeight = actions.reduce((s, a) => s + (a.weight || 1), 0);
    let rand = Math.random() * totalWeight;
    let chosen = actions[0];
    for (const a of actions) {
      rand -= (a.weight || 1);
      if (rand <= 0) { chosen = a; break; }
    }

    let dmg = Math.max(0, Number(def.atk || 1) + Number(slot.atkBonus || 0));
    if (chosen.type === "attack_double") dmg = Math.floor(dmg * 1.5);

    if (typeof window.addGameLog === "function") {
      window.addGameLog(`[MONSTER] ${def.name} の「${chosen.label}」→ ${targetPlayer} に ${dmg} ダメージ`);
    }

    return { dmg, actionLabel: chosen.label, actionType: chosen.type || "attack" };
  }

  /**
   * 撤退時の追撃カウントダウン設定
   */
  function setRetreatCountdown(slotIndex, turns = 2) {
    const slot = _slots[slotIndex];
    if (slot) slot.retreatCountdown = turns;
  }

  /**
   * 撤退追撃の処理（ターン開始時）
   * @returns Array of { slotIndex, dmg }
   */
  function processRetreatAttacks(targetPlayer) {
    const attacks = [];
    _slots.forEach((slot, i) => {
      if (!slot || slot.retreatCountdown <= 0) return;
      slot.retreatCountdown--;
      const def = _getDef(slot.monsterId);
      const dmg = Math.ceil((def?.atk || 1) * 1.5); // 背後攻撃: 1.5倍
      attacks.push({ slotIndex: i, dmg, label: "背後攻撃" });
      if (typeof window.addGameLog === "function") {
        window.addGameLog(`[MONSTER] ${def?.name} の背後攻撃！ ${targetPlayer} に ${dmg} ダメージ`);
      }
    });
    return attacks;
  }

  /**
   * スロット情報取得
   */
  function getSlot(i) { return _slots[i] || null; }
  function getAllSlots() { return _slots.slice(); }
  function getMonsterAttack(slotIndex) {
    const slot = _slots[slotIndex];
    if (!slot) return 0;
    const def = _getDef(slot.monsterId);
    return Math.max(0, Number(def?.atk || 0) + Number(slot.atkBonus || 0));
  }
  function addMonsterAttack(slotIndex, delta) {
    const slot = _slots[slotIndex];
    if (!slot) return 0;
    slot.atkBonus = Number(slot.atkBonus || 0) + Number(delta || 0);
    return getMonsterAttack(slotIndex);
  }
  function setMonsterAttack(slotIndex, value) {
    const slot = _slots[slotIndex];
    if (!slot) return 0;
    const def = _getDef(slot.monsterId);
    const base = Math.max(0, Number(def?.atk || 0));
    const target = Math.max(0, Number(value || 0));
    slot.atkBonus = target - base;
    return getMonsterAttack(slotIndex);
  }

  /**
   * Firebase同期用シリアライズ
   */
  function serialize() {
    return {
      slots: _slots.map(s => s ? { ...s } : null),
      defeatedSlots: [..._defeatedSlots]
    };
  }

  /**
   * Firebase同期用デシリアライズ
   */
  function deserialize(data) {
    if (!data) return;
    if (Array.isArray(data.slots)) {
      _slots = data.slots.map(s => s ? { ...s } : null);
    }
    if (Array.isArray(data.defeatedSlots)) {
      _defeatedSlots = new Set(data.defeatedSlots);
    }
  }

  return {
    initRound,
    onTurnStart,
    dealDamage,
    monsterAttack,
    setRetreatCountdown,
    processRetreatAttacks,
    getSlot,
    getAllSlots,
    getMonsterAttack,
    addMonsterAttack,
    setMonsterAttack,
    serialize,
    deserialize,
    SLOT_COUNT
  };

})();
