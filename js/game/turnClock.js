(function() {
  const DEFAULTS = Object.freeze({ initialSeconds: 300, incrementSeconds: 20, carryoverPercent: 30 });

  function normalizeSettings(settings) {
    const source = settings || {};
    const read = (key, fallback, min, max) => {
      const value = Number(source[key]);
      return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
    };
    return {
      initialSeconds: read("initialSeconds", DEFAULTS.initialSeconds, 1, 36000),
      incrementSeconds: read("incrementSeconds", DEFAULTS.incrementSeconds, 0, 36000),
      carryoverPercent: read("carryoverPercent", DEFAULTS.carryoverPercent, 0, 100)
    };
  }

  function isEnabled() {
    return !window._soloHotSeat && !!localStorage.getItem("gameRoom");
  }

  function turnKey(matchData) {
    return `${Number(matchData?.round || 0)}-${Number(matchData?.turn || 0)}-${String(matchData?.turnPlayer || "")}`;
  }

  function remainingSeconds(matchData, player, now = Date.now()) {
    const clock = matchData?.turnClock;
    const bank = Number(clock?.remaining?.[player]);
    if (!Number.isFinite(bank)) return Number(clock?.settings?.initialSeconds || DEFAULTS.initialSeconds);
    if (clock.activePlayer !== player || !Number.isFinite(Number(clock.startedAt))) return Math.max(0, bank);
    return Math.max(0, bank - Math.max(0, now - Number(clock.startedAt)) / 1000);
  }

  function create(matchData, now = Date.now()) {
    const settings = normalizeSettings(matchData?.clockSettings);
    const remaining = { player1: settings.initialSeconds, player2: settings.initialSeconds };
    const activePlayer = matchData.turnPlayer;
    remaining[activePlayer] += settings.incrementSeconds;
    return {
      settings,
      remaining,
      activePlayer,
      startedAt: now,
      turnKey: turnKey(matchData)
    };
  }

  function ensureStarted(matchData) {
    if (!isEnabled() || !matchData || matchData.status !== "playing" || matchData.winner || matchData.turnClock) return false;
    const role = window.getMyRole ? window.getMyRole() : window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    if (role !== matchData.turnPlayer) return false;
    matchData.clockSettings = normalizeSettings(matchData.clockSettings);
    matchData.turnClock = create(matchData);
    const room = localStorage.getItem("gameRoom");
    if (room && window.firebaseClient?.writeMatchData) {
      window.firebaseClient.writeMatchData(room, matchData).catch(error => console.warn("[TurnClock] 初期化の同期に失敗:", error));
    }
    return true;
  }

  function settleAndStartNext(matchData, currentPlayer, nextMatchData, now = Date.now()) {
    if (!isEnabled()) return null;
    const clock = matchData?.turnClock;
    if (!clock || clock.activePlayer !== currentPlayer) return null;
    const settings = normalizeSettings(clock.settings || matchData.clockSettings);
    const currentRemaining = remainingSeconds(matchData, currentPlayer, now);
    if (currentRemaining <= 0) {
      expire(matchData, now);
      return null;
    }
    const remaining = {
      player1: Math.max(0, Number(clock.remaining?.player1) || 0),
      player2: Math.max(0, Number(clock.remaining?.player2) || 0)
    };
    remaining[currentPlayer] = Math.floor(currentRemaining * settings.carryoverPercent / 100);
    const nextPlayer = nextMatchData?.turnPlayer;
    remaining[nextPlayer] = Math.max(0, remaining[nextPlayer]) + settings.incrementSeconds;
    return {
      settings,
      remaining,
      activePlayer: nextPlayer,
      startedAt: now,
      turnKey: turnKey(nextMatchData)
    };
  }

  function expire(matchData, now = Date.now()) {
    if (!isEnabled() || !matchData || matchData.status !== "playing" || matchData.winner) return false;
    const clock = matchData.turnClock;
    if (!clock || remainingSeconds(matchData, clock.activePlayer, now) > 0) return false;
    const activePlayer = clock.activePlayer;
    const winner = activePlayer === "player1" ? "player2" : "player1";
    matchData.turnClock.remaining[activePlayer] = 0;
    matchData.winner = winner;
    matchData.winnerSetAt = now;
    const room = localStorage.getItem("gameRoom");
    if (room && window.firebaseClient?.writeMatchData) {
      window.firebaseClient.writeMatchData(room, matchData).catch(error => console.warn("[TurnClock] 時間切れ結果の同期に失敗:", error));
    }
    if (typeof window.addGameLog === "function") window.addGameLog(`[MATCH] ${activePlayer} の持ち時間が0になり、${winner} の勝利です。`);
    if (typeof window.update === "function") window.update();
    return true;
  }

  function render() {
    const matchData = window.state?.matchData;
    let display = document.getElementById("turnClockDisplay");
    if (!isEnabled() || matchData?.status !== "playing" || !matchData.turnClock) {
      if (display) display.style.display = "none";
      return;
    }
    if (!display) {
      display = document.createElement("div");
      display.id = "turnClockDisplay";
      display.style.cssText = "position:fixed;top:max(52px,calc(env(safe-area-inset-top,0px) + 48px));left:50%;transform:translateX(-50%);z-index:5301;padding:5px 12px;border:1px solid rgba(199,179,119,.45);border-radius:8px;background:rgba(8,6,18,.9);color:#eee;font:700 13px/1.35 system-ui,sans-serif;white-space:nowrap;pointer-events:none;";
      document.body.appendChild(display);
    }
    const myRole = window.getMyRole ? window.getMyRole() : window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    const opponent = myRole === "player1" ? "player2" : "player1";
    const label = player => {
      const seconds = Math.ceil(remainingSeconds(matchData, player));
      const minutes = Math.floor(seconds / 60);
      const rest = String(seconds % 60).padStart(2, "0");
      const active = matchData.turnClock.activePlayer === player;
      const color = active ? "#ffe078" : "#bbb";
      const marker = active ? " ▶" : "";
      return `<span style="color:${color}">${player === myRole ? "自分" : "相手"} ${minutes}:${rest}${marker}</span>`;
    };
    display.innerHTML = `${label(myRole)}　|　${label(opponent)}`;
    display.style.display = "block";
    if (!matchData.winner) expire(matchData);
  }

  window.TurnClock = {
    DEFAULTS,
    normalizeSettings,
    create,
    ensureStarted,
    remainingSeconds,
    settleAndStartNext,
    expire,
    render
  };
})();
