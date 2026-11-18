const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

test('time suggestions need an explicit, unambiguous request and preserve wall time and duration', async () => {
  const { proposedTime } = await import('../email/src/time-change.js');
  const { moveTime } = await import('../today/public/organise/mail-calendar.js');
  const msg = {id:'one', folder:'inbox', snippet:'Hi George. Can we make it 9:30 instead? Thanks.'};
  assert.deepEqual(proposedTime(msg), {time:'09:30', evidence:'Can we make it 9:30 instead?', messageId:'one'});
  for (const suffix of [' Tomorrow.', ' Or 10:30?', ' GMT.', ' Not sure.']) {
    assert.equal(proposedTime({...msg,snippet:msg.snippet+suffix}), null);
  }
  assert.equal(proposedTime({...msg,folder:'sent'}), null);
  const start = Date.parse('2027-06-01T07:00:00Z');
  const event = {start, end:start+2700000, timezone:'Europe/London'};
  const moved = moveTime(event,'09:30');
  assert.equal(new Date(moved.start).toISOString(),'2027-06-01T08:30:00.000Z');
  assert.equal(moved.end-moved.start,event.end-start);
  assert.equal(moveTime({...event,allDay:true},'09:30'),null);
  const transition = Date.parse('2027-03-28T08:00:00Z');
  assert.equal(moveTime({...event,start:transition,end:transition+2700000},'01:30'),null);
});

