function showNotification(text, color) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%);
    z-index: 9999; pointer-events: none; text-align: center;
    font-family: 'Outfit', sans-serif; white-space: nowrap;
  `;
  div.innerHTML = `
    <h2 style="
      font-size: 60px; font-weight: 900; color: ${color}; margin: 0;
      letter-spacing: 15px; text-transform: uppercase;
      animation: notifyIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards,
                 notifyOut 0.5s 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      text-shadow: 0 0 20px ${color}66;
    ">${text}</h2>
  `;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2500);
}

function showRoundNotification(round) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; inset: 0; z-index: 10000; pointer-events: none;
    display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle, rgba(199,179,119,0.15) 0%, rgba(0,0,0,0.8) 70%);
    animation: roundFadeIn 0.6s ease-out forwards, roundFadeOut 0.6s 2.4s ease-in forwards;
  `;
  
  const subtitleHtml = round === 1 ? `
      <div style="
        margin-top: 30px; font-size: 20px; font-weight: 600; color: #e0d0a0;
        letter-spacing: 4px; opacity: 0.8;
        animation: roundSubtitleSlide 0.8s 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transform: translateY(-30px); opacity: 0;
      ">新たな戦いが始まる</div>
  ` : "";
  
  div.innerHTML = `
    <div style="text-align: center; animation: roundContentScale 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
      <div style="
        font-size: 28px; font-weight: 700; color: #c7b377; letter-spacing: 8px;
        text-transform: uppercase; margin-bottom: 20px; opacity: 0.9;
        animation: roundSubtitleSlide 0.8s 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transform: translateY(30px); opacity: 0;
      ">ROUND</div>
      <div style="
        font-size: 140px; font-weight: 900; color: #fff;
        letter-spacing: 20px; line-height: 1;
        text-shadow: 0 0 40px rgba(199,179,119,0.6), 0 0 80px rgba(199,179,119,0.4),
                     0 10px 30px rgba(0,0,0,0.8);
        animation: roundNumberPulse 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transform: scale(0.5); opacity: 0;
      ">${round}</div>${subtitleHtml}
    </div>
  `;
  
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

