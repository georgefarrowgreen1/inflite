// Only application IDs are stored. Account content and app searches stay in memory.
export const LAUNCHER_APPS = Object.freeze(['calendar','notes','people','files','fitness','weather','markets','chats','mail','atlas']);
export const DEFAULT_FAVOURITES = Object.freeze(['calendar','files','chats','mail']);
export function normaliseFavourites(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter(id => LAUNCHER_APPS.includes(id)))].slice(0,4);
}
export function initialFavourites(value, available) {
  return normaliseFavourites(value) ?? [...DEFAULT_FAVOURITES,'weather','fitness','markets','notes','people'].filter(id=>available(id)).slice(0,4);
}
export function toggleFavourite(value,id) {
  const current=normaliseFavourites(value)||[];
  if (!LAUNCHER_APPS.includes(id)) return {items:current,full:false};
  return current.includes(id)?{items:current.filter(item=>item!==id),full:false}:current.length<4?{items:[...current,id],full:false}:{items:current,full:true};
}
export function moveFavourite(value,id,target) {
  const items=normaliseFavourites(value)||[],from=items.indexOf(id),to=items.indexOf(target);
  if(from<0||to<0||from===to)return items;
  items.splice(from,1);items.splice(to,0,id);return items;
}
// Providers own these facts. Unknown, locked and signed-out apps have no badge.
export function launcherStatus(snapshot) {
  if(!snapshot||snapshot.status!=='ready')return null;
  const a=snapshot.availability||{},unread=snapshot.unread;
  if(a.error===true)return {label:'Needs attention',text:'!',kind:'error'};
  if(a.saving===true)return {label:'Saving changes',text:'',kind:'saving'};
  if(a.draft===true)return {label:'Draft kept',text:'',kind:'draft'};
  if(Number.isSafeInteger(a.pending)&&a.pending>0)return {label:'Changes waiting to sync',text:'',kind:'pending'};
  return Number.isSafeInteger(unread)&&unread>0?{label:unread+' unread',text:unread>99?'99+':String(unread),kind:'unread'}:null;
}
