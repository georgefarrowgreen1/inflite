// Loaded by Today only when a rider can request live route forecasts.
export async function compareDepartures(F,{body,session,sheet,planEvent,send,controller,owner,current}){
 const {el,btn}=F.ui;
 const status=el('p',{role:'status',text:'Loading the saved route forecast…'});
 const section=el('section',{class:'ride-departures'},el('h3',{text:'Compare departure times'}),status);
 body.prepend(section);
 const minutes=Math.round(session.secs/60);
 const url='/api/fitness/routes/departures'+(Number.isSafeInteger(minutes)&&minutes>0?'?minutes='+minutes:'');
 try{
  const response=await send(url,{credentials:'same-origin',cache:'no-store',headers:{'X-Inflite-Route-Owner':owner},signal:AbortSignal.any([controller.signal,F.signal,AbortSignal.timeout(15000)])});
  if(!response.ok)throw Error('The route forecast is unavailable.');
  const data=await response.json();
  if(!current())return;
  if(data.state!=='ready'||!data.departures?.length){
   status.textContent=({ 'no-route':'Choose a saved route in Fitness to compare times.', 'outside-forecast':'There are no available departure times for the planned day.', 'forecast-unavailable':'The route forecast is unavailable.' })[data.state]||'No departure times are available.';
   return;
  }
  const format=new Intl.DateTimeFormat(undefined,{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:data.timezone,timeZoneName:'short'});
  const choices=data.departures.filter(choice=>Number.isFinite(choice.start)&&Number.isFinite(choice.end)&&choice.end>choice.start).slice(0,4);
  if(!choices.length)throw Error('The route forecast is unavailable.');
  status.textContent=`${data.route} · ${data.duration} min · Forecast at four route points`;
  const field=el('fieldset',{class:'ride-times'},el('legend',{class:'vh',text:'Departure time'}));
  let selected=choices.find(option=>option.planned)||choices[0];
  for(const option of choices){
   const input=el('input',{type:'radio',name:'ride-departure',checked:option===selected});
   input.addEventListener('change',()=>{selected=option});
   const rain=Number.isFinite(option.rainChance)?`Rain chance up to ${option.rainChance}%`:'Rain chance unavailable';
   const wind=Number.isFinite(option.gust)?`Gusts up to ${Math.round(option.gust)}\u00a0km/h`:'Gust forecast unavailable';
   const conditions=el('span',{},el('strong',{text:format.format(option.start)+(option.planned?' · Planned time':'')}),el('small',{text:`${rain} · ${wind}`}));
   if(option.daylight===false)conditions.append(el('small',{text:'Some of the route may be after dark'}));
   if(option.forecastPartial)conditions.append(el('small',{text:'Some route forecasts are unavailable'}));
   for(const warning of option.warnings||[]){conditions.append(el('small',{class:'ride-warning',text:[warning.event,warning.issuer].filter(Boolean).join(' · ')}));}
   field.append(el('label',{class:'ride-time'},input,conditions));
  }
  section.append(field,el('p',{class:'ride-warning-summary',text:data.warningCoverage==='complete'?'Official warnings checked at the route points.':'Official warnings coverage is limited along this route.'}));
  if(planEvent&&F.session.apps?.calendar){
   const action=btn('Review in Calendar',{primary:true,run:async()=>{
    if(!current()||action.disabled)return;
    const choice=selected;action.disabled=true;
    try{
     const title=session.name||data.route;
     const opened=await planEvent({title,description:`Route: ${data.route}. Departure time selected using InFlite Ride Overview.`,start:choice.start,end:choice.end,timezone:data.timezone},current);
     if(opened&&!sheet.closed)sheet.now();
     else if(current()&&!opened)F.toast('Calendar could not open.');
    }catch(error){if(current())F.toast(error.message||'Calendar could not open.');}
    finally{if(current())action.disabled=false;}
   }});
   section.append(action);
  }
 }catch(error){if(current())status.textContent=error.name==='TimeoutError'?'The route forecast timed out. Open Ride Overview to try again.':'The route forecast is unavailable.';}
}
