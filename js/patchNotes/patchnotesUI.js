/**
 * patchnotesUI.js
 * パッチノート描画制御 (プレーンJS版)
 */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("patchNotesContent");
  if (!container) return;

  // Loader がグローバルにあるか確認
  if (!window.PatchNotesLoader) {
    container.innerHTML = "<p style='color:red; text-align:center;'>エラー: Loaderが見つかりません。</p>";
    return;
  }

  container.innerHTML = "<p style='text-align:center; color:#aaa; font-size:14px;'>インデックスを読み込み中...</p>";

  // Indexをロード
  await window.PatchNotesLoader.loadIndex();
  const index = window.PatchNotesLoader.index;

  if (!index || !index.versions || index.versions.length === 0) {
    container.innerHTML = "<p style='color:#ccc; text-align:center;'>現在、公開されているパッチノートはありません。</p>";
    return;
  }

  // 公開されているバージョンのみをフィルタリング (status === "public")
  // ※インデックス管理の showPastVersions 設定がある場合は過去の public バージョンもすべてロード、
  // そうでない場合は最新の public バージョンのみロードする
  let versionsToLoad = index.versions.filter(v => v.status === "public");
  if (!index.showPastVersions && versionsToLoad.length > 0) {
    // 最新バージョンのみ
    versionsToLoad = [versionsToLoad[versionsToLoad.length - 1]];
  }

  // 順番を最新順（降順）に反転
  versionsToLoad.reverse();

  container.innerHTML = ""; // クリア

  for (const vIndexInfo of versionsToLoad) {
    const versionId = vIndexInfo.id;
    const vDiv = document.createElement("div");
    vDiv.style.cssText = "margin-bottom: 50px; padding: 25px; background: rgba(20,15,35,0.7); border: 1px solid rgba(199,179,119,0.3); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);";
    container.appendChild(vDiv);

    vDiv.innerHTML = `<p style='color:#aaa; font-size:13px; text-align:center; margin:10px 0;'>バージョン [${vIndexInfo.number}] データをロード中...</p>`;

    // バージョンの詳細ファイルをロード
    const vData = await window.PatchNotesLoader.loadVersion(versionId);
    if (!vData) {
      vDiv.innerHTML = `<p style='color:#ff6b6b; text-align:center;'>バージョン ${vIndexInfo.number} の読み込みに失敗しました。</p>`;
      continue;
    }

    // パッチノートを美しくレンダリング
    vDiv.innerHTML = `
      <div style="border-bottom: 2px solid rgba(199,179,119,0.4); padding-bottom: 15px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:10px;">
        <h2 style="color: #f0d080; margin: 0; font-size: 24px; font-weight:900; letter-spacing:1px;">Version ${vData.number || vIndexInfo.number}</h2>
        <span style="font-size: 14px; color: #c7b377; font-weight:bold;">リリース日: ${vData.date || vIndexInfo.date}</span>
      </div>
    `;

    // 🔔 新着通知バッジの表示
    const bellIcon = '<span style="background:rgba(231,76,60,0.2); border:1px solid #e74c3c; color:#e74c3c; font-size:10px; padding:2px 8px; border-radius:10px; font-weight:bold; margin-left:8px; letter-spacing:0.5px; vertical-align:middle;">UPDATE!</span>';

    // 1. カード調整項目の描画
    if (vData.cards && vData.cards.length > 0) {
      const cardsSec = document.createElement("div");
      cardsSec.style.cssText = "margin-bottom: 30px;";
      
      const cardsTitle = document.createElement("h3");
      cardsTitle.style.cssText = "color: #fff; font-size: 16px; margin: 20px 0 15px; border-left: 4px solid #c89b3c; padding-left: 10px; display:flex; align-items:center;";
      cardsTitle.innerHTML = `🎴 カード調整 ${vData.bellDot?.cards ? bellIcon : ''}`;
      cardsSec.appendChild(cardsTitle);

      const cardsGrid = document.createElement("div");
      cardsGrid.style.cssText = "display:flex; flex-direction:column; gap:15px;";

      vData.cards.forEach(card => {
        const itemBox = document.createElement("div");
        itemBox.style.cssText = "background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 15px; display:flex; flex-direction:column; gap:10px;";
        
        // バフ/デバフ/調整のバッジ
        const typeBadge = {
          buff: '<span style="background:rgba(39,174,96,0.15); border:1px solid #27ae60; color:#2ecc71; font-size:11px; padding:1px 8px; border-radius:4px; font-weight:bold;">バフ (Buff)</span>',
          debuff: '<span style="background:rgba(192,57,43,0.15); border:1px solid #c0392b; color:#e74c3c; font-size:11px; padding:1px 8px; border-radius:4px; font-weight:bold;">デバフ (Debuff)</span>',
          adjust: '<span style="background:rgba(241,196,15,0.15); border:1px solid #f1c40f; color:#f39c12; font-size:11px; padding:1px 8px; border-radius:4px; font-weight:bold;">調整 (Adjust)</span>',
          text: '<span style="background:rgba(142,68,173,0.15); border:1px solid #8e44ad; color:#9b59b6; font-size:11px; padding:1px 8px; border-radius:4px; font-weight:bold;">テキスト調整</span>'
        }[card.type || "adjust"];

        // 画像の変更前後の比較表示
        let imgHtml = "";
        if (card.beforeImg || card.afterImg) {
          const beforeImgSrc = card.beforeImg ? `assets/cards/${card.beforeImg}` : 'assets/System/404.png';
          const afterImgSrc = card.afterImg ? `assets/cards/${card.afterImg}` : 'assets/System/404.png';
          
          imgHtml = `
            <div style="display:flex; align-items:center; gap:15px; margin-top:5px; flex-wrap:wrap;">
              <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                <span style="font-size:10px; color:#888;">変更前</span>
                <img src="${beforeImgSrc}" style="width:90px; height:127px; object-fit:contain; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:#111;" onerror="this.src='assets/System/404.png'">
              </div>
              <div style="color:rgba(199,179,119,0.7); font-size:20px; font-weight:bold;">→</div>
              <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                <span style="font-size:10px; color:#888;">変更後</span>
                <img src="${afterImgSrc}" style="width:90px; height:127px; object-fit:contain; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:#111;" onerror="this.src='assets/System/404.png'">
              </div>
            </div>
          `;
        }

        itemBox.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <strong style="color:#fff; font-size:15px; font-weight:bold; letter-spacing:0.5px;">${card.name}</strong>
            ${typeBadge}
          </div>
          ${imgHtml}
          <div style="color:#ddd; line-height:1.6; font-size:13.5px; background:rgba(0,0,0,0.3); padding:10px 14px; border-left:3px solid rgba(199,179,119,0.8); border-radius:0 6px 6px 0; white-space:pre-wrap; font-family:inherit;">${card.comment}</div>
        `;
        
        cardsGrid.appendChild(itemBox);
      });
      cardsSec.appendChild(cardsGrid);
      vDiv.appendChild(cardsSec);
    }

    // 2. ゲームルール変更項目の描画
    if (vData.rules && vData.rules.length > 0) {
      const rulesSec = document.createElement("div");
      rulesSec.style.cssText = "margin-bottom: 10px;";

      const rulesTitle = document.createElement("h3");
      rulesTitle.style.cssText = "color: #fff; font-size: 16px; margin: 20px 0 15px; border-left: 4px solid #c89b3c; padding-left: 10px; display:flex; align-items:center;";
      rulesTitle.innerHTML = `📜 ルール変更 ${vData.bellDot?.rules ? bellIcon : ''}`;
      rulesSec.appendChild(rulesTitle);

      const rulesGrid = document.createElement("div");
      rulesGrid.style.cssText = "display:flex; flex-direction:column; gap:12px;";

      vData.rules.forEach(rule => {
        const itemBox = document.createElement("div");
        itemBox.style.cssText = "background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 15px; display:flex; flex-direction:column; gap:8px;";
        
        itemBox.innerHTML = `
          <strong style="color:#f0d080; font-size:14px; letter-spacing:0.5px;">▪ ${rule.title}</strong>
          <div style="color:#ccc; line-height:1.6; font-size:13px; white-space:pre-wrap; padding-left:12px;">${rule.text}</div>
        `;
        rulesGrid.appendChild(itemBox);
      });
      rulesSec.appendChild(rulesGrid);
      vDiv.appendChild(rulesSec);
    }
  }

  // Lucideアイコンの再適用（もし存在すれば）
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons({ scope: container });
  }
});
