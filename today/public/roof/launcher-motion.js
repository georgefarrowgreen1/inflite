// Geometry only: native snapshots never enter storage or cloned application DOM.
// The dock keeps its own View Transition name and stays outside fallback transforms.
export function captureLauncherOrigin(opener) {
  const node=opener?.querySelector?.('.ws-dock-symbol,.ifl-appic')||opener;
  if(!node?.getBoundingClientRect)return null;
  const r=node.getBoundingClientRect();
  return r.width>0&&r.height>0?{x:r.x,y:r.y,width:r.width,height:r.height,vw:innerWidth,vh:innerHeight}:null;
}
export function normaliseLauncherOrigin(value,width,height) {
  if(!value||![value.x,value.y,value.width,value.height,value.vw,value.vh,width,height].every(Number.isFinite)||value.width<1||value.height<1||value.vw<1||value.vh<1||width<1||height<1)return null;
  const w=Math.min(width,Math.max(1,value.width*width/value.vw)),h=Math.min(height,Math.max(1,value.height*height/value.vh));
  return {x:Math.max(0,Math.min(width-w,value.x*width/value.vw)),y:Math.max(0,Math.min(height-h,value.y*height/value.vh)),width:w,height:h};
}
const owners=new WeakMap();
export function launcherTransition({kind,origin,change,target=origin?.target,current,doc=document}) {
  const html=doc.documentElement,closing=kind==='launch-return',token={};let gone=false,vt=null,timer=0,animations=[];
  const apply=()=>{if(!gone&&current())return change()};
  const point=()=>{
    const p=normaliseLauncherOrigin(target?.()||origin,innerWidth,innerHeight);if(!p)return false;
    html.style.setProperty('--ifl-launch-from',`translate(${p.x}px,${p.y}px) scale(${p.width/innerWidth},${p.height/innerHeight})`);
    html.style.setProperty('--ifl-launch-radius',`${12*innerWidth/p.width}px / ${12*innerHeight/p.height}px`);return true;
  };
  const clear=()=>{clearTimeout(timer);if(owners.get(html)!==token)return;owners.delete(html);delete html.dataset.vt;for(const key of ['--ifl-launch-from','--ifl-launch-radius'])html.style.removeProperty(key)};
  const stop=finish=>{if(gone)return;if(finish)apply();gone=true;try{vt?.skipTransition()}catch(_){}for(const a of animations)a.cancel();clear()};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||doc.hidden){apply();return stop}
  const liveWallpaper = 'midnightLava' in html.dataset;
  if(!liveWallpaper && !point()){apply();clear();return stop}
  owners.set(html,token);html.dataset.vt=kind;
  // A document snapshot briefly replaces the live wallpaper during a launch.
  // With Midnight Lava, animate only the incoming screen over the existing canvas.
  if(typeof doc.startViewTransition==='function' && !liveWallpaper){
    try{vt=doc.startViewTransition(()=>{const result=apply();if(current())point();return result})}catch(_){clear();apply();return stop}
    for(const name of ['ready','updateCallbackDone'])vt[name]?.catch?.(()=>{});
    vt.finished.then(()=>{apply();clear()},()=>{apply();clear()});timer=setTimeout(()=>stop(true),1600);return stop;
  }
  // Keep the same route lifecycle with a smaller, screen-local origin zoom.
  // No wrapper, reparenting, bitmap clone, animated blur or page-sized layout writes.
  const node=apply();if(!node?.animate){clear();return stop}
  try{
    if (liveWallpaper) {
      // The Today and Files headers share their route's root. Animate its content
      // so the header and dock are already settled when the first frame appears.
      const content = node.id === 'workspace' ? node.querySelector('.ws-canvas') || node : node;
      const from = closing ? 'translateY(-3px)' : 'translateY(6px)';
      animations.push(content.animate([
        {opacity: .95, transform: from},
        {opacity: 1, transform: 'none'}
      ], {duration: closing ? 180 : 220, easing: 'cubic-bezier(.2,.8,.2,1)'}));
    } else {
      const p=normaliseLauncherOrigin(origin,innerWidth,innerHeight),r=node.getBoundingClientRect(),ox=p.x+p.width/2-r.left,oy=p.y+p.height/2-r.top;
      animations.push(node.animate([{opacity:.65,transform:'scale(.94)',transformOrigin:`${ox}px ${oy}px`},{opacity:1,transform:'none',transformOrigin:`${ox}px ${oy}px`}],{duration:closing?280:420,easing:'cubic-bezier(.2,.85,.22,1)'}));
    }
    Promise.allSettled(animations.map(a=>a.finished)).then(clear);timer=setTimeout(clear,700);
  }catch(_){clear()}
  return stop;
}