test('attachment search returns files from the named sender, and inbox follow-ups can be dismissed', async () => {
  const sql = new DatabaseSync(':memory:');
  const query = (q,args=[]) => ({
    bind:(...values)=>query(q,values),
    first:async()=>sql.prepare(q).get(...args) || null,
    all:async()=>({results:sql.prepare(q).all(...args)}),
    run:async()=>({meta:{changes:sql.prepare(q).run(...args).changes}})
  });
  const env = {DB:{prepare:query,batch:async rows=>Promise.all(rows.map(row=>row.all()))}};
  try {
    const {ensureSchema} = await import('../email/src/db.js');
    const {listThreads,getThread,threadAction} = await import('../email/src/threads.js');
    const {dueFollowups} = await import('../email/src/followups.js');
    await ensureSchema(env);
    const message = sql.prepare('INSERT INTO messages(id,folder,thread_id,date,from_name,subject,snippet,has_attachments) VALUES(?,?,?,?,?,?,?,1)');
    const file = sql.prepare('INSERT INTO attachments(id,message_id,filename,disposition,content_id) VALUES(?,?,?,?,?)');
    for (const [id,folder,sender,name,inline] of [
      ['1','inbox','Reuben','Coast.gpx'],['2','archive','Reuben','Map.pdf'],['3','inbox','Jo','Wrong.fit'],
      ['4','trash','Reuben','Old.tcx'],['5','inbox','Reuben','Hidden.kml',true],['6','sent','Reuben','Sent.fit']
    ]) {
      message.run(id,folder,'t'+id,Number(id),sender,'Club ride','Can we make it 09:30 instead?');
      file.run('a'+id,id,name,inline?'inline':'attachment',inline?'content-id':null);
    }
    const search = q => listThreads(env,new URL('https://mail.test/?q='+encodeURIComponent(q)));
    assert.deepEqual((await search('the route Reuben sent')).threads.map(t=>[t.id,t.matchedFiles[0].filename]),[['t1','Coast.gpx']]);
    assert.equal((await search('pdf from Reuben')).threads[0].matchedFiles[0].filename,'Map.pdf');
    assert.equal((await search('the route Reuben sent in:trash')).threads[0].matchedFiles[0].filename,'Old.tcx');
    assert.ok((await getThread(env,'t1')).timeChange);
    await threadAction(env,'t1',{action:'dismiss-time',messageId:'1'});
    assert.equal((await getThread(env,'t1')).timeChange,null);
    sql.prepare('INSERT INTO mail_followups(thread_id,message_id,due) VALUES(?,?,?)').run('t6','6',Date.now()-100);
    assert.equal((await dueFollowups(env,true)).length,1);
    assert.equal((await dueFollowups(env,true)).length,0);
    const people = () => listThreads(env,new URL('https://mail.test/?category=people'));
    assert.equal((await people()).followups[0].thread_id,'t6');
    await threadAction(env,'t6',{action:'cancel-followup',messageId:'stale'});
    assert.ok((await getThread(env,'t6')).reminder);
    await threadAction(env,'t6',{action:'cancel-followup',messageId:'6'});
    assert.equal((await people()).followups,undefined);
    // Exercise the actual composer draft/send contract and inbound reply transaction.
    const {default:worker} = await import('../email/src/index.js');
    const objects = new Map(), background = [], deliveries = [];
    const ctx = {waitUntil: promise => background.push(promise)};
    const drain = async () => { while (background.length) await background.shift(); };
    Object.assign(env, {
      DOMAIN:'inflite.ai', DEFAULT_FROM:'hello@inflite.ai', ACCOUNT_ORIGIN:'https://account.test', HUB_KEY:'fixture',
      MAIL:{
        put:async (k,v)=>objects.set(k,v),
        get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,
        delete:async keys=>[].concat(keys).forEach(k=>objects.delete(k))
      },
      EMAIL:{send:async message=>{ deliveries.push(message); return {messageId:'outbound@inflite.ai'}; }}
    });
    const savedFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => Response.json({signedIn:true,admin:true,passkey:true,fresh:true,handle:'fixture'});
      const post = async (path,body,expected = 200) => {
        const res = await worker.fetch(new Request('https://email.inflite.ai/api/'+path,{
          method:'POST',headers:{Origin:'https://email.inflite.ai',Cookie:'account=abcdefghijklmnopqrstuvwxyz',
          'X-Inflite':'1','Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(body)
        }),env,ctx);
        const value = await res.json();
        assert.equal(res.status,expected,JSON.stringify(value));
        return value;
      };
      const due = Date.now()+86400000;
      const draft = await post('drafts',{to:[{email:'reuben@example.com'}],text:'Please confirm by Friday.',subject:'Saturday ride',followUpAt:due});
      const sent = await post('send',{draftId:draft.id,key:'reminder-test-001'});
      await drain();
      assert.equal(deliveries.length,1);
      assert.equal(deliveries[0].text,'Please confirm by Friday.');
      assert.match(deliveries[0].html, /src="https:\/\/inflite\.ai\/icon-192\.png"/);
      assert.equal(JSON.parse(objects.get('body/'+sent.id+'.json')).html,deliveries[0].html);
      const scheduled = sql.prepare('SELECT * FROM mail_followups WHERE message_id=?').get(sent.id);
      assert.equal(scheduled.due,due);
      const raw = ['From: Reuben <reuben@example.com>','To: hello@inflite.ai','Subject: Re: Saturday ride',
        'Message-ID: <answer@example.com>','In-Reply-To: <outbound@inflite.ai>','References: <outbound@inflite.ai>','','Confirmed.'].join('\r\n');
      await worker.email({from:'reuben@example.com',to:'hello@inflite.ai',raw,rawSize:raw.length,
        setReject:reason=>assert.fail(reason),forward:async()=>{}},env,ctx);
      await drain();
      assert.equal(sql.prepare('SELECT count(*) AS n FROM messages WHERE thread_id=?').get(scheduled.thread_id).n,2);
      assert.equal(sql.prepare('SELECT * FROM mail_followups WHERE message_id=?').get(sent.id),undefined);

      // Two clients reconnecting at once must share the same expired send claim.
      const started = Promise.withResolvers(), release = Promise.withResolvers();
      const retry = {to:[{email:'recipient@example.com'}], subject:'Retry fixture', text:'Local fixture', key:'retry-fixture-002'};
      sql.prepare('INSERT INTO sends(key,at) VALUES(?,?)').run(retry.key,0);
      env.EMAIL.send = async message => { deliveries.push(message); started.resolve(); await release.promise; return {messageId:'retry@example.com'}; };
      const first = post('send',retry);
      await started.promise;
      try { await post('send',retry,503); } finally { release.resolve(); }
      const completed = await first;
      assert.equal((await post('send',retry)).id,completed.id);
      assert.equal(deliveries.length,2);
      await drain();
    } finally { globalThis.fetch = savedFetch; }
  } finally { sql.close(); }
});

