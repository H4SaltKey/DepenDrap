/**
 * deckImageDB.js
 * デッキ画像用 IndexedDB ヘルパー（deckSelect.js と game.js で共有）
 */

let deckImageDB = null;
const DECK_IMAGE_DB_NAME = "DependrapDeckImages";
const DECK_IMAGE_STORE_NAME = "backImages";

async function initDeckImageDB() {
  if (deckImageDB) return deckImageDB;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DECK_IMAGE_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DECK_IMAGE_STORE_NAME)) {
        db.createObjectStore(DECK_IMAGE_STORE_NAME, { keyPath: "deckId" });
      }
    };
    req.onsuccess = () => {
      deckImageDB = req.result;
      resolve(deckImageDB);
    };
    req.onerror = () => {
      console.error("Failed to initialize IndexedDB:", req.error);
      reject(req.error);
    };
  });
}

async function getBackImageFromDB(deckId) {
  try {
    if (!deckImageDB) await initDeckImageDB();
    return new Promise((resolve) => {
      const tx = deckImageDB.transaction([DECK_IMAGE_STORE_NAME], "readonly");
      const store = tx.objectStore(DECK_IMAGE_STORE_NAME);
      const req = store.get(deckId);
      req.onsuccess = () => resolve(req.result?.dataUrl || "");
      req.onerror = () => {
        console.warn("Failed to get back image from DB:", req.error);
        resolve("");
      };
    });
  } catch (err) {
    console.warn("Exception getting back image:", err);
    return "";
  }
}

async function saveBackImageToDB(deckId, dataUrl) {
  try {
    if (!deckImageDB) await initDeckImageDB();
    return new Promise((resolve, reject) => {
      const tx = deckImageDB.transaction([DECK_IMAGE_STORE_NAME], "readwrite");
      const store = tx.objectStore(DECK_IMAGE_STORE_NAME);
      const req = store.put({ deckId, dataUrl });
      req.onsuccess = () => {
        console.log("Back image saved for deck:", deckId);
        resolve();
      };
      req.onerror = () => {
        console.error("Failed to save back image:", req.error);
        reject(req.error);
      };
    });
  } catch (err) {
    console.error("Exception saving back image:", err);
    throw err;
  }
}

async function deleteBackImageFromDB(deckId) {
  try {
    if (!deckImageDB) await initDeckImageDB();
    return new Promise((resolve) => {
      const tx = deckImageDB.transaction([DECK_IMAGE_STORE_NAME], "readwrite");
      const store = tx.objectStore(DECK_IMAGE_STORE_NAME);
      const req = store.delete(deckId);
      req.onsuccess = () => {
        console.log("Back image deleted for deck:", deckId);
        resolve();
      };
      req.onerror = () => {
        console.warn("Failed to delete back image:", req.error);
        resolve();
      };
    });
  } catch (err) {
    console.warn("Exception deleting back image:", err);
  }
}

// グローバルエクスポート
window.getBackImageFromDB = getBackImageFromDB;
window.initDeckImageDB = initDeckImageDB;
window.saveBackImageToDB = saveBackImageToDB;
window.deleteBackImageFromDB = deleteBackImageFromDB;
