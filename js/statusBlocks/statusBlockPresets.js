window.StatusBlockPresets = {
  presets: [],
  load: async function() {
    try {
      const res = await fetch("data/statusBlockPresets.json?" + new Date().getTime());
      if (res.ok) {
        this.presets = await res.json();
      } else {
        console.warn("Failed to load data/statusBlockPresets.json");
      }
    } catch (e) {
      console.warn("Error loading data/statusBlockPresets.json", e);
    }
  },
  get: function() {
    return this.presets;
  }
};

// Auto-load if in game or dev environment
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    window.StatusBlockPresets.load();
  });
}