test('Signature styles the sender’s own sign-off once above quoted history', async () => {
  const {signedMessage,withQuote} = await import('../email/src/quote.js');
  const identity = {name:'George Farrow-Green',from:'hello@inflite.ai',signature:'Cheers & thanks,\nGeorge'};
  const words = 'See you Saturday!\n\n'+identity.signature;
  const authored = signedMessage(words,identity);
  const quote = {header:'Reuben wrote:',text:'Morning?',html:'<p>Morning?</p>'};
  const result = withQuote(words,quote,authored);
  assert.equal(result.text,words+'\n\nReuben wrote:\n\n> Morning?');
  assert.equal(result.html.split('Cheers &amp; thanks,').length,2);
  assert.match(result.html, /<strong>Cheers &amp; thanks,<br>George<\/strong>/);
  assert.ok(result.html.indexOf('George Farrow-Green · InFlite') < result.html.indexOf('Reuben wrote:'));
  assert.equal(result.html.includes('<h1'),false);
  const edited = signedMessage('See you!\n\nGeorge',identity);
  assert.equal(edited.includes('See you!<br><br>George'),false);
  assert.match(edited, /<strong>George<\/strong>/);
  const legacy = withQuote('Reply',quote);
  const formatted = signedMessage(legacy.text,identity,legacy.html);
  assert.ok(formatted.indexOf('<table') < formatted.indexOf('Reuben wrote:'));
  const rich = signedMessage('',identity,'<html><body><p><b>Hello</b></p></body></html>');
  assert.match(rich, /<b>Hello<\/b>/);
  assert.ok(rich.indexOf('</table>') < rich.indexOf('</body>'));
  const alias = signedMessage('Hello',{name:'A < B',from:'team@inflite.ai'});
  assert.match(alias, /A &lt; B · InFlite/);
  assert.match(signedMessage('Hello',{from:'team@inflite.ai'}), /team@inflite.ai/);
});

test('draft recovery preserves server attachments, current edits and a newer local copy', async t => {
  const {createOutbox} = await import('../email/public/roof/outbox.js');
  const data = new Map();
  t.mock.method(globalThis, 'setInterval', () => 0);
  const previous = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    get length(){return data.size}, key:i=>[...data.keys()][i],
    setItem:(k,v)=>data.set(k,v), getItem:k=>data.get(k)??null, removeItem:k=>data.delete(k),
  }});
  t.after(() => previous ? Object.defineProperty(globalThis,'localStorage',previous) : delete globalThis.localStorage);
  const saves = [], firstSave = Promise.withResolvers(), release = Promise.withResolvers();
  const api = {
    draft:async id => ({compose:{files:[{i:0,filename:'fixture.txt'}]}}),
    saveDraft:async draft => {
      saves.push(draft);
      if (saves.length===1) { firstSave.resolve(); await release.promise; }
      return {id:'one'};
    },
  };
  const box = createOutbox({api,fw:{},store:{set(){}}});
  t.after(()=>box.destroy());
  let text = 'first', draftId = null;
  const snapshots = [];
  const untrack = box.track(()=>({text,draftId,files:[]}), (id,snapshot)=>{ draftId=id; snapshots.push(snapshot.text); });
  const first = box.flush({draftsOnly:true});
  await firstSave.promise;
  text = 'edited during save';
  const final = box.flush();
  release.resolve();
  assert.deepEqual(await Promise.all([first,final]),[{lost:0},{lost:0}]);
  assert.deepEqual(snapshots,['first','edited during save']);
  assert.equal(saves[1].id,'one');
  untrack();
  box.keepUnsent({cc:[{email:'cc@example.com'}],draftId:'one'});
  const started = Promise.withResolvers(), confirmed = Promise.withResolvers();
  api.saveDraft = async draft => { saves.push(draft); started.resolve(); await confirmed.promise; return {id:'one'}; };
  const recovering = box.flush();
  await started.promise;
  box.keepUnsent({text:'newer local draft'});
  confirmed.resolve();
  assert.deepEqual(await recovering,{lost:0});
  assert.deepEqual(saves[2].attachments,[{i:0}]);
  assert.equal(box.unsent().text,'newer local draft');

  // A mounted tab finishing its flush must leave another tab's queued message intact.
  const remote = [{key:'other-tab',at:9,draft:{text:'Queued in a different tab'}}];
  data.set('mail:outbox',JSON.stringify(remote));
  await box.flush({draftsOnly:true});
  assert.deepEqual(JSON.parse(data.get('mail:outbox')),remote);
});

test('a calendar series ends on the last retained occurrence across clock changes and exceptions', async () => {
  const {expand,lastOf,parseRule} = await import('../email/src/repeat.js');
  const wall = {y:2026,mo:3,d:1,hh:9,mi:30,ss:0};
  for (const zone of ['Europe/London','America/New_York','Pacific/Auckland']) {
    for (const rule of ['FREQ=WEEKLY;COUNT=12','FREQ=DAILY;UNTIL=20260402T083000Z','FREQ=MONTHLY;COUNT=4;BYDAY=-1SU']) {
      const r = parseRule(rule);
      const series = expand(r,{wall,zone});
      const ex = [series.at(-1).start,series.at(-2).day];
      for (const rd of [[],[Date.UTC(2026,11,1)]]) {
        const expected = expand(r,{wall,zone,ex,rd}).at(-1)?.start ?? null;
        assert.equal(lastOf(r,{wall,zone,ex,rd}),expected,zone+' '+rule);
      }
    }
  }
});
