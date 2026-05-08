let dragged = null;

function makeDraggable(el, obj){
  el.onmousedown = (e)=>{
    dragged = {el, obj};
  };
}

document.onmousemove = (e)=>{
  if(!dragged) return;

  dragged.obj.x = e.pageX;
  dragged.obj.y = e.pageY;

  dragged.el.style.left = dragged.obj.x + "px";
  dragged.el.style.top = dragged.obj.y + "px";
};

document.onmouseup = ()=>{
  dragged = null;
};