/**
 * BattleTargetSystem.js
 * ラウンドごとの所在と、そのターンの攻撃対象を管理する。
 */

window.BattleTargetSystem = (function() {
  const _targets = { player1: null, player2: null };
  const _targetRounds = { player1: 0, player2: 0 };
  const _locations = { player1: null, player2: null };
  const _canChange = { player1: false, player2: false };

  function currentRound(round) {
    return Number(round || window.state?.matchData?.round || 1);
  }

  function getLocation(playerKey, round) {
    const location = _locations[playerKey];
    return location && location.round === currentRound(round) ? { ...location } : null;
  }

  function needsLocationChoice(playerKey, round) {
    return !getLocation(playerKey, round);
  }

  function getOccupants(slotIndex, round) {
    const activeRound = currentRound(round);
    return ["player1", "player2"]
      .filter(player => _locations[player]?.round === activeRound && _locations[player].slotIndex === Number(slotIndex))
      .sort((a, b) => Number(_locations[a].arrivedAt) - Number(_locations[b].arrivedAt) || a.localeCompare(b));
  }

  function isExcited(slotIndex, round) {
    return getOccupants(slotIndex, round).length > 1;
  }

  function canTargetPlayer(playerKey, round) {
    const activeRound = currentRound(round);
    if (activeRound <= 1) return false;
    const own = getLocation(playerKey, activeRound);
    const opponentKey = playerKey === "player1" ? "player2" : "player1";
    const opponent = getLocation(opponentKey, activeRound);
    return !!own && !!opponent && own.slotIndex === opponent.slotIndex;
  }

  function onTurnStart(playerKey) {
    _canChange[playerKey] = true;
  }

  function chooseLocation(playerKey, slotIndex, round) {
    const activeRound = currentRound(round);
    const index = Number(slotIndex);
    if (!Number.isInteger(index) || !window.MonsterManager?.getSlot(index)) {
      return { ok: false, reason: "そのモンスターは選べません" };
    }
    if (!needsLocationChoice(playerKey, activeRound)) {
      return { ok: false, reason: "このラウンドの所在はすでに決定しています" };
    }
    const firstPlayer = window.state?.matchData?.firstPlayer || "player1";
    const arrivalOrder = playerKey === firstPlayer ? 0 : 1;
    _locations[playerKey] = { slotIndex: index, round: activeRound, arrivedAt: activeRound * 2 + arrivalOrder };
    _targets[playerKey] = { slotIndex: index };
    _targetRounds[playerKey] = activeRound;
    return { ok: true };
  }

  function setTarget(playerKey, target) {
    if (!_canChange[playerKey]) {
      return { ok: false, reason: "ターン開始時のみ攻撃対象を選択できます" };
    }
    const location = getLocation(playerKey);
    if (!location) return { ok: false, reason: "先にこのラウンドの対峙先を選んでください" };

    if (target === "player") {
      if (!canTargetPlayer(playerKey)) return { ok: false, reason: "相手と同じモンスターの場所にいる時だけ攻撃できます" };
    } else if (!target || Number(target.slotIndex) !== location.slotIndex) {
      return { ok: false, reason: "このラウンドに選んだ場所の対象だけ選べます" };
    }

    _targets[playerKey] = target === "player" ? "player" : { slotIndex: location.slotIndex };
    _targetRounds[playerKey] = currentRound();
    _canChange[playerKey] = false;
    return { ok: true };
  }

  function getTarget(playerKey) {
    const round = currentRound();
    if (_targetRounds[playerKey] === round && _targets[playerKey]) return _targets[playerKey];
    const location = getLocation(playerKey, round);
    return location ? { slotIndex: location.slotIndex } : "player";
  }

  function isPvE(playerKey) {
    const target = getTarget(playerKey);
    return target !== "player" && typeof target === "object" && Number.isInteger(target.slotIndex);
  }

  function isPvP(playerKey) {
    return getTarget(playerKey) === "player";
  }

  function canChangeTarget(playerKey) {
    return !!_canChange[playerKey];
  }

  function lockTarget(playerKey) {
    _canChange[playerKey] = false;
  }

  function onMonsterDefeated() {
    return false;
  }

  function serialize() {
    return {
      targets: { ..._targets },
      targetRounds: { ..._targetRounds },
      locations: Object.fromEntries(Object.entries(_locations).map(([key, value]) => [key, value ? { ...value } : null])),
      canChange: { ..._canChange }
    };
  }

  function deserialize(data) {
    if (!data) return;
    if (data.targets) Object.assign(_targets, data.targets);
    if (data.targetRounds) Object.assign(_targetRounds, data.targetRounds);
    if (data.locations) {
      Object.entries(data.locations).forEach(([key, value]) => {
        if (key in _locations) _locations[key] = value ? { ...value } : null;
      });
    }
    if (data.canChange) Object.assign(_canChange, data.canChange);
    if (!data.locations) {
      const round = currentRound();
      ["player1", "player2"].forEach(player => {
        const oldTarget = data.targets?.[player];
        if (oldTarget && oldTarget !== "player" && Number.isInteger(Number(oldTarget.slotIndex))) {
          _locations[player] = { slotIndex: Number(oldTarget.slotIndex), round, arrivedAt: Date.now() };
          _targetRounds[player] = round;
        }
      });
    }
  }

  function reset() {
    ["player1", "player2"].forEach(player => {
      _targets[player] = null;
      _targetRounds[player] = 0;
      _locations[player] = null;
      _canChange[player] = false;
    });
  }

  return {
    onTurnStart,
    lockTarget,
    chooseLocation,
    needsLocationChoice,
    getLocation,
    getOccupants,
    isExcited,
    canTargetPlayer,
    setTarget,
    getTarget,
    isPvE,
    isPvP,
    canChangeTarget,
    onMonsterDefeated,
    serialize,
    deserialize,
    reset
  };
})();
