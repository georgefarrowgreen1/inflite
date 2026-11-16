// One contextual view, using Today's real account summaries. The native apps
// remain authoritative for selecting routes and viewing full forecasts.
export function openRideOverview(F,cards){
 const ui=F.ui,fitness=cards.fitness,weather=cards.weather,session=fitness?.session;
 if(!session||fitness.kind!=='session')return F.toast('Open Fitness to choose your next ride.');
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
 sheet=F.sheet.open({sheet:'ride-overview',title:'Your ride and forecast',body});
}
