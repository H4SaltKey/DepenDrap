/**
 * patchnotesRenderer.js
 * HTML描画専用
 */

import { PatchNotesStorage } from './patchnotesStorage.js';

export class PatchNotesRenderer {
  static async render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const data = await PatchNotesStorage.load();
    if (!data || !data.versions || data.versions.length === 0) {
      container.innerHTML = "<p style='color:white; text-align:center;'>パッチノートがありません。</p>";
      return;
    }

    container.innerHTML = ""; // Clear

    // 表示対象は「最新バージョンのみ」 (for patchnotes.html)
    // 過去バージョンは dev.html で確認可能
    // ここでは最新（配列の先頭）を表示
    const latestVersion = data.versions[0]; 

    if (latestVersion) {
      const section = this.createVersionSection(latestVersion);
      container.appendChild(section);
    }

    if (window.lucide) {
      window.lucide.createIcons({ scope: container });
    }
  }

  static createVersionSection(vData) {
    const wrapper = document.createElement("div");
    wrapper.className = "patch-version-wrapper";
    wrapper.style.cssText = "margin-bottom: 40px; padding: 20px; background: rgba(18, 18, 28, 0.9); border: 1px solid #444; border-radius: 8px;";

    // Header
    const header = document.createElement("div");
    header.innerHTML = `
      <h2 style="color: #f0d080; border-bottom: 2px solid #555; padding-bottom: 10px; margin-top: 0;">
        Version ${vData.version} <span style="font-size:14px; color:#aaa; margin-left:10px;">(${vData.date})</span>
      </h2>
    `;
    wrapper.appendChild(header);

    // TOC
    if (vData.categories && vData.categories.length > 0) {
      const toc = document.createElement("div");
      toc.style.cssText = "background: rgba(0,0,0,0.4); padding: 10px 15px; border-radius: 6px; margin-bottom: 20px; display: inline-block;";
      let tocHtml = "<strong style='color:#ccc; display:block; margin-bottom:5px;'>目次</strong><ul style='margin:0; padding-left:20px; color:#f0d080;'>";
      
      const bellIcon = '<i data-lucide="bell-dot" width="16" height="16" style="vertical-align:text-bottom; color:#e74c3c; margin-left:6px;"></i>';

      vData.categories.forEach(cat => {
        const bd = cat.notify ? bellIcon : '';
        tocHtml += `<li><a href="#cat-${cat.id}" style="color:#f0d080; text-decoration:none;">${cat.title}${bd}</a></li>`;
      });
      tocHtml += "</ul>";
      toc.innerHTML = tocHtml;
      
      // Smooth scroll
      toc.querySelectorAll("a").forEach(a => {
        a.onclick = (e) => {
          e.preventDefault();
          const targetId = a.getAttribute("href").substring(1);
          const targetEl = document.getElementById(targetId);
          if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      });
      
      wrapper.appendChild(toc);

      // Categories
      vData.categories.forEach(cat => {
        const catSec = document.createElement("div");
        catSec.id = `cat-${cat.id}`;
        catSec.style.cssText = "margin-bottom: 30px;";
        catSec.innerHTML = `<h3 style="color: #fff; margin-bottom:15px; border-left: 4px solid #c89b3c; padding-left:10px;">${cat.title}</h3>`;
        
        if (cat.description) {
          const desc = document.createElement("p");
          desc.style.cssText = "color:#ccc; font-size:14px; margin-bottom:15px;";
          desc.textContent = cat.description;
          catSec.appendChild(desc);
        }

        const entriesDiv = document.createElement("div");
        entriesDiv.style.cssText = "display:flex; flex-direction:column; gap:15px;";

        if (cat.entries) {
          cat.entries.forEach(entry => {
            const entryBox = document.createElement("div");
            entryBox.style.cssText = "background: rgba(0,0,0,0.6); border: 1px solid #333; border-radius: 8px; padding: 15px;";
            
            if (entry.type === "card") {
              const imgBefore = entry.beforeImage ? `<img src="${entry.beforeImage}" style="width:100px; height:auto; border-radius:4px; border:1px solid #555;" onerror="this.src='assets/404.png'">` : '<div style="width:100px; height:140px; border:1px dashed #555; display:flex; align-items:center; justify-content:center; color:#555; font-size:12px;">No Image</div>';
              const imgAfter = entry.afterImage ? `<img src="${entry.afterImage}" style="width:100px; height:auto; border-radius:4px; border:1px solid #555;" onerror="this.src='assets/404.png'">` : '<div style="width:100px; height:140px; border:1px dashed #555; display:flex; align-items:center; justify-content:center; color:#555; font-size:12px;">No Image</div>';

              entryBox.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                  <strong style="color:white; font-size:16px;">${entry.cardName}</strong>
                </div>
                <div style="display:flex; gap:20px; align-items:center; margin-bottom:15px; overflow-x:auto;">
                  ${imgBefore}
                  <i data-lucide="arrow-right" style="color:#aaa;"></i>
                  ${imgAfter}
                </div>
                <div style="color:#ddd; line-height:1.5; font-size:14px; background:#111; padding:10px; border-left:3px solid #c89b3c;">
                  ${entry.comment.replace(/\n/g, '<br>')}
                </div>
              `;
            } else {
              entryBox.innerHTML = `
                <div style="color:#ccc; line-height:1.6; font-size:14px; white-space: pre-wrap;">${entry.comment}</div>
              `;
            }
            entriesDiv.appendChild(entryBox);
          });
        }

        catSec.appendChild(entriesDiv);
        wrapper.appendChild(catSec);
      });
    }

    return wrapper;
  }
}
