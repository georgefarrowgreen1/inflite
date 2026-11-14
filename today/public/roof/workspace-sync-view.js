// Explicit account-owned cloud/local conflict choice. No hidden winner picking.
export function openWorkspaceSync(F, sync) {
  const owner=F.session.view?.user?.id, ui=F.ui;let ended=false,working=false,sheet,off=()=>{};
  const live=()=>!!owner&&!ended&&!F.signal.aborted&&F.session.view?.user?.id===owner;
  if(!live())return;
  const words=ui.el("small",{role:"status"}),detail=ui.el("small");
  const statusRow=ui.el("div",{class:"ifl-row"},ui.el("span",{class:"ifl-lead ic"},ui.icon("swap")),ui.el("span",{class:"ifl-tx"},ui.el("b",{text:"Workspace sync"}),words));
  const cloud=ui.btn("Use cloud workspaces",{run:()=>act(()=>sync.resolve("cloud"))}),local=ui.btn("Keep this device",{run:()=>act(()=>sync.resolve("local"))}),retry=ui.btn("Sync now",{run:()=>act(()=>sync.sync({manual:true}))});
  const review=ui.btn("Review saved layout",{run:()=>act(()=>sync.reviewSaved())});
  const choices=ui.el("div",{class:"ifs-page",role:"group","aria-label":"Resolve workspace conflict"},local,cloud),body=ui.el("div",{class:"ifs-page"},ui.list([statusRow,ui.el("div",{class:"ifl-row"},ui.el("span",{class:"ifl-tx"},detail))]),choices,review,retry);
  function paint(){if(!live())return release();const status=sync.status();if(!status)return;words.textContent=status.message;const conflict=status.state==="conflict";review.hidden=!status.localConflict;review.disabled=working;choices.hidden=!conflict;cloud.disabled=working||!status.hasCloud;local.disabled=working;retry.hidden=conflict||status.localConflict;retry.disabled=working||status.state==="syncing";detail.textContent=conflict?"Keeping this device replaces the cloud layout. Using the cloud replaces this device’s layout. Neither choice changes app content, messages, files or drafts.":"Only names, app selections and window layouts sync. App content and drafts stay with their apps.";}
  async function act(run){if(!live()||working)return;working=true;paint();try{await run();}catch{if(live())F.toast?.("Sync couldn’t finish. Try again.");}finally{working=false;paint();}}
  const close=()=>{if(ended)return;ended=true;off();F.signal.removeEventListener("abort",release);};
  const release=()=>{sheet?.close?.();close();};
  sheet=F.sheet.open({sheet:"workspace-sync",title:"Workspaces on Devices",body,onClose:close});off=sync.subscribe(paint);F.signal.addEventListener("abort",release,{once:true});paint();return sheet;
}
