/**
 * patchnotesDev.js
 * dev.html編集専用
 */

import { PatchNotesStorage } from './patchnotesStorage.js';

export class PatchNotesDev {
  static async init() {
    console.log('[PatchNotesDev] Initializing...');
    this.data = await PatchNotesStorage.load();
    this.renderEditor();
  }

  static renderEditor() {
    let overlay = document.getElementById('patchNotesEditorOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'patchNotesEditorOverlay';
      overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:10000; display:flex; flex-direction:column; padding:20px; color:white; overflow-y:auto;";
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div style="max-width: 900px; margin: 0 auto; width: 100%;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #555; padding-bottom: 10px; margin-bottom:20px;">
          <h2 style="color: #f0d080; margin:0;">Patch Notes Editor</h2>
          <button id="pnDevCloseBtn" style="background:#c0392b; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold;">閉じる</button>
        </div>
        
        <div class="dev-box" style="background:#111; padding:20px; border-radius:8px; border:1px solid #444;">
          <div style="margin-bottom:15px;">
            <button id="pnDevSaveBtn" style="background:#27ae60; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">JSONを保存 (ローカル)</button>
            <button id="pnDevDownloadBtn" style="background:#2980b9; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; margin-left:10px;">JSONをダウンロード</button>
            <button id="pnDevAddVersionBtn" style="background:#8e44ad; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; margin-left:10px;">新バージョン追加</button>
          </div>

          <div id="pnDevVersionsList" style="display:flex; flex-direction:column; gap:15px;">
            <!-- バージョンリストがここに生成される -->
          </div>
        </div>
      </div>
    `;

    this.renderVersions();
    this.bindGlobalEvents();
    
    document.getElementById('pnDevCloseBtn').onclick = () => {
      overlay.remove();
    };
  }

  static renderVersions() {
    const listDiv = document.getElementById('pnDevVersionsList');
    if (!listDiv) return;

    listDiv.innerHTML = '';

    this.data.versions.forEach((v, vIdx) => {
      const vBox = document.createElement('div');
      vBox.style.cssText = "background:#1a1a1a; border:1px solid #444; padding:15px; border-radius:6px;";
      
      vBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div>
            <input type="text" value="${v.version}" class="pn-v-num" data-vidx="${vIdx}" style="background:#000; color:#fff; border:1px solid #555; padding:4px; font-size:16px; font-weight:bold; width:100px;">
            <input type="text" value="${v.date}" class="pn-v-date" data-vidx="${vIdx}" style="background:#000; color:#ccc; border:1px solid #555; padding:4px; font-size:14px; width:120px; margin-left:10px;">
          </div>
          <div>
            <button class="pnDevAddCatBtn" data-vidx="${vIdx}" style="background:#2f80ed; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">カテゴリ追加</button>
            <button class="pnDevDelVersionBtn" data-vidx="${vIdx}" style="background:#c0392b; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; margin-left:5px;">削除</button>
          </div>
        </div>

        <div class="pn-categories-list" data-vidx="${vIdx}" style="display:flex; flex-direction:column; gap:10px;">
          <!-- カテゴリがここに生成される -->
        </div>
      `;

      const catListDiv = vBox.querySelector('.pn-categories-list');
      this.renderCategories(v.categories, vIdx, catListDiv);

      listDiv.appendChild(vBox);
    });

