/**
 * patchnotesStorage.js
 * JSONロード/保存専用
 */

export class PatchNotesStorage {
  static async load() {
    // 開発中の編集データがあればそれを優先
    const devData = localStorage.getItem('patchnotes_dev');
    if (devData) {
      try {
        return JSON.parse(devData);
      } catch (e) {
        console.warn('Failed to parse dev patchnotes from localStorage', e);
      }
    }

    try {
      const response = await fetch('data/patchnotes.json');
      if (!response.ok) throw new Error('Failed to load patchnotes');
      return await response.json();
    } catch (e) {
      console.error('PatchNotesStorage load error:', e);
      return { versions: [] };
    }
  }

  static async save(data) {
    // 静的サイトの場合、サーバーのファイルに直接保存はできないため
    // 開発者モードでは localStorage に保存してプレビューできるようにする
    localStorage.setItem('patchnotes_dev', JSON.stringify(data));
    console.log('[PatchNotesStorage] Saved to localStorage (dev mode)');
    return true;
  }

  static downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  static uploadJson(file, callback) {
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

  static clearDevData() {
    localStorage.removeItem('patchnotes_dev');
  }
}
