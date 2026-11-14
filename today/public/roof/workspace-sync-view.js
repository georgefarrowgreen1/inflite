// Explicit account-owned cloud/local conflict choice. No hidden winner picking.
export function openWorkspaceSync(F, sync) {
  const owner=F.session.view?.user?.id, ui=F.ui;let ended=false,working=false,sheet,off=()=>{};
  const live=()=>!ended&&!F.signal.aborted&&F.session.view?.user?.id===owner;
  const words=ui.el("p",{role:"status"}),detail=ui.el("p",{text:"Workspace names, app selections and window layouts sync between your devices. App content and drafts stay with their apps."});
  const cloud=ui.btn("Use cloud workspaces",{run:()=>act(()=>sync.resolve("cloud"))}),local=ui.btn("Keep this device",{run:()=>act(()=>sync.resolve("local"))}),retry=ui.btn("Sync now",{run:()=>act(()=>sync.sync({manual:true}))});
  const review=ui.btn("Review saved layout",{run:()=>act(()=>sync.reviewSaved())});
  const choices=ui.el("div",{class:"ifs-acts"},local,cloud),body=ui.el("div",{class:"ifs-page"},words,detail,choices,review,retry);
  function paint(){if(!live())return;const status=sync.status();if(!status)return;words.textContent=status.message;const conflict=status.state==="conflict";review.hidden=!status.localConflict;review.disabled=working;choices.hidden=!conflict;cloud.disabled=working||!status.hasCloud;local.disabled=working;retry.hidden=conflict||status.localConflict;retry.disabled=working||status.state==="syncing";detail.textContent=conflict?"Keeping this device replaces the cloud layout. Using the cloud replaces this device’s layout. Neither choice changes app content, messages, files or drafts.":"Workspace names, app selections and window layouts sync between your devices. App content and drafts stay with their apps.";}
  async function act(run){if(!live()||working)return;working=true;paint();try{await run();}finally{working=false;paint();}}
  const close=()=>{if(ended)return;ended=true;off();F.signal.removeEventListener("abort",release);};
  const release=()=>{sheet?.close?.();close();};
  sheet=F.sheet.open({sheet:"workspace-sync",title:"Workspaces on Devices",body,onClose:close});off=sync.subscribe(paint);F.signal.addEventListener("abort",release,{once:true});paint();return sheet;
}
