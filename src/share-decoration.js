// Procedural artwork: no bundled reference images or remote requests.
export function drawPaper(context,width,height,layout){
  if(layout==='light'){
    const wash=context.createLinearGradient(0,0,width*.7,Math.min(height,640));
    wash.addColorStop(0,'#f4ebec');wash.addColorStop(.48,'#f4f1ee');wash.addColorStop(1,'#eaf2f3');
    context.fillStyle=wash;context.fillRect(0,0,width,height);
  }
  if(!['memo','journal','excerpt'].includes(layout))return;
  // A fixed seed keeps the same preview and exported bitmap pixel-identical.
  let seed=2147;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<width*height/5;i++){
    context.fillStyle=random()>.5?'rgba(94,77,43,.035)':'rgba(255,255,255,.3)';
    context.fillRect(random()*width,random()*height,random()*.8+.2,.5);
  }
}

export function drawBorder(context,rect,origin,side,style){
  const size=parseFloat(style['border'+side+'Width']),kind=style['border'+side+'Style'];
  if(!size||kind==='none'||kind==='hidden')return;
  const x=rect.left-origin.left,y=rect.top-origin.top,w=rect.width,h=rect.height;
  const horizontal=side==='Top'||side==='Bottom',edge=side==='Bottom'?y+h-size:side==='Right'?x+w-size:horizontal?y:x;
  const stripe=(offset,thickness)=>{context.fillStyle=style['border'+side+'Color'];if(horizontal)context.fillRect(x,edge+offset,w,thickness);else context.fillRect(edge+offset,y,thickness,h);};
  if(kind==='double'&&size>=3){stripe(0,size/3);stripe(size*2/3,size/3);return;}
  if(kind==='dashed'||kind==='dotted'){
    context.save();context.strokeStyle=style['border'+side+'Color'];context.lineWidth=size;
    context.setLineDash(kind==='dotted'?[size,size*2]:[size*4,size*3]);context.beginPath();
    if(horizontal){context.moveTo(x,edge+size/2);context.lineTo(x+w,edge+size/2);}else{context.moveTo(edge+size/2,y);context.lineTo(edge+size/2,y+h);}
    context.stroke();context.restore();return;
  }
  stripe(0,size);
}

export function drawFlower(context,rect,origin){
  const x=rect.left-origin.left+rect.width/2,y=rect.top-origin.top+18;
  context.save();context.strokeStyle='#46534a';context.lineWidth=1.3;
  context.beginPath();context.moveTo(x,y+9);context.lineTo(x,y+28);context.stroke();
  context.fillStyle='#60b38e';
  for(let n=0;n<6;n++){const angle=n*Math.PI/3;context.beginPath();context.arc(x+Math.cos(angle)*7,y+Math.sin(angle)*7,5,0,Math.PI*2);context.fill();context.stroke();}
  context.fillStyle='#fff8df';context.beginPath();context.arc(x,y,4,0,Math.PI*2);context.fill();context.stroke();context.restore();
}

export function drawTicket(context,rect,origin){
  // Decorative bars carry no encoded note content or identifiers.
  context.save();context.fillStyle='#555';
  let x=rect.left-origin.left;
  const end=x+rect.width,y=rect.top-origin.top;
  for(let n=0;x<end;n++){
    const width=[1,1,2,1,3,1,2,2,1,1,3][n%11];
    context.fillRect(x,y,Math.min(width,end-x),rect.height);x+=width+(n%3===0?2:1);
  }
  context.restore();
}

export function cutTicketEdges(context,width,height){
  context.save();context.globalCompositeOperation='destination-out';
  for(let x=10;x<width;x+=23){
    for(const y of [0,height]){context.beginPath();context.arc(x,y,6,0,Math.PI*2);context.fill();}
  }
  context.restore();
}
