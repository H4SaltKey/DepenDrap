function renderField(player){
  const area = document.getElementById("field");
  area.innerHTML = "";

  field.forEach(obj=>{
    if(!isVisible(obj.visibility, player)) return;

    const card = cards[obj.id];
    const el = document.createElement("img");

    el.src = card.image || "assets/404.png";
    el.onerror = () => { el.src = "assets/404.png"; };
    el.className = "card";
    el.style.left = obj.x + "px";
    el.style.top = obj.y + "px";

    makeDraggable(el, obj);

    area.appendChild(el);
  });
}

function isVisible(v, player){
  if(v === "both") return true;
  if(v === "none") return false;
  return v === player;
}