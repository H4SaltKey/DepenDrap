(function() {
  const TRACKS = {
    title: "assets/bgm/title.mp3",
    match: "assets/bgm/match.mp3",
    game: "assets/bgm/game.mp3",
    resultWin: "assets/bgm/result_win.mp3",
    resultLose: "assets/bgm/result_lose.mp3",
    deck: "assets/bgm/deck.mp3"
  };

  const audio = new Audio();
  audio.loop = true;
  audio.preload = "none";
  let currentScene = "";

  function getVolume() {
    try {
      const settings = JSON.parse(localStorage.getItem("settings") || "{}");
      const volume = Number(settings.bgm);
      return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.5;
    } catch (_) {
      return 0.5;
    }
  }

  function resumePlayback() {
    if (!audio.src || !audio.paused) return;
    audio.play().catch(() => {});
  }

  function playScene(scene) {
    const track = TRACKS[scene];
    if (!track) return;
    audio.volume = getVolume();
    if (currentScene !== scene) {
      currentScene = scene;
      audio.src = new URL(track, document.baseURI).href;
      audio.load();
    }
    resumePlayback();
  }

  function sceneForPage() {
    const page = location.pathname.split("/").pop() || "index.html";
    if (page === "index.html") return "title";
    if (["playMode.html", "matchSetup.html"].includes(page)) return "match";
    if (["deckSelect.html", "deck.html"].includes(page)) return "deck";
    if (page === "game.html") return "game";
    return "";
  }

  document.addEventListener("input", (event) => {
    if (event.target?.id === "bgmVolume") {
      const value = Number(event.target.value);
      audio.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : getVolume();
    }
  });
  window.addEventListener("pointerdown", resumePlayback);
  window.addEventListener("keydown", resumePlayback);

  window.BgmManager = { playScene, getCurrentScene: () => currentScene };

  const initialScene = sceneForPage();
  if (initialScene) playScene(initialScene);
})();
