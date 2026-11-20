export function createFeedback(root){
 let timer=null,current=null;
 const stop=()=>{if(timer!==null){clearTimeout(timer);timer=null;}if(current?.deadline){current.remaining=Math.max(0,current.deadline-Date.now());current.deadline=0;}};
 const hide=()=>{stop();if(root.contains(document.activeElement))document.activeElement.blur();root.hidden=true;current=null;};
 const schedule=()=>{stop();if(!current||current.running||root.matches(':hover')||root.contains(document.activeElement))return;current.deadline=Date.now()+current.remaining;timer=setTimeout(hide,current.remaining);};
 const hostObserver=new MutationObserver(()=>{const host=root.parentElement;if(host?.tagName==='DIALOG'&&!host.open){hostObserver.disconnect();document.body.append(root);schedule();}});
 function show(message,undo,options={}){
  stop();const keepFocus=root.querySelector('#undoAction')===document.activeElement,retained=!undo&&current?.action&&!current.action.used?current.action:null,action=undo?{run:undo,label:options.actionLabel||'撤销',used:false}:retained;
  const host=document.querySelector('dialog[open]:not(#lightbox)')||document.body;hostObserver.disconnect();if(root.parentElement!==host)host.append(root);if(host.tagName==='DIALOG')hostObserver.observe(host,{attributes:true,attributeFilter:['open']});
  const item={action,error:!!options.error,remaining:action?12000:options.error?10000:4000,deadline:0,running:false};current=item;
  root.replaceChildren();root.dataset.kind=item.error?'error':'success';root.setAttribute('aria-live',item.error?'assertive':'polite');root.setAttribute('aria-atomic','true');
  const text=document.createElement('span');text.className='toast-message';text.textContent=message;root.append(text);
  if(action){const button=document.createElement('button');button.id='undoAction';button.textContent=retained?'撤销上次操作':action.label;button.onclick=async()=>{
   if(action.used||item.running)return;action.used=true;item.running=true;stop();button.disabled=true;button.textContent='正在撤销…';
   try{const result=await action.run();if(result===false||current!==item&&current?.error){action.used=false;show(current!==item&&current?.error?root.querySelector('.toast-message').textContent:'操作未完成，请重试',action.run,{error:true,actionLabel:'重试撤销'});}else if(current===item)show('操作已撤销');}
   catch(error){action.used=false;show('撤销失败：'+error.message,action.run,{error:true,actionLabel:'重试撤销'});}
  };root.append(button);}
  const close=document.createElement('button');close.id='dismissToast';close.type='button';close.setAttribute('aria-label','关闭提示');close.innerHTML='<svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 4 8 8m0-8-8 8"/></svg>';close.onclick=hide;root.append(close);root.hidden=false;if(retained&&keepFocus)root.querySelector('#undoAction').focus({preventScroll:true});schedule();
 }
 root.addEventListener('pointerenter',stop);root.addEventListener('pointerleave',schedule);root.addEventListener('focusin',stop);root.addEventListener('focusout',()=>queueMicrotask(schedule));
 return {show,hide};
}
