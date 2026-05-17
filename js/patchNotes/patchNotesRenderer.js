window.PatchNotesRenderer = {
  render: async function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    await window.PatchNotesLoader.loadIndex();
    if (!window.PatchNotesLoader.index) {
      container.innerHTML = "<p style='color:white;'>パッチノートの読み込みに失敗しました。</p>";
      return;
    }

    const { index } = window.PatchNotesLoader;
    let versionsToLoad = [];

    if (index.showPastVersions) {
      // 過去バージョンもすべて表示 (publicのみ)
      versionsToLoad = window.PatchNotesLoader.getAllPublicVersionIds().reverse(); // 最新を上に
    } else {
      // 最新のみ表示
      const latestId = window.PatchNotesLoader.getLatestPublicVersionId();
      if (latestId) versionsToLoad.push(latestId);
    }

    if (versionsToLoad.length === 0) {
      container.innerHTML = "<p style='color:white;'>公開されているパッチノートがありません。</p>";
      return;
    }

    container.innerHTML = ""; // clear

    for (const vid of versionsToLoad) {
      const vData = await window.PatchNotesLoader.loadVersion(vid);
      if (vData) {
        const section = this.createVersionSection(vData);
        container.appendChild(section);
      }
    }

    if (window.lucide) {
      window.lucide.createIcons({ scope: container });
    }
  },

  createVersionSection: function(vData) {
    const wrapper = document.createElement("div");
    wrapper.className = "patch-version-wrapper";
    wrapper.style.cssText = "margin-bottom: 40px; padding: 20px; background: rgba(18, 18, 28, 0.9); border: 1px solid #444; border-radius: 8px;";

    // Header
    const header = document.createElement("div");
    header.innerHTML = \`
      <h2 style="color: #f0d080; border-bottom: 2px solid #555; padding-bottom: 10px; margin-top: 0;">
        Version \${vData.number} <span style="font-size:14px; color:#aaa; margin-left:10px;">(\${vData.date})</span>
      </h2>
    \`;
    wrapper.appendChild(header);

    // TOC
    const hasCards = vData.cards && vData.cards.length > 0;
    const hasRules = vData.rules && vData.rules.length > 0;
    
    if (hasCards || hasRules) {
      const toc = document.createElement("div");
      toc.style.cssText = "background: rgba(0,0,0,0.4); padding: 10px 15px; border-radius: 6px; margin-bottom: 20px; display: inline-block;";
      let tocHtml = "<strong style='color:#ccc; display:block; margin-bottom:5px;'>目次</strong><ul style='margin:0; padding-left:20px; color:#f0d080;'>";
      
      const bellIcon = '<i data-lucide="bell-dot" width="16" height="16" style="vertical-align:text-bottom; color:#e74c3c; margin-left:6px;"></i>';

      if (hasCards) {
        const bd = (vData.bellDot && vData.bellDot.cards) ? bellIcon : '';
        tocHtml += \`<li><a href="#\${vData.id}-cards" style="color:#f0d080; text-decoration:none;">カード調整\${bd}</a></li>\`;
      }
      if (hasRules) {
        const bd = (vData.bellDot && vData.bellDot.rules) ? bellIcon : '';
        tocHtml += \`<li><a href="#\${vData.id}-rules" style="color:#f0d080; text-decoration:none;">ゲームルールの変更\${bd}</a></li>\`;
      }
      tocHtml += "</ul>";
      toc.innerHTML = tocHtml;
      
      // Smooth scroll for TOC links
      toc.querySelectorAll("a").forEach(a => {
        a.onclick = (e) => {
          e.preventDefault();
          const targetId = a.getAttribute("href").substring(1);
          const targetEl = document.getElementById(targetId);
          if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      });
      
      wrapper.appendChild(toc);
    }

    // Cards
    if (hasCards) {
      const cardsSec = document.createElement("div");
      cardsSec.id = \`\${vData.id}-cards\`;
      cardsSec.style.cssText = "margin-bottom: 30px;";
      cardsSec.innerHTML = \`<h3 style="color: #fff; margin-bottom:15px; border-left: 4px solid #c89b3c; padding-left:10px;">カード調整</h3>\`;
      
      const grid = document.createElement("div");
      grid.style.cssText = "display:flex; flex-direction:column; gap:20px;";
      
      vData.cards.forEach(c => {
        const typeColors = {
          buff: "#2ecc71",
          debuff: "#e74c3c",
          adjust: "#f39c12",
          text: "#3498db"
        };
        const typeLabels = {
          buff: "Buff",
          debuff: "Nerf",
          adjust: "調整",
          text: "テキスト修正"
        };
        const color = typeColors[c.type] || "#aaa";
        const label = typeLabels[c.type] || c.type;
        
        const cardBox = document.createElement("div");
        cardBox.style.cssText = "background: rgba(0,0,0,0.6); border: 1px solid #333; border-radius: 8px; padding: 15px;";
        
        const imgBefore = c.beforeImg ? \`<img src="\${c.beforeImg}" style="width:100px; height:auto; border-radius:4px; border:1px solid #555;" onerror="this.src='assets/404.png'">\` : '<div style="width:100px; height:140px; border:1px dashed #555; display:flex; align-items:center; justify-content:center; color:#555; font-size:12px;">No Image</div>';
        const imgAfter = c.afterImg ? \`<img src="\${c.afterImg}" style="width:100px; height:auto; border-radius:4px; border:1px solid #555;" onerror="this.src='assets/404.png'">\` : '<div style="width:100px; height:140px; border:1px dashed #555; display:flex; align-items:center; justify-content:center; color:#555; font-size:12px;">No Image</div>';

        cardBox.innerHTML = \`
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
            <span style="background:\${color}; color:#000; font-weight:bold; font-size:12px; padding:2px 8px; border-radius:12px;">\${label}</span>
            <strong style="color:white; font-size:16px;">\${c.name}</strong>
          </div>
          <div style="display:flex; gap:20px; align-items:center; margin-bottom:15px; overflow-x:auto;">
            \${imgBefore}
            <i data-lucide="arrow-right" style="color:#aaa;"></i>
            \${imgAfter}
          </div>
          <div style="color:#ddd; line-height:1.5; font-size:14px; background:#111; padding:10px; border-left:3px solid \${color};">
            \${c.comment.replace(/\\n/g, '<br>')}
          </div>
        \`;
        grid.appendChild(cardBox);
      });
      cardsSec.appendChild(grid);
      wrapper.appendChild(cardsSec);
    }

    // Rules
    if (hasRules) {
      const rulesSec = document.createElement("div");
      rulesSec.id = \`\${vData.id}-rules\`;
      rulesSec.innerHTML = \`<h3 style="color: #fff; margin-bottom:15px; border-left: 4px solid #c89b3c; padding-left:10px;">ゲームルールの変更</h3>\`;
      
      const list = document.createElement("div");
      list.style.cssText = "display:flex; flex-direction:column; gap:15px;";
      
      vData.rules.forEach(r => {
        const rBox = document.createElement("div");
        rBox.style.cssText = "background: rgba(0,0,0,0.6); border: 1px solid #333; border-radius: 8px; padding: 15px;";
        rBox.innerHTML = \`
          <strong style="color:#f0d080; display:block; margin-bottom:8px; font-size:15px;">\${r.title}</strong>
          <div style="color:#ccc; line-height:1.6; font-size:14px; white-space: pre-wrap;">\${r.text}</div>
        \`;
        list.appendChild(rBox);
      });
      rulesSec.appendChild(list);
      wrapper.appendChild(rulesSec);
    }

    return wrapper;
  }
};
