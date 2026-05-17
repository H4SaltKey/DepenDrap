window.PatchNotesStorage = {
  downloadJson: function(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  uploadJson: function(file, callback) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        callback(null, data);
      } catch (err) {
        callback(err, null);
      }
    };
    reader.onerror = () => callback(new Error("File read error"), null);
    reader.readAsText(file);
  }
};
