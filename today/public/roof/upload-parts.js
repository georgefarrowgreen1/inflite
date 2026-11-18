// Compare server-confirmed chunks with the durable local file before resuming.
export function sendParts(request, query, file, onProgress, lease, wholeFile) {
  const send = () => transfer(request, query, file, onProgress, lease, wholeFile);
  // Reopened tabs can discover the same durable upload at the same time.
  return globalThis.navigator?.locks ? navigator.locks.request('inflite:drive:' + (query.id || query.uploadId),
    lease.signal ? {signal:lease.signal} : {}, send) : send();
}
async function transfer(request, query, file, onProgress, lease, wholeFile) {
  const endpoint = 'upload-parts';
  let status;
  try {
    status = await request(endpoint, {query, ...lease});
  } catch (error) {
    // Older account Workers return this exact response for an unknown route.
    if (error.status === 404 && error.message === 'Not found.' && wholeFile) return wholeFile();
    throw error;
  }
  if (status.item) return status;
  const { partSize, parts } = status;
  if (partSize !== 1024 * 1024 || !parts || typeof parts !== 'object') throw Error('Unexpected upload checkpoints.');
  for (let start = 0; start < file.size; start += partSize) {
    const part = start / partSize, blob = file.slice(start, start + partSize);
    if (lease.signal?.aborted || lease.current?.() === false) throw new DOMException('Released','AbortError');
    if (parts[part]) {
      const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const hex = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
      if (hex !== parts[part]) throw Error('The saved upload contains a different file.');
    } else {
      const result = await request(endpoint, {...lease, method:'PUT', query:{...query, part}, body:blob});
      if (result.item) return result;
    }
    onProgress(Math.min(1, (start + blob.size) / file.size));
  }
  return request(endpoint, {...lease, method:'POST',query,body:{}});
}

// This picker and the Files app both subscribe to the owner's one transfer queue.
export function addPickerUploads(F, service, { controls, list, folder, current, maxBytes, multiple, signal }) {
  const {el,btn} = F.ui;
  const pick = el('input', {type:'file', hidden:true, multiple});
  const rows = el('div', {class:'ifd-transfers', 'aria-label':'Drive uploads'});
  const upload = btn('Upload to Drive', {small:true, run:()=>pick.click()});
  controls.append(upload,pick); list.before(rows);
  pick.addEventListener('change', async () => {
    const files = [...pick.files]; pick.value = '';
    if (!files.length || !current()) return;
    if (files.reduce((sum, f) => sum + f.size, 0) > maxBytes) return F.toast('These files exceed the attachment size limit.');
    try { await service.upload(files, {folderId:folder(),current}); }
    catch (e) { if(current()) F.toast(e.message); }
  });
  const draw = () => {
    if (!current()) return;
    rows.replaceChildren(...service.transfers().filter(t=>!['done','cancelled'].includes(t.status)).map(t=>{
      const row = el('div',{class:'ifd-entry'},el('span',{},el('b',{text:t.name}),el('small',{text:t.label})));
      if (t.status === 'uploading') row.append(el('progress',{max:1,value:t.progress,'aria-label':t.name}));
      if (t.status === 'failed') row.append(btn('Review',{small:true,run:()=>service.recovery()}));
      return row;
    }));
  };
  draw();
  const off = service.subscribe(change => { if(change.kind === 'transfers') draw(); });
  signal.addEventListener('abort',off,{once:true});
}
