// Account-owned input, with no document snapshots or persistent gesture state.
export function launcherInput(host,{signal,menu,reorder,current=()=>true}) {
  const ac=new AbortController(),opts={signal:ac.signal};let press=null,suppress=null,timer=0;
  const target=e=>e.target.closest?.('[data-launcher-app],[data-launcher-favourite]');
  const valid=b=>current()&&host.isConnected&&host.contains(b)&&b.getClientRects().length>0&&!b.disabled;
  function reset(){clearTimeout(timer);for(const n of host.querySelectorAll('.wsl-favourites,.ws-dock-apps'))stopOrder(n);press?.button.removeAttribute('data-dragging');for(const n of host.querySelectorAll('[data-drop]'))n.removeAttribute('data-drop');press=null}
  host.addEventListener('pointerdown',e=>{
    reset();const b=target(e);if(!b||!valid(b)||e.button||e.isPrimary===false)return;
    press={button:b,x:e.clientX,y:e.clientY,id:e.pointerId,to:b.dataset.launcherFavourite};
    if(b.dataset.launcherFavourite){b.setPointerCapture?.(e.pointerId);e.preventDefault();b.dataset.dragging='true'}
    else timer=setTimeout(()=>{if(press?.button===b&&valid(b)){suppress={button:b,until:Date.now()+900};reset();menu?.(b.dataset.launcherApp,b)}},520);
  },opts);
  host.addEventListener('pointermove',e=>{
    if(!press||press.id!==e.pointerId)return;
    const distance=Math.hypot(e.clientX-press.x,e.clientY-press.y);
    if(!press.button.dataset.launcherFavourite){if(distance>9)reset();return}
    if(distance>4){e.preventDefault();const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-launcher-favourite]');for(const n of host.querySelectorAll('[data-drop]'))n.removeAttribute('data-drop');press.to=b&&valid(b)?b.dataset.launcherFavourite:null;if(b&&press.to)b.dataset.drop='true'}
  },opts);
  host.addEventListener('pointerup',e=>{if(!press||e.pointerId!==press.id)return;const p=press;reset();if(p.button.dataset.launcherFavourite&&valid(p.button)){suppress={button:p.button,until:Date.now()+900};if(p.to)reorder?.(p.button.dataset.launcherFavourite,p.to)}},opts);
  host.addEventListener('click',e=>{const b=target(e);if(suppress?.button===b&&Date.now()<suppress.until){e.preventDefault();e.stopImmediatePropagation();suppress=null}}, {...opts,capture:true});
  host.addEventListener('contextmenu',e=>{const b=target(e);if(!b?.dataset.launcherApp||!valid(b))return;e.preventDefault();reset();menu?.(b.dataset.launcherApp,b)},opts);
  host.addEventListener('keydown',e=>{const b=target(e);if(!b||!valid(b))return;if(e.key==='F10'&&e.shiftKey||e.key==='ContextMenu'){e.preventDefault();menu?.(b.dataset.launcherApp,b)}else if(b.dataset.launcherFavourite&&/^Arrow(Left|Right|Up|Down)$/.test(e.key)){e.preventDefault();const items=[...host.querySelectorAll('[data-launcher-favourite]')],i=items.indexOf(b),next=items[i+(/Left|Up/.test(e.key)?-1:1)];if(next)reorder?.(b.dataset.launcherFavourite,next.dataset.launcherFavourite)}},opts);
  for(const type of ['pointercancel','lostpointercapture'])host.addEventListener(type,reset,opts);
  for(const type of ['blur','resize'])globalThis.addEventListener(type,reset,opts);
  document.addEventListener('visibilitychange',reset,opts);
  const destroy=()=>{reset();suppress=null;ac.abort();signal?.removeEventListener('abort',destroy)};
  signal?.addEventListener('abort',destroy,{once:true});if(signal?.aborted)destroy();return destroy;
}
const orderMotions=new WeakMap();
export function stopOrder(host){for(const a of orderMotions.get(host)||[])a.cancel();orderMotions.delete(host)}
export function animateOrder(host,change){
  const key=n=>n.dataset.launcherFavourite||n.dataset.launcherApp;
  const before=new Map([...host.children].map(n=>[key(n),n.getBoundingClientRect()]));stopOrder(host);change();
  if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const motions=[];orderMotions.set(host,motions);
  for(const n of host.children){const old=before.get(key(n)),now=n.getBoundingClientRect();if(!old||!n.animate||!old.width||!now.width)continue;const x=old.x-now.x,y=old.y-now.y;if(Math.abs(x)+Math.abs(y)<1)continue;
    try{const a=n.animate([{transform:`translate(${x}px,${y}px)`},{transform:'none'}],{duration:320,easing:'cubic-bezier(.22,1,.36,1)'});motions.push(a);a.finished.catch(()=>{})}catch(_){}
  }
  Promise.allSettled(motions.map(a=>a.finished)).then(()=>{if(orderMotions.get(host)===motions)orderMotions.delete(host)});
}
