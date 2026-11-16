// Explicit, account-scoped viewer. Only the current image/page is held in memory.
import {loadStyles} from './modules.js';
export async function openViewer(F,{item,items=[],service,sheet,current}){
 await loadStyles('/roof/files-viewer350.css');if(!current()||F.signal.aborted)return;
 const ui=F.ui,el=ui.el,status=el('p',{role:'status'}),stage=el('div',{class:'fv350-stage'}),controls=el('div',{class:'fv350-controls'}),body=el('div',{class:'fv350'},status,stage,controls);
 const gallery=item.mime==='application/pdf'?[item]:items.length?items:[item];let index=Math.max(0,gallery.findIndex(x=>x.key===item.key)),gen=0,controller=null,url=null,pdf=null,loading=null,render=null,page=1,zoom=1,dead=false;
 const live=()=>!dead&&!h.closed&&!F.signal.aborted&&current();
 function release(){controller?.abort();controller=null;render?.cancel();render=null;pdf=null;const task=loading;loading=null;Promise.resolve(task?.destroy?.()).catch(()=>{});if(url)URL.revokeObjectURL(url);url=null;stage.replaceChildren()}
 const h=sheet({sheet:'files-viewer',title:item.name,body,onClose(){dead=true;gen++;release();F.signal.removeEventListener('abort',close)}});if(!h)return;const close=()=>h.now();F.signal.addEventListener('abort',close,{once:true});
 const button=(label,run)=>ui.btn(label,{small:true,run:()=>Promise.resolve(run()).catch(e=>{if(live())status.textContent=e.message||'This preview could not open.'})});
 async function drawPDF(){
  const mine=++gen;render?.cancel();stage.replaceChildren();status.textContent='Rendering page '+page+'…';
  const source=await pdf.getPage(page);if(!live()||mine!==gen)return;
  const natural=source.getViewport({scale:1}),width=Math.max(240,Math.min(stage.clientWidth||800,1200)),scale=Math.min(width/natural.width*zoom,Math.sqrt(4000000/(natural.width*natural.height))),viewport=source.getViewport({scale});
  const canvas=el('canvas',{'aria-label':'PDF page '+page});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);stage.append(canvas);
  render=source.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport});await render.promise;if(!live()||mine!==gen)return;render=null;source.cleanup();status.textContent='Page '+page+' of '+pdf.numPages;paintControls();
 }
 function paintControls(){controls.replaceChildren();if(pdf){const prev=button('Previous page',()=>{page--;return drawPDF()}),next=button('Next page',()=>{page++;return drawPDF()});prev.disabled=page<=1;next.disabled=page>=pdf.numPages;controls.append(prev,next)}else if(gallery.length>1){const prev=button('Previous image',()=>load(index-1)),next=button('Next image',()=>load(index+1));prev.disabled=index<=0;next.disabled=index>=gallery.length-1;controls.append(prev,next)}
  controls.append(button('Zoom out',()=>{zoom=Math.max(1,zoom-.25);return pdf?drawPDF():imageZoom()}),button('Zoom in',()=>{zoom=Math.min(3,zoom+.25);return pdf?drawPDF():imageZoom()}));
 }
 function imageZoom(){const image=stage.querySelector('img');if(image){image.style.width=(zoom*100)+'%';image.style.maxWidth=zoom===1?'100%':'none'}}
 async function load(next){
  if(!live()||next<0||next>=gallery.length)return;index=next;zoom=1;page=1;release();const mine=++gen,selected=gallery[index];controller=new AbortController();status.textContent='Opening '+selected.name+'…';controls.replaceChildren();
  try{const answer=await service.run(selected.key,'preview',{input:{version:selected.version},signal:controller.signal,current:()=>live()&&mine===gen});if(!live()||mine!==gen)return;if(!answer?.ok||!(answer.blob instanceof Blob))throw Error(answer?.error||'Preview unavailable.');
   if(selected.mime==='application/pdf'){
    const engine=await import('./vendor/pdfjs/pdf.mjs');if(!live()||mine!==gen)return;engine.GlobalWorkerOptions.workerSrc='/roof/vendor/pdfjs/pdf.worker.mjs';
    loading=engine.getDocument({data:new Uint8Array(await answer.blob.arrayBuffer()),isEvalSupported:false,enableXfa:false,useWasm:false,disableFontFace:true,useWorkerFetch:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,maxImageSize:4000000});
    loading.onPassword=(setPassword)=>{if(!live())return;const input=el('input',{type:'password','aria-label':'PDF password',autocomplete:'off'});const prompt=sheet({sheet:'pdf-password',title:'PDF password',body:input,acts:[{label:'Open',primary:true,run:()=>{setPassword(input.value);input.value='';prompt.now()}}]});};
    const doc=await loading.promise;if(!live()||mine!==gen){return}pdf=doc;return drawPDF();
   }
   url=URL.createObjectURL(answer.blob);const image=el('img',{src:url,alt:selected.name,decoding:'async'});image.addEventListener('error',()=>{if(live())status.textContent='This image could not be decoded. Download it to open it.'},{once:true});stage.append(image);status.textContent=selected.name+(gallery.length>1?' · '+(index+1)+' of '+gallery.length:'');paintControls();
  }catch(e){if(live()&&mine===gen){release();status.textContent=e.message||'This preview could not open. Download the file to open it.';controls.append(button('Retry',()=>load(index)))}}
 }
 let start=null;stage.addEventListener('pointerdown',e=>{if(zoom===1&&!pdf)start={x:e.clientX,y:e.clientY}});stage.addEventListener('pointerup',e=>{if(start&&Math.abs(e.clientY-start.y)<40&&Math.abs(e.clientX-start.x)>70)load(index+(e.clientX<start.x?1:-1));start=null});stage.addEventListener('pointercancel',()=>{start=null});
 body.addEventListener('keydown',e=>{if(!live()||e.target.matches('input,textarea'))return;if(!pdf&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();load(index+(e.key==='ArrowLeft'?-1:1))}});load(index);return h;
}
