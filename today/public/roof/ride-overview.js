// One contextual view, using Today's real account summaries. The native apps
// remain authoritative for selecting routes and viewing full forecasts.
import {hasRideOverview} from "../cards.js";
export function openRideOverview(F,cards,{planEvent,send=fetch}={}){
 const ui=F.ui,fitness=cards.fitness,weather=cards.weather,session=fitness?.session;
 if(!hasRideOverview(fitness))return F.toast('Open Fitness to choose your next ride.');
 const body=ui.el('div',{class:'ride-overview'}),ride=ui.el('section',{},ui.el('h3',{text:session.name||'Planned ride'}));
 if(session.secs)ride.append(ui.el('p',{text:Math.round(session.secs/60)+' min'+(session.kind?' · '+session.kind:'')}));
 if(session.why)ride.append(ui.el('p',{text:session.why}));
 const forecast=ui.el('section',{},ui.el('h3',{text:weather?.place?.name||'Weather'}));
 const best=fitness.best;
 if(best?.said)forecast.append(ui.el('strong',{text:best.said}));
 if(best?.sub)forecast.append(ui.el('p',{text:best.sub}));
 if(best?.start||best?.at){const time=new Date(best.start||best.at);if(Number.isFinite(time.getTime()))forecast.append(ui.el('p',{text:'Suggested start · '+time.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}))}
 const summary=weather?.summary||weather?.said||weather?.now?.summary||weather?.now?.condition;
 forecast.append(ui.el('p',{text:typeof summary==='string'?summary:'Open Weather for the latest conditions and hourly forecast.'}));
 let sheet;const go=path=>{sheet.now();F.nav.go(path)};
 ride.append(ui.btn('Open planned ride',{run:()=>go(typeof fitness.href==='string'&&/^\/fitness\/(?:#[\w=-]+)?$/.test(fitness.href)?fitness.href:'/fitness/')}),ui.btn('Choose a route',{run:()=>go('/fitness/#routes')}));
 forecast.append(ui.btn('Open forecast',{run:()=>go('/weather/')}));body.append(ride,forecast);
 const controller=new AbortController(),owner=F.session.view?.user?.id,origin=F.route;
 sheet=F.sheet.open({sheet:'ride-overview',title:'Your ride and forecast',body,onClose:()=>controller.abort()});
 const current=()=>!sheet.closed&&!controller.signal.aborted&&!F.signal.aborted&&F.session.view?.user?.id===owner&&F.route===origin;
 // Comparing departures needs a current forecast. Keep the planned ride available offline.
 if(owner&&F.session.apps?.fitness){
  const unavailable=text=>{if(current())body.prepend(ui.el('p',{role:'status',text}));};
  if(navigator.onLine===false)unavailable('Connect to compare departure times.');
  else void import('../ride-departures.js')
   .then(({compareDepartures})=>{if(current())return compareDepartures(F,{body,session,sheet,planEvent,send,controller,owner,current});})
   .catch(()=>unavailable('The route forecast is unavailable.'));
 }
 return sheet;
}
