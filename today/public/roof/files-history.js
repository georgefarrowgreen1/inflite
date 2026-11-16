// Optional version and replacement controls, loaded only on explicit use.
export async function history(C,item){
 const {F,ui,service,active,sheet,refresh,errorText}=C;
const body=ui.el('div',{class:'ifx-form'},ui.el('p',{text:'Loading versions…'}));
    const handle=sheet({sheet:'file-history',title:'Version history',body});
    try{
      const answer=await service.run(item.key,'history',{current:()=>active()&&!handle.closed});if(!active()||handle.closed)return;
      body.replaceChildren(ui.el('p',{text:'Current file · '+new Date(answer.item.modifiedAt).toLocaleString()}),ui.el('p',{text:'Up to 20 earlier versions are kept. Their storage counts towards your drive limit.'}));
      if(!answer.versions.length)body.append(ui.el('p',{text:'Earlier versions appear when you replace this file.'}));
      for(const version of answer.versions){
        const row=ui.el('div',{class:'ifx-form'},ui.el('strong',{text:new Date(version.createdAt).toLocaleString()}));
        row.append(ui.el('a',{class:'ifl-btn',href:`/api/files/content?id=${encodeURIComponent(item.id)}&versionId=${encodeURIComponent(version.id)}`,download:item.name,text:'Download'}));
        row.append(ui.el('button',{type:'button',class:'ifl-btn',text:'Restore this version',on:{click:async()=>{
          handle.setBusy(true);try{await service.run(item.key,'restore-version',{input:{version:answer.item.version,versionId:version.id},current:()=>active()&&!handle.closed});if(active()&&!handle.closed){handle.now();refresh({reset:true});F.toast('Version restored. The previous file is kept in history.')}}catch(error){if(active()&&!handle.closed){handle.setBusy(false);F.toast(errorText(error))}}
        }}}));body.append(row);
      }
    }catch(error){if(active()&&!handle.closed)body.replaceChildren(ui.el('p',{role:'status',text:errorText(error)}))}
  }
export function replaceFile(C,item){
 const {F,ui,service,live,root,resource,errorText}=C;
    const input=ui.el('input',{type:'file',hidden:true,'aria-label':'Choose replacement file'});root.after(input);
    input.addEventListener('change',async()=>{const file=input.files[0];input.remove();if(!file||!resource(item))return;try{await service.upload([file],{folderId:item.parentId,replacement:{id:item.id,version:item.version},current:live});if(live())F.toast('Replacement kept. Your current file stays available until it finishes.')}catch(error){if(live())F.toast(errorText(error))}},{once:true});input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();
  }
