/* profile.js — "My details": the identifiers every removal demand is built from.
 *
 * Why this screen matters: a data broker's favourite dodge is "we could not
 * locate a record matching your request." Every extra identifier — a former
 * name, a previous address, a birth year — removes that excuse. Past addresses
 * matter most: brokers index people by address history.
 *
 * Three ways to fill it, easiest first:
 *   1. Import your contact card (.vcf) — read on this device, never uploaded.
 *   2. Tap a field and let iOS/macOS autofill from your own contact card.
 *   3. Type it.
 */
(()=>{
const { el, esc, Nav, Screen, BigBtn, toast, sheet, confirmSheet } = UI;

/* --- vCard parsing (local file, never leaves the device) --- */
function parseVCard(text){
  const out = { name:'', emails:[], phones:[], street:'', city:'', state:'', zip:'', birthYear:'' };
  const unfold = String(text).replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'');
  for(const line of unfold.split(/\r?\n/)){
    const i = line.indexOf(':'); if(i < 0) continue;
    const key = line.slice(0,i).toUpperCase();
    const val = line.slice(i+1).trim();
    if(!val) continue;
    if(key === 'FN' || key.startsWith('FN;')) out.name = out.name || val;
    else if(key === 'N' || key.startsWith('N;')){
      if(!out.name){ const p = val.split(';'); out.name = [p[1],p[0]].filter(Boolean).join(' ').trim(); }
    }
    else if(key.startsWith('EMAIL')) out.emails.push(val.toLowerCase());
    else if(key.startsWith('TEL')) out.phones.push(val);
    else if(key.startsWith('ADR')){
      const p = val.split(';');                 // ;;street;city;region;postal;country
      if(!out.street){ out.street = (p[2]||'').replace(/\\n/g,' ').trim(); out.city = (p[3]||'').trim();
                       out.state = (p[4]||'').trim(); out.zip = (p[5]||'').trim(); }
    }
    else if(key.startsWith('BDAY')){ const m = val.match(/(\d{4})/); if(m) out.birthYear = m[1]; }
  }
  out.emails = [...new Set(out.emails)];
  out.phones = [...new Set(out.phones)];
  return out;
}

/* --- how complete / how strong are the demands? --- */
function strength(p){
  const checks = [
    { ok: !!p.name,                       label:'Full name', weight:3, why:'Required to identify you at all.' },
    { ok: (p.emails||[]).length > 0,      label:'Email address', weight:3, why:'How they confirm and reply.' },
    { ok: (p.emails||[]).length > 1,      label:'Second email', weight:1, why:'Old addresses are how old records are indexed.' },
    { ok: (p.phones||[]).length > 0,      label:'Phone number', weight:2, why:'Brokers index heavily by phone.' },
    { ok: !!(p.city && p.state),          label:'City & state', weight:2, why:'Narrows you from everyone with your name.' },
    { ok: !!p.street,                     label:'Street address', weight:2, why:'Pins the exact record.' },
    { ok: (p.pastAddresses||[]).length>0, label:'Previous address', weight:3, why:'The single biggest one — brokers file people by address history.' },
    { ok: !!p.birthYear,                  label:'Birth year', weight:2, why:'Separates you from relatives with the same name.' },
    { ok: !!p.otherNames,                 label:'Former / other names', weight:1, why:'Maiden names and nicknames hold separate records.' }
  ];
  const total = checks.reduce((s,c)=>s+c.weight,0);
  const got = checks.filter(c=>c.ok).reduce((s,c)=>s+c.weight,0);
  return { pct: Math.round(100*got/total), checks };
}

function renderProfile(){
  const p = Vault.state.profile;
  const st = strength(p);
  const nodes = [];

  nodes.push(el(`<p class="plain">These details go into every removal demand. A company’s favourite excuse is <b>“we couldn’t find a record matching your request.”</b> Each field you fill takes that excuse away.</p>`));
  nodes.push(el(`<div class="card">
    <h3>Demand strength: ${st.pct}%</h3>
    <div style="height:14px;border:2px solid var(--line);border-radius:99px;overflow:hidden;margin:10px 0">
      <div style="height:100%;width:${st.pct}%;background:var(--fg)"></div>
    </div>
    ${st.checks.filter(c=>!c.ok).slice(0,3).map(c=>`<p>• Missing <b>${esc(c.label)}</b> — ${esc(c.why)}</p>`).join('') || '<p>Everything filled. Your demands are as strong as they get.</p>'}
  </div>`));
  nodes.push(el(`<p class="tiny">Stored encrypted on this device only. It is never uploaded anywhere — it is only ever pasted into letters you send.</p>`));

  /* ---- 1. Import contact card ---- */
  const file = el(`<input type="file" accept=".vcf,text/vcard,text/directory" style="display:none">`);
  file.addEventListener('change', async ()=>{
    const f = file.files && file.files[0]; if(!f) return;
    try{
      const txt = await f.text();
      const v = parseVCard(txt);
      if(!v.name && !v.emails.length && !v.phones.length){ return toast('Couldn’t read that contact card.'); }
      if(v.name) p.name = v.name;
      if(v.emails.length) p.emails = [...new Set([...(p.emails||[]), ...v.emails])];
      if(v.phones.length) p.phones = [...new Set([...(p.phones||[]), ...v.phones])];
      p.street = p.street || v.street; p.city = p.city || v.city;
      p.state = p.state || v.state; p.zip = p.zip || v.zip;
      p.birthYear = p.birthYear || v.birthYear;
      await Vault.save(); Nav.refresh(); toast('Imported from your contact card.');
    }catch(e){ toast('Couldn’t read that file.'); }
  });
  nodes.push(el(`<div class="hr"></div>`));
  nodes.push(BigBtn({title:'Import my contact card', sub:'Fastest way — read on this device, never uploaded', primary:st.pct<40, arrow:false, onClick:()=>file.click()}));
  nodes.push(file);
  nodes.push(BigBtn({title:'How do I get my contact card?', arrow:false, onClick:()=>{
    sheet('Getting your contact card', [
      el(`<p class="plain"><b>iPhone:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px;margin-top:0">
        <li>Open <b>Contacts</b> and tap your own card (top, “My Card”)</li>
        <li>Scroll down → <b>Share Contact</b> → <b>Save to Files</b></li>
        <li>Come back here and tap “Import my contact card”</li></ol>`),
      el(`<p class="plain"><b>Mac:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px;margin-top:0">
        <li>Open <b>Contacts</b>, select your own card</li>
        <li>File → <b>Export → Export vCard…</b> and save it</li>
        <li>Come back here and tap “Import my contact card”</li></ol>`),
      el(`<p class="tiny">The file is read here on your device and never sent anywhere. You can delete it afterwards.</p>`)
    ]);
  }}));

  /* ---- 2. Gmail address, if connected ---- */
  if(window.Gmail && Gmail.connected && Gmail.connected() && Gmail.account()){
    const acct = Gmail.account();
    if(!(p.emails||[]).includes(acct)){
      nodes.push(BigBtn({title:'Add my connected Gmail', sub:acct, arrow:false, onClick:async ()=>{
        p.emails = [...new Set([...(p.emails||[]), acct])];
        await Vault.save(); Nav.refresh(); toast('Added.');
      }}));
    }
  }

  /* ---- 3. The fields (autofill-enabled) ---- */
  nodes.push(el(`<div class="hr"></div>`));
  nodes.push(el(`<p class="sub">Or tap any field — your iPhone/Mac will offer to fill it from your own contact card.</p>`));

  const F = {};
  const field = (key, label, ph, auto, type)=>{
    nodes.push(el(`<label>${esc(label)}</label>`));
    const i = el(`<input type="${type||'text'}" placeholder="${esc(ph)}" autocomplete="${auto}" autocapitalize="${type==='email'?'off':'words'}">`);
    i.value = p[key] || '';
    F[key] = i; nodes.push(i); return i;
  };
  const listField = (key, label, ph, auto, type)=>{
    nodes.push(el(`<label>${esc(label)}</label>`));
    const i = el(`<input type="${type||'text'}" placeholder="${esc(ph)}" autocomplete="${auto}" autocapitalize="off">`);
    i.value = (p[key]||[]).join(', ');
    F[key] = i; nodes.push(i); return i;
  };

  field('name','Full name','First Last','name');
  field('otherNames','Former or other names','Maiden name, nicknames (comma separated)','off');
  field('birthYear','Birth year','1985','bday-year','text');
  listField('emails','Email addresses','you@example.com, old@example.com','email','email');
  listField('phones','Phone numbers','(555) 555-5555','tel','tel');
  field('street','Street address','123 Main St','street-address');
  field('city','City','Phoenix','address-level2');
  field('state','State','AZ','address-level1');
  field('zip','ZIP','85001','postal-code');
  listField('pastAddresses','Previous addresses','Old street, city, state — comma separated between addresses','off');
  field('relatives','Household / relatives (optional)','Names that appear on your records','off');

  nodes.push(el(`<p class="tiny">Previous addresses matter most — brokers file people by address history, so an old address often unlocks the record a company claims not to have.</p>`));

  const save = BigBtn({title:'Save my details', primary:true, arrow:false, onClick:async ()=>{
    const csv = (v)=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
    p.name = F.name.value.trim();
    p.otherNames = F.otherNames.value.trim();
    p.birthYear = F.birthYear.value.trim();
    p.emails = csv(F.emails.value);
    p.phones = csv(F.phones.value);
    p.street = F.street.value.trim();
    p.city = F.city.value.trim();
    p.state = F.state.value.trim();
    p.zip = F.zip.value.trim();
    p.pastAddresses = csv(F.pastAddresses.value);
    p.relatives = F.relatives.value.trim();
    await Vault.save(); toast('Saved.'); Nav.refresh();
  }});
  nodes.push(save);

  return Screen('My details', nodes);
}

window.Profile = { render: renderProfile, strength, parseVCard };
})();