    this.bindVersionEvents();
  }

  static renderCategories(categories, vIdx, container) {
    if (!categories) return;

    categories.forEach((cat, cIdx) => {
      const catBox = document.createElement('div');
      catBox.style.cssText = "background:#222; border:1px solid #555; padding:10px; border-radius:4px; margin-left:20px;";
      
      catBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <input type="text" value="${cat.title}" class="pn-c-title" data-vidx="${vIdx}" data-cidx="${cIdx}" style="background:#000; color:#fff; border:1px solid #555; padding:4px; font-weight:bold; width:150px;">
            <label style="color:#ccc; font-size:12px; cursor:pointer;">
              <input type="checkbox" class="pn-c-notify" data-vidx="${vIdx}" data-cidx="${cIdx}" ${cat.notify ? 'checked' : ''}> 通知
            </label>
            <input type="text" value="${cat.id}" class="pn-c-id" data-vidx="${vIdx}" data-cidx="${cIdx}" style="background:#000; color:#888; border:1px solid #444; padding:2px; font-size:12px; width:80px;" placeholder="cat_id">
          </div>
          <div>
            <button class="pnDevAddEntryBtn" data-vidx="${vIdx}" data-cidx="${cIdx}" style="background:#27ae60; color:white; border:none; padding:3px 6px; border-radius:3px; font-size:12px; cursor:pointer;">項目追加</button>
            <button class="pnDevDelCatBtn" data-vidx="${vIdx}" data-cidx="${cIdx}" style="background:#c0392b; color:white; border:none; padding:3px 6px; border-radius:3px; font-size:12px; cursor:pointer; margin-left:5px;">削除</button>
          </div>
        </div>
        
        <div style="margin-bottom:10px;">
          <textarea class="pn-c-desc" data-vidx="${vIdx}" data-cidx="${cIdx}" style="width:100%; height:40px; background:#000; color:#ccc; border:1px solid #444; box-sizing:border-box; padding:4px; font-size:12px;" placeholder="カテゴリの説明（任意）">${cat.description || ''}</textarea>
        </div>

        <div class="pn-entries-list" data-vidx="${vIdx}" data-cidx="${cIdx}" style="display:flex; flex-direction:column; gap:8px;">
          <!-- エントリーがここに生成される -->
        </div>
      `;

      const entriesListDiv = catBox.querySelector('.pn-entries-list');
      this.renderEntries(cat.entries, vIdx, cIdx, entriesListDiv);

      container.appendChild(catBox);
    });

    this.bindCategoryEvents();
  }

  static renderEntries(entries, vIdx, cIdx, container) {
    if (!entries) return;

    entries.forEach((entry, eIdx) => {
      const entryBox = document.createElement('div');
      entryBox.style.cssText = "background:#111; border:1px solid #444; padding:10px; border-radius:4px; position:relative;";
      
      const isCard = entry.type === 'card';

      entryBox.innerHTML = `
        <button class="pnDevDelEntryBtn" data-vidx="${vIdx}" data-cidx="${cIdx}" data-eidx="${eIdx}" style="position:absolute; top:5px; right:5px; background:#c0392b; color:white; border:none; border-radius:3px; cursor:pointer; font-size:10px; padding:2px 5px;">X</button>
        
        <div style="display:flex; gap:10px; margin-bottom:5px;">
          <select class="pn-e-type" data-vidx="${vIdx}" data-cidx="${cIdx}" data-eidx="${eIdx}" style="background:#000; color:#ccc; border:1px solid #555; font-size:12px;">
            <option value="text" ${!isCard ? 'selected' : ''}>テキスト</option>
            <option value="card" ${isCard ? 'selected' : ''}>カード比較</option>
          </select>
          
          ${isCard ? `
            <input type="text" value="${entry.cardName || ''}" class="pn-e-cardname" data-vidx="${vIdx}" data-cidx="${cIdx}" data-eidx="${eIdx}" style="background:#000; color:#fff; border:1px solid #555; padding:2px; font-size:12px; flex:1;" placeholder="カード名">
          ` : ''}
        </div>

        ${isCard ? `
          <div style="display:flex; gap:10px; margin-bottom:5px;">
            <input type="text" value="${entry.beforeImage || ''}" class="pn-e-bimg" data-vidx="${vIdx}" data-cidx="${cIdx}" data-eidx="${eIdx}" style="background:#000; color:#ccc; border:1px solid #444; padding:2px; font-size:11px; flex:1;" placeholder="変更前画像パス">
            <input type="text" value="${entry.afterImage || ''}" class="pn-e-aimg" data-vidx="${vIdx}" data-cidx="${cIdx}" data-eidx="${eIdx}" style="background:#000; color:#ccc; border:1px solid #444; padding:2px; font-size:11px; flex:1;" placeholder="変更後画像パス">
          </div>
        ` : ''}

        <div>
          <textarea class="pn-e-comment" data-vidx="${vIdx}" data-cidx="${cIdx}" data-eidx="${eIdx}" style="width:100%; height:50px; background:#000; color:#fff; border:1px solid #555; box-sizing:border-box; padding:4px; font-size:12px;" placeholder="コメント（テキスト項目は本文）">${entry.comment || ''}</textarea>
        </div>
      `;

      container.appendChild(entryBox);
    });

    this.bindEntryEvents();
  }

  static bindGlobalEvents() {
    document.getElementById('pnDevSaveBtn').onclick = async () => {
      await PatchNotesStorage.save(this.data);
      alert('保存しました (ローカルプレビュー用)');
    };

    document.getElementById('pnDevDownloadBtn').onclick = () => {
      PatchNotesStorage.downloadJson(this.data, 'patchnotes.json');
    };

    document.getElementById('pnDevAddVersionBtn').onclick = () => {
      this.data.versions.unshift({
        version: "vX.Y.Z",
        date: new Date().toISOString().split('T')[0],
        categories: []
      });
      this.renderVersions();
    };
  }

  static bindVersionEvents() {
    document.querySelectorAll('.pn-v-num').forEach(input => {
      input.oninput = (e) => {
        const idx = e.target.dataset.vidx;
        this.data.versions[idx].version = e.target.value;
      };
    });

    document.querySelectorAll('.pn-v-date').forEach(input => {
      input.oninput = (e) => {
        const idx = e.target.dataset.vidx;
        this.data.versions[idx].date = e.target.value;
      };
    });

    document.querySelectorAll('.pnDevAddCatBtn').forEach(btn => {
      btn.onclick = (e) => {
        const vIdx = e.target.dataset.vidx;
        if (!this.data.versions[vIdx].categories) this.data.versions[vIdx].categories = [];
        this.data.versions[vIdx].categories.push({
          id: "new_cat_" + Date.now(),
          title: "新カテゴリ",
          notify: false,
          description: "",
          entries: []
        });
        this.renderVersions();
      };
    });

    document.querySelectorAll('.pnDevDelVersionBtn').forEach(btn => {
      btn.onclick = (e) => {
        const vIdx = e.target.dataset.vidx;
        if (confirm(`バージョン ${this.data.versions[vIdx].version} を削除しますか？`)) {
          this.data.versions.splice(vIdx, 1);
          this.renderVersions();
        }
      };
    });
  }

  static bindCategoryEvents() {
    document.querySelectorAll('.pn-c-title').forEach(input => {
      input.oninput = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        this.data.versions[vIdx].categories[cIdx].title = e.target.value;
      };
    });

    document.querySelectorAll('.pn-c-id').forEach(input => {
      input.oninput = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        this.data.versions[vIdx].categories[cIdx].id = e.target.value;
      };
    });

    document.querySelectorAll('.pn-c-notify').forEach(input => {
      input.onchange = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        this.data.versions[vIdx].categories[cIdx].notify = e.target.checked;
      };
    });

    document.querySelectorAll('.pn-c-desc').forEach(textarea => {
      textarea.oninput = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        this.data.versions[vIdx].categories[cIdx].description = e.target.value;
      };
    });

    document.querySelectorAll('.pnDevAddEntryBtn').forEach(btn => {
      btn.onclick = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        if (!this.data.versions[vIdx].categories[cIdx].entries) {
          this.data.versions[vIdx].categories[cIdx].entries = [];
        }
        this.data.versions[vIdx].categories[cIdx].entries.push({
          type: "text",
          comment: "新しい記述"
        });
        this.renderVersions();
      };
    });

    document.querySelectorAll('.pnDevDelCatBtn').forEach(btn => {
      btn.onclick = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        if (confirm(`カテゴリ ${this.data.versions[vIdx].categories[cIdx].title} を削除しますか？`)) {
          this.data.versions[vIdx].categories.splice(cIdx, 1);
          this.renderVersions();
        }
      };
    });
  }

  static bindEntryEvents() {
    document.querySelectorAll('.pn-e-type').forEach(select => {
      select.onchange = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        const eIdx = e.target.dataset.eidx;
        const type = e.target.value;
        const entry = this.data.versions[vIdx].categories[cIdx].entries[eIdx];
        
        entry.type = type;
        if (type === 'card') {
          entry.cardName = entry.cardName || "";
          entry.beforeImage = entry.beforeImage || "";
          entry.afterImage = entry.afterImage || "";
        }
        this.renderVersions();
      };
    });

    document.querySelectorAll('.pn-e-cardname').forEach(input => {
      input.oninput = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        const eIdx = e.target.dataset.eidx;
        this.data.versions[vIdx].categories[cIdx].entries[eIdx].cardName = e.target.value;
      };
    });

    document.querySelectorAll('.pn-e-bimg').forEach(input => {
      input.oninput = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        const eIdx = e.target.dataset.eidx;
        this.data.versions[vIdx].categories[cIdx].entries[eIdx].beforeImage = e.target.value;
      };
    });

    document.querySelectorAll('.pn-e-aimg').forEach(input => {
      input.oninput = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        const eIdx = e.target.dataset.eidx;
        this.data.versions[vIdx].categories[cIdx].entries[eIdx].afterImage = e.target.value;
      };
    });

    document.querySelectorAll('.pn-e-comment').forEach(textarea => {
      textarea.oninput = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        const eIdx = e.target.dataset.eidx;
        this.data.versions[vIdx].categories[cIdx].entries[eIdx].comment = e.target.value;
      };
    });

    document.querySelectorAll('.pnDevDelEntryBtn').forEach(btn => {
      btn.onclick = (e) => {
        const vIdx = e.target.dataset.vidx;
        const cIdx = e.target.dataset.cidx;
        const eIdx = e.target.dataset.eidx;
        this.data.versions[vIdx].categories[cIdx].entries.splice(eIdx, 1);
        this.renderVersions();
      };
    });
  }
}

// 既存互換用
window.openPatchNotesEditor = () => PatchNotesDev.init();
