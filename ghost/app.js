/* Ghost — clean up the past. Find where you're exposed, wipe it, track it.
   Rule: the app PREPARES every action; you fire it. Nothing sends without you. */
(()=>{
const { el, esc, Nav, Screen, BigBtn, toast, sheet, confirmSheet, copy, ago } = UI;

/* ---------- helpers ---------- */
const S = ()=>Vault.state;
function brokerStatus(id){ return S().ghost.brokers[id]||'todo'; }
function acctStatus(id){ return S().ghost.accounts[id]||'todo'; }
function counts(){
  const bDone = DATA_BROKERS.filter(b=>brokerStatus(b.id)==='done').length;
  const bSent = DATA_BROKERS.filter(b=>brokerStatus(b.id)==='sent').length;
  const aDone = DELETE_ACCOUNTS.filter(a=>acctStatus(a.id)==='done').length;
  const aNa   = DELETE_ACCOUNTS.filter(a=>acctStatus(a.id)==='na').length;   // "no account" = handled
  const aHandled = aDone + aNa;
  const uDone = S().ghost.unsubs.filter(u=>u.status==='done').length;
  const total = DATA_BROKERS.length + DELETE_ACCOUNTS.length;
  const done = bDone + aHandled;
  return { bDone, bSent, aDone, aNa, uDone, total, done,
    bLeft: DATA_BROKERS.length-bDone, aLeft: DELETE_ACCOUNTS.length-aHandled,
    pct: Math.round(100*done/total) };
}
function dot(status){ return `<span class="dot ${status==='done'?'done':status==='sent'?'pending':''}"></span>`; }

/* ---------- HOME ---------- */
function renderHome(){
  const c = counts();
  const scr = Screen('Ghost', [], {back:false});
  const sw = el(`<button class="switch">Lock ›</button>`);
  sw.onclick = ()=>{ location.href = '../lock/'; };
  scr.querySelector('.bar').appendChild(sw);
  const body = scr.lastElementChild;

  body.appendChild(el(`
    <div style="text-align:center;margin:10px 0 18px">
      <div class="glyph">${EMBLEMS.ghost}</div>
      <p class="huge count">${c.done}<span style="color:var(--dim)"> / ${c.total}</span></p>
      <p class="sub">exposure points closed. ${c.total-c.done} remaining.</p>
    </div>`));

  body.appendChild(BigBtn({title:'Get me off data-seller sites',
    sub:'Sites that sell your name, address & number',
    badge:String(c.bLeft), onClick:()=>Nav.go(renderBrokers)}));

  body.appendChild(BigBtn({title:'Delete my old accounts',
    sub:'Unused profiles are open doors', badge:String(c.aLeft), onClick:()=>Nav.go(renderAccounts)}));

  body.appendChild(BigBtn({title:'Stop junk email',
    sub:'Unsubscribe and make it stick',
    badge:String(S().ghost.unsubs.filter(u=>u.status!=='done').length), onClick:()=>Nav.go(renderUnsubs)}));

  const pendingScan = (S().ghost.scan?.senders||[]).filter(x=>x.status==='todo').length;
  body.appendChild(BigBtn({title:'Scan my inbox for junk',
    sub:'Reads headers only — you approve every send',
    badge: pendingScan ? String(pendingScan) : '', onClick:()=>Nav.go(renderInbox)}));

  body.appendChild(BigBtn({title:'Was I leaked?',
    sub:'Check passwords & emails against known breaches', onClick:()=>Nav.go(renderLeaks)}));

  body.appendChild(BigBtn({title:'Activity log', onClick:()=>Nav.go(renderLog)}));
  body.appendChild(BigBtn({title:'Settings', onClick:()=>Shell.openSettings()}));
  return scr;
}

/* ---------- DATA BROKERS ---------- */
function renderBrokers(){
  const c = counts();
  const nodes = [
    el(`<p class="sub">These sites collect and <b>sell</b> your info. Tap one, follow the two steps, mark it. ${c.bDone} of ${DATA_BROKERS.length} gone.</p>`)
  ];
  for(const b of DATA_BROKERS){
    const st = brokerStatus(b.id);
    const item = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
      ${dot(st)}
      <span class="grow"><b>${esc(b.name)}</b><small>${st==='done'?'Removed ✓':st==='sent'?'Waiting for them…':'Not done yet'}</small></span>
      <span class="arrow">›</span></button>`);
    item.onclick = ()=>brokerSheet(b);
    nodes.push(item);
  }
  return Screen('Data sellers', nodes);
}

function brokerSheet(b){
  const st = brokerStatus(b.id);
  const s = sheet(b.name, [
    el(`<p class="plain">${esc(b.note)}</p>`),
    BigBtn({title:'Step 1 — Open their removal page', arrow:false, onClick:()=>{
      Shell.openExternal(b.url); }}),
    BigBtn({title:'Step 2 — Copy my demand letter', sub:'Paste it into their form or email', arrow:false, onClick:()=>{
      copy(Tools.deletionLetter(b.name, S().profile)); }}),
    el(`<div class="hr"></div>`),
    BigBtn({title: st==='sent'?'✓ Marked as sent':'I sent the request', primary: st!=='sent', arrow:false, onClick:async ()=>{
      S().ghost.brokers[b.id]='sent'; Vault.log('Ghost','Sent removal request to '+b.name);
      await Vault.save(); s.close(); Nav.refresh(); toast('Marked. Check back for their confirm email.');
    }}),
    BigBtn({title:'They confirmed — I’m removed', arrow:false, onClick:async ()=>{
      S().ghost.brokers[b.id]='done'; Vault.log('Ghost','Removed from '+b.name);
      await Vault.save(); s.close(); Nav.refresh(); toast('Removal confirmed.');
    }}),
    st!=='todo' ? BigBtn({title:'Reset this one', arrow:false, onClick:async ()=>{
      delete S().ghost.brokers[b.id]; await Vault.save(); s.close(); Nav.refresh();
    }}) : null
  ]);
}

/* ---------- OLD ACCOUNTS ---------- */
function renderAccounts(){
  const c = counts();
  const nodes = [
    el(`<p class="sub">Every old account is a door with your name on it. Close the ones you don’t use. ${c.aDone} of ${DELETE_ACCOUNTS.length} closed.</p>`)
  ];
  for(const a of DELETE_ACCOUNTS){
    const st = acctStatus(a.id);
    const diff = a.difficulty==='easy'?'Easy':a.difficulty==='medium'?'Medium':'They fight you';
    const item = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
      ${dot(st)}
      <span class="grow"><b>${esc(a.name)}</b><small>${st==='done'?'Deleted ✓': st==='na'?'Skipped (no account)': diff}</small></span>
      <span class="arrow">›</span></button>`);
    item.onclick=()=>acctSheet(a);
    nodes.push(item);
  }
  return Screen('Old accounts', nodes);
}

function acctSheet(a){
  const st = acctStatus(a.id);
  const s = sheet(a.name, [
    el(`<p class="plain">${esc(a.note)}</p>`),
    BigBtn({title:'Open the delete page', arrow:false, onClick:()=>Shell.openExternal(a.url)}),
    el(`<div class="hr"></div>`),
    BigBtn({title:'It’s deleted', primary:true, arrow:false, onClick:async ()=>{
      S().ghost.accounts[a.id]='done'; Vault.log('Ghost','Deleted '+a.name+' account');
      await Vault.save(); s.close(); Nav.refresh(); toast('Account deleted.');
    }}),
    BigBtn({title:'I don’t have this account', arrow:false, onClick:async ()=>{
      S().ghost.accounts[a.id]='na'; await Vault.save(); s.close(); Nav.refresh();
    }}),
    st!=='todo' ? BigBtn({title:'Reset this one', arrow:false, onClick:async ()=>{
      delete S().ghost.accounts[a.id]; await Vault.save(); s.close(); Nav.refresh();
    }}) : null
  ]);
}

/* ---------- JUNK EMAIL ---------- */
function renderUnsubs(){
  const nodes = [
    el(`<p class="sub">Open a junk email. Real company? Tap <b>unsubscribe</b> at the very bottom. Looks scammy? <b>Don’t click anything</b> — mark it as spam. Track them here so they stay dead.</p>`)
  ];
  const inp = el(`<input type="text" placeholder="Who sends you junk? (e.g. Nike)">`);
  const em = el(`<input type="email" placeholder="Their email address (optional — enables one-tap send)" autocapitalize="off">`);
  const add = BigBtn({title:'Add sender', primary:true, arrow:false, onClick:async ()=>{
    const v=inp.value.trim(); if(!v) return toast('Type a sender name');
    S().ghost.unsubs.unshift({name:v, email:em.value.trim(), status:'todo', t:Date.now()});
    Vault.log('Ghost','Added '+v+' to unsubscribe list');
    await Vault.save(); inp.value=''; em.value=''; Nav.refresh();
  }});
  nodes.push(inp, em, add, el(`<div class="hr"></div>`));

  if(!S().ghost.unsubs.length) nodes.push(el(`<p class="center-note">No senders tracked yet.</p>`));
  S().ghost.unsubs.forEach((u,i)=>{
    const item = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
      ${dot(u.status==='done'?'done':u.status==='sent'?'sent':'todo')}
      <span class="grow"><b>${esc(u.name)}</b><small>${u.status==='done'?'Stopped ✓':u.status==='sent'?'Unsubscribed — watching…':'To do'}</small></span>
      <span class="arrow">›</span></button>`);
    item.onclick=()=>unsubSheet(u,i);
    nodes.push(item);
  });
  return Screen('Junk email', nodes);
}

function unsubSheet(u,i){
  const letter = Tools.unsubscribeLetter(u.name, S().profile);
  const s = sheet(u.name, [
    el(`<p class="plain">First try their own unsubscribe link (bottom of their email). If they keep mailing you, send the demand below — the law is on your side.</p>`),
    u.email ? BigBtn({title:'Email them — ready to send', sub:'Opens your Mail app with the demand written. You hit send.', primary:true, arrow:false, onClick:async ()=>{
      Shell.openExternal(`mailto:${encodeURIComponent(u.email)}?subject=${encodeURIComponent('Unsubscribe me and delete my data')}&body=${encodeURIComponent(letter)}`);
      u.status='sent'; Vault.log('Ghost','Sent unsubscribe demand to '+u.name);
      await Vault.save(); Nav.refresh();
    }}) : el(`<p class="tiny">Add their email address when adding a sender to get a one-tap "ready to send" button here.</p>`),
    BigBtn({title:'Copy demand letter', arrow:false, onClick:()=>copy(letter)}),
    el(`<div class="hr"></div>`),
    BigBtn({title:'I unsubscribed', primary:true, arrow:false, onClick:async ()=>{
      u.status='sent'; Vault.log('Ghost','Unsubscribed from '+u.name); await Vault.save(); s.close(); Nav.refresh();
    }}),
    BigBtn({title:'They stopped — it worked', arrow:false, onClick:async ()=>{
      u.status='done'; await Vault.save(); s.close(); Nav.refresh(); toast('Resolved.');
    }}),
    BigBtn({title:'Remove from list', arrow:false, onClick:async ()=>{
      S().ghost.unsubs.splice(i,1); await Vault.save(); s.close(); Nav.refresh();
    }})
  ]);
}

/* ---------- INBOX SCAN (Gmail hookup) ---------- */
function renderInbox(){
  const nodes = [];

  if(!Gmail.configured()){
    nodes.push(el(`<div class="card"><h3>Needs your Google key</h3>
      <p style="color:var(--fg)">This feature connects straight to YOUR Gmail with your own Google app key — no middleman, headers only, nothing sent without your tap.</p>
      <p style="color:var(--fg)">The key isn’t set yet. It takes about 5 minutes to create — follow the setup steps you were given, then it goes live.</p></div>`));
    return Screen('Scan my inbox', nodes);
  }

  if(!Gmail.connected()){
    nodes.push(el(`<p class="plain"><b>What this does:</b> connects to your Gmail and reads only the <b>labels on the envelopes</b> across your whole inbox — Primary included, since promos sneak in there. It cannot read the letters inside. It lists only senders using bulk-mail machinery (the unsubscribe header) — <b>real people can never appear</b>. Then <b>you</b> fire off, for each junk sender, an unsubscribe <b>and</b> a legal demand to delete your data. Scan again later and it flags anyone who kept emailing you.</p>`));
    nodes.push(el(`<p class="plain"><b>What happens when you tap Connect:</b> you go to Google’s own sign-in, approve, and come back. The app will be locked when you return (that’s the auto-lock doing its job) — unlock and the connection is live for about an hour.</p>`));
    nodes.push(BigBtn({title:'Connect my Gmail', primary:true, arrow:false, onClick:()=>Gmail.connect()}));
    const scan = S().ghost.scan;
    if(scan) renderScanList(nodes, scan, /*offline*/true);
    return Screen('Scan my inbox', nodes);
  }

  nodes.push(el(`<p class="sub">Connected as <b>${esc(Gmail.account()||'your Gmail')}</b>. Headers only. Nothing sends without your tap.</p>`));
  const already = (S().ghost.scan?.senders||[]).some(x=>x.status==='sent');

  const out = el(`<div></div>`);
  const scanBtn = BigBtn({title: already?'Re-check my inbox':'Scan my inbox now', sub: already?'Finds new junk + flags anyone still emailing you':'', primary:true, arrow:false, onClick:async ()=>{
    scanBtn.disabled = true; out.innerHTML = `<p class="center-note">Scanning your inbox — Primary included, envelope headers only…</p>`;
    try{
      const senders = await Gmail.scan((n,total)=>{ out.innerHTML = `<p class="center-note">Checked ${n}${total?' of '+total:''} messages…</p>`; });
      const prev = S().ghost.scan?.senders || [];
      const prevBy = {}; prev.forEach(x=>{ prevBy[x.email]=x; });
      // Merge new scan onto prior state, preserving status/unsubAt, and RE-CHECK:
      // if a sender we unsubscribed has emailed again SINCE we unsubscribed,
      // flag it as still emailing so it can be escalated.
      let stillCount = 0;
      const merged = senders.map(x=>{
        const p = prevBy[x.email];
        const rec = { ...x, status: p?.status||'todo', unsubAt: p?.unsubAt||0 };
        if((rec.status==='sent') && rec.unsubAt && x.lastSeen > rec.unsubAt){
          rec.status = 'stillEmailing'; stillCount++;
        }
        return rec;
      });
      const seen = new Set(senders.map(x=>x.email));
      prev.forEach(x=>{ if(!seen.has(x.email)) merged.push(x); });   // keep senders this scan missed
      S().ghost.scan = { t: Date.now(), senders: merged };
      Vault.log('Ghost','Scanned inbox: '+senders.length+' senders'+(stillCount?', '+stillCount+' still emailing after unsubscribe':''));
      await Vault.save();
      Nav.refresh();
      if(stillCount) toast(stillCount+' sender'+(stillCount>1?'s':'')+' kept emailing after you unsubscribed — see the top of the list.');
    }catch(e){
      scanBtn.disabled = false;
      out.innerHTML = '';
      if(e.partial || e.message==='partial') toast('Connection was patchy — kept your last results. Try again.');
      else if(e.message==='reconnect'){ toast('Google session ended — tap Connect again.'); Nav.refresh(); }
      else if(e.message==='busy') toast('Google is rate-limiting — wait a moment and retry.');
      else toast('Scan failed. Try again.');
    }
  }});
  nodes.push(scanBtn, out);

  nodes.push(BigBtn({title:'Disconnect Gmail', arrow:false, onClick:async ()=>{
    await Gmail.disconnect(); toast('Disconnected. Access revoked at Google.'); Nav.refresh();
  }}));

  const scan = S().ghost.scan;
  if(scan) renderScanList(nodes, scan, false);
  return Screen('Scan my inbox', nodes);
}

function deletionBody(snd){ return Tools.unsubscribeLetter(snd.name, S().profile); }

/* Opening a sender's unsubscribe page = stepping onto THEIR turf.
   Show the real domain first and warn: a real unsubscribe never needs a login. */
function openUnsubLink(link){
  let host = '';
  try{ host = new URL(link).hostname; }catch(e){ return; }
  confirmSheet('Open '+host+'?',
    'Their unsubscribe page will open. A real unsubscribe never asks for a password or card number — if this one does, close it.',
    'Open', ()=>Shell.openExternal(link));
}

async function runBatch(list, label){
  let sent=0, failed=0, stopped=false;
  for(const snd of list){
    try{
      await Gmail.unsubscribeAndDelete(snd, deletionBody(snd));
      snd.status='sent'; snd.unsubAt=Date.now(); sent++;
    }catch(e){
      if(e.message==='reconnect'){ stopped=true; break; }
      failed++;
    }
  }
  Vault.log('Ghost', label+': '+sent+' sent');
  await Vault.save(); Nav.refresh();
  if(stopped) toast('Sent '+sent+'. Google session ended — reconnect to finish.');
  else if(failed) toast('Sent '+sent+'. '+failed+' could not be sent — try again.');
  else toast(sent+' handled — unsubscribe + deletion demand sent.');
}

function renderScanList(nodes, scan, offline){
  nodes.push(el(`<div class="hr"></div>`));
  const still = scan.senders.filter(x=>x.status==='stillEmailing');
  const pending = scan.senders.filter(x=>x.status==='todo');
  const oneTap = pending.filter(x=>x.mailto);

  // Repeat offenders first
  if(still.length){
    nodes.push(el(`<div class="card"><h3>Ignored your unsubscribe (${still.length})</h3>
      <p style="color:var(--fg)">These kept emailing after you unsubscribed. That’s a legal violation — escalate: re-send the deletion demand, then report them.</p></div>`));
    if(!offline){
      nodes.push(BigBtn({title:`Re-send deletion demand to all ${still.filter(x=>x.mailto).length}`, arrow:false, onClick:()=>{
        confirmSheet('Escalate '+still.filter(x=>x.mailto).length+' repeat offenders?',
          'Sends a fresh unsubscribe + CCPA/GDPR deletion demand to each from your Gmail.',
          'Send', ()=>runBatch(still.filter(x=>x.mailto), 'Escalated repeat offenders'));
      }}));
    }
    for(const snd of still){ nodes.push(senderRow(snd, offline)); }
    nodes.push(el(`<div class="hr"></div>`));
  }

  nodes.push(el(`<p class="sub">${scan.senders.length} marketing senders · ${pending.length} not handled yet. ${offline?'(from your last scan)':''}</p>`));

  if(!offline && oneTap.length){
    nodes.push(BigBtn({title:`Review & send — ${oneTap.length} waiting`, sub:'You approve exactly who gets removed. Nothing sends yet.',
      primary:true, arrow:false, onClick:()=>Nav.go(renderBatchReview)}));
  }

  const kept = scan.senders.filter(x=>x.status==='keep'||x.status==='skip');
  for(const snd of pending.concat(scan.senders.filter(x=>x.status==='sent'))){
    nodes.push(senderRow(snd, offline));
  }
  if(kept.length){
    nodes.push(el(`<div class="hr"></div>`));
    nodes.push(el(`<p class="sub">Kept senders (${kept.length}) — protected, never included in any send:</p>`));
    for(const snd of kept) nodes.push(senderRow(snd, offline));
  }
}

/* The careful-approval screen: every waiting sender listed with a mark.
   Filled mark = will be sent. Tap to spare one. Then one send, one confirm. */
function renderBatchReview(){
  const scan = S().ghost.scan;
  const list = (scan?.senders||[]).filter(x=>x.status==='todo' && x.mailto);
  if(!list.length) return Screen('Review & send', [el(`<p class="center-note">Nothing waiting for approval.</p>`)]);

  const sel = new Set(list.map(x=>x.email));            // start with all marked
  const head = el(`<p class="sub"></p>`);
  const sendBtn = BigBtn({title:'', primary:true, arrow:false, onClick:()=>{
    const chosen = list.filter(x=>sel.has(x.email));
    if(!chosen.length) return;
    confirmSheet('Send to '+chosen.length+' sender'+(chosen.length>1?'s':'')+'?',
      'Each gets an unsubscribe AND a CCPA/GDPR demand to delete your data — sent from your Gmail. The unmarked ones are untouched.',
      'Send', ()=>runBatch(chosen, 'Approved batch unsubscribe + delete'));
  }});
  const toggleAll = el(`<button class="btn btn-outline" style="justify-content:center">Unmark all</button>`);

  const upd = ()=>{
    head.innerHTML = `<b>${sel.size}</b> of ${list.length} marked for removal. Tap a sender to spare it. Filled mark = gets the unsubscribe + deletion demand.`;
    sendBtn.querySelector('.txt').textContent = sel.size ? `Send to ${sel.size} marked sender${sel.size>1?'s':''}` : 'Nothing marked';
    sendBtn.disabled = !sel.size;
    toggleAll.textContent = sel.size===list.length ? 'Unmark all' : 'Mark all';
  };

  const rows = list.map(snd=>{
    const row = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
      <span class="dot done"></span>
      <span class="grow"><b>${esc(snd.name)}</b><small>${esc(snd.email)} · ${snd.count} email${snd.count>1?'s':''}</small></span>
    </button>`);
    row.onclick = ()=>{
      if(sel.has(snd.email)) sel.delete(snd.email); else sel.add(snd.email);
      row.querySelector('.dot').className = 'dot '+(sel.has(snd.email)?'done':'');
      upd();
    };
    return row;
  });

  toggleAll.onclick = ()=>{
    if(sel.size===list.length) sel.clear(); else list.forEach(x=>sel.add(x.email));
    rows.forEach((row,i)=>{ row.querySelector('.dot').className = 'dot '+(sel.has(list[i].email)?'done':''); });
    upd();
  };

  upd();
  return Screen('Review & send', [head, sendBtn, toggleAll,
    el(`<p class="tiny">Want one gone from this list forever? Go back, open it, and choose “Keep this sender”.</p>`),
    ...rows]);
}

