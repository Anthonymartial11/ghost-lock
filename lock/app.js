/* Lock — protect the present. Stop trackers, ads, scams and weak spots
   BEFORE they get you. Works in tandem with Ghost (same vault, same lock). */
(()=>{
const { el, esc, Nav, Screen, BigBtn, toast, sheet, confirmSheet, copy, ago } = UI;
const S = ()=>Vault.state;

/* =============== the shields (checklists) =============== */

const IPHONE = [
  {id:'ip_track', title:'Stop apps asking to track you',
    why:'Apps beg to follow you across other apps and sites to sell you stuff. One switch shuts them all up.',
    steps:['Open Settings','Privacy & Security → Tracking','Turn OFF “Allow Apps to Request to Track”']},
  {id:'ip_ads', title:'Turn off Apple personalized ads',
    why:'Apple also builds an ad profile on you. You can just say no.',
    steps:['Settings → Privacy & Security','Scroll down → Apple Advertising','Turn OFF Personalized Ads']},
  {id:'ip_privacyreport', title:'See who’s spying (App Privacy Report)',
    why:'Your iPhone keeps receipts on which apps touch your location, mic, contacts — and who they phone home to.',
    steps:['Settings → Privacy & Security','App Privacy Report → Turn On','Come back in a day and look at the worst offenders']},
  {id:'ip_location', title:'Cut location access down',
    why:'Half your apps don’t need to know where you are. Ever.',
    steps:['Settings → Privacy & Security → Location Services','For each app: pick “While Using” or “Never”','Turn off “Precise Location” for apps that don’t need it (like social media)']},
  {id:'ip_mail', title:'Hide your email opens',
    why:'Marketing emails contain invisible trackers that report when and where you read them. This blinds them.',
    steps:['Settings → Apps → Mail → Privacy Protection','Turn ON “Protect Mail Activity”']},
  {id:'ip_safari', title:'Harden Safari',
    why:'Stops pop-ups, warns you about scam sites, and hides you from cross-site trackers.',
    steps:['Settings → Apps → Safari','Turn ON: Block Pop-ups','Turn ON: Fraudulent Website Warning','Turn ON: Prevent Cross-Site Tracking','Set “Hide IP Address” to “From Trackers”']},
  {id:'ip_updates', title:'Auto-update everything',
    why:'Most hacks use holes that were already fixed. Updates are the patch. Automate it.',
    steps:['Settings → General → Software Update','Automatic Updates → turn everything ON']},
  {id:'ip_findmy', title:'Turn on Find My iPhone',
    why:'Phone stolen? You can lock and erase it from anywhere.',
    steps:['Settings → your name → Find My','Turn ON Find My iPhone (all three switches)']}
];

const MAC = [
  {id:'mac_fw', title:'Turn ON the Mac firewall',
    why:'Your Mac ships with a real firewall — turned OFF. This blocks unwanted incoming connections. Free. One switch.',
    steps:['System Settings → Network → Firewall','Turn it ON','Click Options → turn ON “Stealth Mode” (your Mac stops answering strangers)']},
  {id:'mac_filevault', title:'Encrypt the whole disk (FileVault)',
    why:'If your Mac is stolen, FileVault makes the drive unreadable without your password.',
    steps:['System Settings → Privacy & Security','FileVault → Turn On','Save the recovery key somewhere safe (not on the Mac)']},
  {id:'mac_gatekeeper', title:'Only allow trusted apps',
    why:'Blocks random downloaded programs — the #1 way Macs get infected.',
    steps:['System Settings → Privacy & Security','Under “Allow applications from”, pick “App Store & Known Developers”','Never override it for something a website told you to install']},
  {id:'mac_updates', title:'Auto-update macOS',
    why:'Same as the phone: updates close the holes hackers use.',
    steps:['System Settings → General → Software Update','Turn on all automatic updates']},
  {id:'mac_lock', title:'Lock the screen fast',
    why:'A Mac left open is an open wallet.',
    steps:['System Settings → Lock Screen','“Require password after screen saver begins or display is turned off” → set to Immediately']},
  {id:'mac_permissions', title:'Audit mic, camera & screen access',
    why:'See exactly which apps can watch and listen, and cut the ones that shouldn’t.',
    steps:['System Settings → Privacy & Security','Check: Microphone, Camera, Screen Recording, Full Disk Access','Turn off anything you don’t recognize or need']},
  {id:'mac_safari', title:'Harden Safari on Mac',
    why:'Same tracker-blinding as the phone.',
    steps:['Safari → Settings → Privacy','Turn ON “Prevent cross-site tracking”','Turn ON “Hide IP address from trackers”','Safari → Settings → Security → turn ON fraud warnings']},
  {id:'mac_backup', title:'Back up automatically',
    why:'Ransomware and dead drives can’t hurt you if your stuff exists twice.',
    steps:['Plug in any external drive','System Settings → General → Time Machine → Add Backup Disk','Leave it plugged in when you’re at your desk']}
];

const BROWSE = [
  {id:'br_blocker', title:'Install a free ad & tracker blocker in Safari',
    why:'Kills most ads, pop-ups and trackers inside the browser itself. AdGuard’s Safari extension is free.',
    steps:['App Store → search “AdGuard for Safari” (Mac) or “AdGuard” (iPhone)','Install the free version','Settings → Safari → Extensions → turn its blockers ON']},
  {id:'br_reject', title:'Cookie pop-ups: always “Reject all”',
    why:'“Accept all” = permission to follow you. The reject button is usually hiding behind “Manage options”.',
    steps:['When a cookie banner appears, never hit Accept','Tap “Reject all” / “Only necessary”','If they make it too hard — leave the site']},
  {id:'br_sso', title:'Don’t “Sign in with Google/Facebook” on random sites',
    why:'It ties everything you do on that site back to your main identity — and tells the big guys where you go.',
    steps:['Use an email + unique password instead','Or use “Sign in with Apple” and tap “Hide My Email”']},
  {id:'br_hide', title:'Use Hide My Email for sign-ups',
    why:'Give every site a fake forwarding email. If they sell it, you know exactly who snitched — and you kill that address.',
    steps:['iPhone: Settings → your name → iCloud → Hide My Email','Create a new address per site','If one starts getting spam, deactivate it']}
];

/* =============== helpers =============== */
function ckDone(id){ return !!S().lock.checklist[id]; }
function listDone(list){ return list.filter(i=>ckDone(i.id)).length; }
function shieldsUp(){
  return (S().lock.dnsDone?1:0) + listDone(IPHONE) + listDone(MAC) + listDone(BROWSE);
}
function shieldsTotal(){ return 1 + IPHONE.length + MAC.length + BROWSE.length; }

/* =============== HOME =============== */
function renderHome(){
  const up = shieldsUp(), total = shieldsTotal();
  const scr = Screen('Lock', [], {back:false});
  const body = scr.lastElementChild;

  body.appendChild(el(`
    <div style="text-align:center;margin:10px 0 18px">
      <div class="glyph">${up===total?'🔒':'🔓'}</div>
      <p class="huge count">${up}<span style="color:var(--dim)"> / ${total}</span></p>
      <p class="sub">shields up${up===total?'. Fully locked.':'. Raise the rest.'}</p>
    </div>`));

  body.appendChild(BigBtn({ico:'🛡', title:'Block ads, trackers & bad sites',
    sub:'One shield for your whole device', badge:S().lock.dnsDone?'ON':'OFF',
    onClick:()=>Nav.go(renderDns)}));

  body.appendChild(BigBtn({ico:'🔗', title:'Is this link safe?',
    sub:'Check before you tap', onClick:()=>Nav.go(renderLink)}));

  body.appendChild(BigBtn({ico:'🔑', title:'Check a password',
    sub:'How strong? Already stolen?', onClick:()=>Nav.go(renderPassword)}));

  body.appendChild(BigBtn({ico:'📱', title:'Harden my iPhone',
    badge:`${listDone(IPHONE)}/${IPHONE.length}`, onClick:()=>Nav.go(()=>renderChecklist('Harden my iPhone', IPHONE))}));

  body.appendChild(BigBtn({ico:'💻', title:'Harden my Mac',
    badge:`${listDone(MAC)}/${MAC.length}`, onClick:()=>Nav.go(()=>renderChecklist('Harden my Mac', MAC))}));

  body.appendChild(BigBtn({ico:'🧭', title:'Browse without being followed',
    badge:`${listDone(BROWSE)}/${BROWSE.length}`, onClick:()=>Nav.go(()=>renderChecklist('Browse unseen', BROWSE))}));

  body.appendChild(BigBtn({ico:'⚙️', title:'Settings', onClick:()=>Shell.openSettings()}));
  return scr;
}

/* =============== DNS SHIELD =============== */
function renderDns(){
  const on = S().lock.dnsDone;
  const nodes = [
    el(`<p class="plain">Your device asks a “phone book” (DNS) where every website lives. This shield swaps in a <b>free</b> phone book that simply refuses to answer for ad servers, trackers, and known scam & malware sites.</p>
    `),
    el(`<p class="plain"><b>Result:</b> fewer ads, fewer pop-ups, trackers blinded, and known bad sites can’t even load — in every app, not just Safari. Made by AdGuard, free, no account.</p>`),
    el(`<div class="hr"></div>`)
  ];

  nodes.push(BigBtn({ico:'1️⃣', title:'Download the shield file', arrow:false, onClick:()=>{
    downloadProfile();
    toast('Downloaded. Now install it (step 2).');
  }}));

  nodes.push(BigBtn({ico:'2️⃣', title:'How to install it', arrow:false, onClick:()=>{
    sheet('Install the shield', [
      el(`<p class="plain"><b>iPhone:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px;margin-top:0">
        <li>Open <b>Settings</b></li>
        <li>Tap <b>Profile Downloaded</b> (top) — or General → VPN & Device Management</li>
        <li>Tap <b>Install</b> (it will say the profile is unsigned — that’s because you made it yourself, right here)</li></ol>`),
      el(`<p class="plain"><b>Mac:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px;margin-top:0">
        <li>Double-click the downloaded file</li>
        <li>System Settings → Privacy & Security → <b>Profiles</b></li>
        <li>Double-click “Lock — DNS Shield” → <b>Install</b></li></ol>`),
      el(`<p class="tiny">If the download didn’t start inside the app, open this same page in Safari and tap it there. To undo the shield later: delete the profile the same place you installed it.</p>`)
    ]);
  }}));

  nodes.push(BigBtn({ico:'3️⃣', title:'Test the shield', sub:'Opens AdGuard’s own checker', arrow:false, onClick:()=>{
    window.open('https://adguard.com/en/test.html','_blank');
  }}));

  nodes.push(el(`<div class="hr"></div>`));
  nodes.push(BigBtn({title: on?'✓ Shield is ON':'The test says I’m protected', primary:!on, arrow:false, onClick:async ()=>{
    S().lock.dnsDone = !on;
    if(!on){ Vault.log('Lock','DNS shield turned ON'); toast('Whole-device shield up 🛡'); }
    await Vault.save(); Nav.refresh();
  }}));

  nodes.push(el(`<p class="tiny" style="margin-top:14px">Want blocking with no ad-filtering (just malware)? Quad9 (quad9.net) is a free non-profit alternative — but for ads + trackers + malware in one, this shield is the one.</p>`));
  return Screen('Whole-device shield', nodes);
}

function uuid(){
  return crypto.randomUUID ? crypto.randomUUID() :
    ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
}

function downloadProfile(){
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key><string>HTTPS</string>
        <key>ServerURL</key><string>https://dns.adguard-dns.com/dns-query</string>
        <key>ServerAddresses</key>
        <array>
          <string>94.140.14.14</string>
          <string>94.140.15.15</string>
          <string>2a10:50c0::ad1:ff</string>
          <string>2a10:50c0::ad2:ff</string>
        </array>
      </dict>
      <key>PayloadDescription</key><string>Blocks ads, trackers and known malicious sites via AdGuard public DNS.</string>
      <key>PayloadDisplayName</key><string>Lock — DNS Shield</string>
      <key>PayloadIdentifier</key><string>com.ghostlock.dnsshield.settings</string>
      <key>PayloadType</key><string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key><string>${uuid()}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>ProhibitDisablement</key><false/>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Free whole-device shield: ads, trackers and known bad sites are blocked at the DNS level.</string>
  <key>PayloadDisplayName</key><string>Lock — DNS Shield (ads, trackers, malware)</string>
  <key>PayloadIdentifier</key><string>com.ghostlock.dnsshield</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${uuid()}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>`;
  const blob = new Blob([xml], {type:'application/x-apple-aspen-config'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Lock-DNS-Shield.mobileconfig';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 30000);
}

/* =============== LINK CHECKER =============== */
function renderLink(){
  const inp = el(`<input type="text" placeholder="Paste the link here" autocapitalize="off" autocorrect="off">`);
  const out = el(`<div></div>`);
  const btn = BigBtn({title:'Check it', primary:true, arrow:false, onClick:()=>{
    const r = Tools.checkLink(inp.value);
    const icon = r.risk>=60?'🚨': r.risk>=30?'⚠️':'✓';
    out.innerHTML = `<div class="card">
      <h3>${icon} ${esc(r.verdict)}</h3>
      <p style="color:var(--fg)">Danger score: <b class="count">${r.risk}/100</b></p>
      ${r.reasons.map(x=>`<p>• ${esc(x)}</p>`).join('')}
      ${r.risk>=30?`<p style="color:var(--fg)"><b>What to do:</b> don’t open it. If it claims to be your bank or a company, type their address yourself or use their app.</p>`:''}
    </div>`;
    if(r.risk>=60){ Vault.log('Lock','Blocked a dangerous link'); Vault.save(); }
  }});
  return Screen('Is this link safe?', [
    el(`<p class="sub">Got a weird text or email with a link? Paste it here <b>instead of tapping it</b>. Checked on your device — the link is never visited.</p>`),
    inp, btn, out
  ]);
}

/* =============== PASSWORD CHECK =============== */
function renderPassword(){
  const inp = el(`<input type="password" placeholder="Type a password">`);
  const meter = el(`<div class="card" style="display:none"></div>`);
  const out = el(`<div></div>`);
  inp.addEventListener('input', ()=>{
    if(!inp.value){ meter.style.display='none'; return; }
    const s = Tools.strength(inp.value);
    meter.style.display='block';
    meter.innerHTML = `<h3>${esc(s.word)}</h3>
      <div style="height:14px;border:2px solid var(--line);border-radius:99px;overflow:hidden;margin:10px 0">
        <div style="height:100%;width:${s.score}%;background:var(--fg)"></div>
      </div>
      ${s.why.map(w=>`<p>• ${esc(w)}</p>`).join('')}`;
  });
  const btn = BigBtn({title:'Was it stolen?', primary:true, arrow:false, onClick:async ()=>{
    if(!inp.value) return toast('Type a password first');
    out.innerHTML=`<div class="spinner" style="margin:18px auto"></div>`;
    try{
      const n = await Tools.pwnedCount(inp.value);
      out.innerHTML = n>0
        ? `<div class="card"><h3>🚨 Yes — stolen ${n.toLocaleString()} times</h3><p style="color:var(--fg)">Criminals already have this one. Don’t use it anywhere. Ever.</p></div>`
        : `<div class="card"><h3>✓ Not in known leaks</h3><p style="color:var(--fg)">Good sign. Long + unique per site is the winning move.</p></div>`;
    }catch(e){ out.innerHTML=`<div class="card"><h3>Couldn’t check</h3><p>Try again when you’re online.</p></div>`; }
  }});
  return Screen('Check a password', [
    el(`<p class="sub">Strength is checked on your device. The stolen-check sends only a tiny scrambled piece — your password <b>never leaves this device</b>.</p>`),
    inp, meter, btn, out,
    el(`<p class="tiny" style="margin-top:14px">Golden rule: one password = one site. Let iPhone/Mac suggest and remember them for you (that’s free too).</p>`)
  ]);
}

/* =============== CHECKLISTS =============== */
function renderChecklist(title, list){
  const nodes = [el(`<p class="sub">${listDone(list)} of ${list.length} done. Tap one, follow the steps, mark it.</p>`)];
  for(const item of list){
    const done = ckDone(item.id);
    const node = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
      <span class="dot ${done?'done':''}"></span>
      <span class="grow"><b>${esc(item.title)}</b><small>${done?'Done ✓':'Tap for steps'}</small></span>
      <span class="arrow">›</span></button>`);
    node.onclick = ()=>checkSheet(item, title, list);
    nodes.push(node);
  }
  return Screen(title, nodes);
}

function checkSheet(item, title, list){
  const done = ckDone(item.id);
  const s = sheet(item.title, [
    el(`<p class="plain">${esc(item.why)}</p>`),
    el(`<ol class="plain" style="padding-left:22px">${item.steps.map(x=>`<li style="margin:8px 0">${esc(x)}</li>`).join('')}</ol>`),
    BigBtn({title: done?'Un-mark it':'Done — shield up', primary:!done, arrow:false, onClick:async ()=>{
      S().lock.checklist[item.id] = !done;
      if(!done) Vault.log('Lock', item.title);
      await Vault.save(); s.close(); Nav.refresh();
      if(!done) toast('🛡 Shield up');
    }})
  ]);
}

/* =============== boot =============== */
Shell.boot({ name:'Lock', glyph:'🔒', renderHome });
})();
