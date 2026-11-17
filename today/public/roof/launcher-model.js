// Only application IDs are stored. Account content and app searches stay in memory.
export const LAUNCHER_APPS = Object.freeze(['calendar','notes','people','files','fitness','weather','markets','chats','mail']);
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