function senderRow(snd, offline){
  const method = snd.mailto ? 'Unsubscribe + delete' : snd.link ? 'Unsubscribe link' : 'No unsubscribe offered';
  const kept = snd.status==='keep'||snd.status==='skip';
  const stText = snd.status==='sent' ? 'Handled ✓'
    : snd.status==='stillEmailing' ? 'STILL EMAILING — escalate'
    : kept ? 'Kept — will never be touched'
    : method+' · '+snd.count+' emails';
  const dotState = snd.status==='sent'?'done': snd.status==='stillEmailing'?'pending':'todo';
  const item = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
    ${dot(dotState)}
    <span class="grow"><b>${esc(snd.name)}</b><small>${esc(stText)}</small></span>
    <span class="arrow">›</span></button>`);
  item.onclick = ()=>senderSheet(snd, offline);
  return item;
}

function senderSheet(snd, offline){
  const escalating = snd.status==='stillEmailing';
  const s = sheet(snd.name, [
    escalating ? el(`<div class="card"><h3>Ignored your unsubscribe</h3><p style="color:var(--fg)">They emailed you again after you unsubscribed. Re-send the deletion demand, and if it continues, report them (below).</p></div>`) : null,
    el(`<p class="plain">${esc(snd.email)} — ${snd.count} email${snd.count>1?'s':''} in your recent inbox.</p>`),
    (snd.mailto && !offline) ? BigBtn({title: escalating?'Re-send unsubscribe + deletion demand':'Unsubscribe + demand deletion', sub:'Stops future mail AND demands they erase your data (CCPA/GDPR)', primary:true, arrow:false, onClick:async ()=>{
      try{
        await Gmail.unsubscribeAndDelete(snd, deletionBody(snd));
        snd.status='sent'; snd.unsubAt=Date.now(); Vault.log('Ghost','Unsubscribe + deletion demand to '+snd.email);
        await Vault.save(); s.close(); Nav.refresh(); toast('Sent — unsubscribe + deletion demand.');
      }catch(e){ toast(e.message==='reconnect'?'Google session expired — reconnect':'Send failed.'); }
    }}) : null,
    escalating ? BigBtn({title:'Report them (FTC)', sub:'File a spam complaint at reportfraud.ftc.gov', arrow:false, onClick:()=>Shell.openExternal('https://reportfraud.ftc.gov/')}) : null,
    snd.link ? BigBtn({title:'Open their unsubscribe page', arrow:false, onClick:()=>{ s.close(); openUnsubLink(snd.link); }}) : null,
    (!snd.mailto && !snd.link) ? el(`<p class="tiny">They offer no unsubscribe channel — that itself violates CAN-SPAM. Mark their emails as spam in Mail, and add them to your junk tracker.</p>`) : null,
    el(`<div class="hr"></div>`),
    BigBtn({title:'Mark as done', arrow:false, onClick:async ()=>{
      snd.status='sent'; await Vault.save(); s.close(); Nav.refresh();
    }}),
    BigBtn({title:'Keep this sender — never touch it', sub:'Protected from every send, including batches', arrow:false, onClick:async ()=>{
      snd.status='keep'; await Vault.save(); s.close(); Nav.refresh(); toast('Kept. It can never be included in a send.');
    }}),
    BigBtn({title:'Add to my junk tracker', arrow:false, onClick:async ()=>{
      S().ghost.unsubs.unshift({name:snd.name, email:snd.email, status:'todo', t:Date.now()});
      await Vault.save(); s.close(); toast('Added to Stop junk email.');
    }})
  ]);
}

/* ---------- LEAKS ---------- */
function renderLeaks(){
  const nodes = [
    el(`<p class="sub">Hackers publish stolen passwords. Check if yours is out there. <b>Your password never leaves this device</b> — only a tiny scrambled piece is compared.</p>`)
  ];
  const pw = el(`<input type="password" placeholder="Type a password to check">`);
  const out = el(`<div></div>`);
  const check = BigBtn({title:'Check this password', primary:true, arrow:false, onClick:async ()=>{
    const v=pw.value; if(!v) return toast('Type a password first');
    out.innerHTML=`<div class="spinner" style="margin:18px auto"></div>`;
    try{
      const n = await Tools.pwnedCount(v);
      if(n>0){
        out.innerHTML=`<div class="card"><h3>LEAKED — found ${n.toLocaleString()} times</h3>
          <p style="color:var(--fg)">This password appears in known stolen data. Anywhere you use it, change it <b>today</b>. Never use it again.</p></div>`;
        Vault.log('Ghost','Found a leaked password'); Vault.save();
      } else {
        out.innerHTML=`<div class="card"><h3>✓ Not in known leaks</h3>
          <p style="color:var(--fg)">Good. Keep it long and never reuse it across sites.</p></div>`;
      }
    }catch(e){
      out.innerHTML=`<div class="card"><h3>Couldn’t check</h3><p>No internet, or the checker is down. Try again later.</p></div>`;
    }
    pw.value='';
  }});
  nodes.push(pw, check, out, el(`<div class="hr"></div>`));

  nodes.push(el(`<p class="plain"><b>Your email addresses</b> can leak too (with passwords attached). Check them free here — search each email you use:</p>`));
  nodes.push(BigBtn({title:'Check my emails for breaches', sub:'Opens haveibeenpwned.com (free, trusted)', arrow:false,
    onClick:()=>Shell.openExternal('https://haveibeenpwned.com/')}));
  nodes.push(el(`<p class="tiny" style="margin-top:10px">If an email shows up in a breach: change that account’s password, turn on two-step login, and never reuse the old password.</p>`));
  return Screen('Was I leaked?', nodes);
}

/* ---------- LOG ---------- */
function renderLog(){
  const nodes=[el(`<p class="sub">Every action taken, newest first.</p>`)];
  if(!S().log.length) nodes.push(el(`<p class="center-note">No actions recorded yet.</p>`));
  for(const item of S().log.slice(0,100)){
    nodes.push(el(`<div class="item"><span class="grow"><b>${esc(item.action)}</b><small>${esc(item.app)} · ${ago(item.t)}</small></span></div>`));
  }
  return Screen('Activity log', nodes);
}

/* ---------- boot ---------- */
Gmail.handleRedirect();   // capture a returning Google sign-in before anything else
Shell.boot({ name:'Ghost', glyph:EMBLEMS.ghost, renderHome });
})();
