/* shell.js — the shared lock. Setup, Face ID / password unlock, auto-lock.
   Both Ghost and Lock boot through here so the security is identical.

   Owner-only deterrents (NOT the encryption — see vault.js for that):
   - First-time setup asks for the owner code (see shared/owner.js). This stops
     a casual passer-by; a technical attacker can bypass a client-side check.
   - Wrong password attempts trigger escalating time-outs (30s → 1m → 5m →
     15m → 1h) in the UI. This slows guessing at the screen; it is not a
     cryptographic control (someone who copies the encrypted store can ignore
     it), which is why the real defense is a strong password + PBKDF2 600k.
*/
(()=>{
const { el, esc, Nav, Screen, BigBtn, toast, sheet, confirmSheet } = UI;

/* ---- owner code check ---- */
const hexBuf = (hex)=>Uint8Array.from(hex.match(/.{2}/g).map(b=>parseInt(b,16)));
const bufHex = (buf)=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');

async function ownerOk(code){
  const O = window.OWNER;
  if(!O || !O.hashHex) return true;           // no owner code configured
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code.trim()), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {name:'PBKDF2', salt:hexBuf(O.saltHex), iterations:O.iterations, hash:'SHA-256'}, base, 256);
  return bufHex(bits) === O.hashHex.toLowerCase();
}

/* ---- brute-force guard (persisted, device-local) ---- */
const LOCK_DELAYS = {5:30e3, 6:60e3, 7:300e3, 8:900e3}; // 9+ → 1h
async function guardGet(){ return (await kvGet('guard')) || {fails:0, until:0}; }
async function guardFail(){
  const g = await guardGet(); g.fails++;
  if(g.fails>=5) g.until = Date.now() + (LOCK_DELAYS[g.fails] || 3600e3);
  await kvSet('guard', g); return g;
}
async function guardClear(){ await kvDel('guard'); }
function fmtLeft(ms){
  const s = Math.ceil(ms/1000);
  return s>=60 ? Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s' : s+'s';
}

const Shell = {
  cfg:null,

  suppressLock:false,   // set true right before WE open an external link/file
  hideCount:0,          // bumped every time the app is backgrounded

  async boot(cfg){
    this.cfg = cfg;                      // { name, glyph, renderHome }
    Nav.init(document.getElementById('root'));
    // security: lock the moment the app is hidden/backgrounded — UNLESS we
    // ourselves just opened an external link (the user tapped a button that
    // opens a removal page etc.), which also fires visibilitychange.
    document.addEventListener('visibilitychange', ()=>{
      if(!document.hidden) return;
      this.hideCount++;
      if(this.suppressLock){ this.suppressLock=false; return; }
      this.lockNow(true);
    });
    window.addEventListener('pagehide', ()=>{ this.hideCount++; this.lockNow(true); });

    if(await Vault.exists()) this.showUnlock();
    else this.showSetup();
  },

  // Open an external URL without tripping the auto-lock. Used by app buttons.
  openExternal(url){
    this.suppressLock = true;
    window.open(url, '_blank', 'noopener');
    // safety: if we don't actually background within a moment, clear the flag
    setTimeout(()=>{ this.suppressLock = false; }, 4000);
  },

  closeSheets(){
    document.querySelectorAll('.sheet, .sheet-bg').forEach(n=>n.remove());
  },

  lockNow(silent){
    this.closeSheets();                 // never leave vault content/buttons over the lock screen
    if(!Vault.key) return;
    Vault.lock();
    if(!silent) toast('Locked');
    this.showUnlock();
  },

  /* ---------------- SETUP (first run on a device) ---------------- */
  showSetup(){
    const needCode = !!(window.OWNER && window.OWNER.hashHex);
    Nav.reset(()=>{
      const oc = el(`<input type="password" placeholder="Owner code" autocomplete="off" autocapitalize="characters">`);
      const p1 = el(`<input type="password" placeholder="Make a password" autocomplete="new-password">`);
      const p2 = el(`<input type="password" placeholder="Type it again" autocomplete="new-password">`);
      const create = BigBtn({title:'Create my lock', primary:true, arrow:false, onClick:async ()=>{
        if((p1.value||'').length<10) return toast('Use at least 10 characters. A short phrase is best.');
        if(p1.value!==p2.value) return toast('The two do not match');
        create.disabled=true; create.querySelector('.txt').textContent='Checking…';
        try{
          if(needCode && !(await ownerOk(oc.value))){
            create.disabled=false; create.querySelector('.txt').textContent='Create my lock';
            return toast('Wrong owner code. This app belongs to its owner.');
          }
          // Guard against a stale second setup screen clobbering an existing vault.
          if(await Vault.exists()){
            create.disabled=false; create.querySelector('.txt').textContent='Create my lock';
            toast('This app is already set up on this device.');
            return this.showUnlock();
          }
          create.querySelector('.txt').textContent='Setting up…';
          const pw = p1.value;
          const h0 = this.hideCount;
          await Vault.create(pw);
          await guardClear();
          Vault.log(this.cfg.name,'Created the lock');
          await Vault.save();
          this.afterUnlock(true, pw, h0);
        }catch(e){
          create.disabled=false; create.querySelector('.txt').textContent='Create my lock';
          toast('Something went wrong');
        }
      }});
      p2.addEventListener('keydown', e=>{ if(e.key==='Enter') create.click(); });
      const nodes = [
        el(`<div style="text-align:center;margin:14px 0 6px"><div class="glyph">${this.cfg.glyph}</div></div>`),
        el(`<p class="big" style="text-align:center">Set up your lock</p>`),
        el(`<p class="sub" style="text-align:center">Only you get in. Nothing is saved anywhere but this device.</p>`),
        el(`<div class="hr"></div>`)
      ];
      if(needCode){
        nodes.push(el(`<label>Owner code — proves this app is yours</label>`), oc);
        nodes.push(el(`<label>Your password</label>`));
      }
      nodes.push(p1, p2, create,
        el(`<p class="center-note">Use a phrase you'll remember — the longer, the stronger.<br>There is no "forgot password". That is what keeps it safe.</p>`));
      return Screen(this.cfg.name, nodes, {back:false});
    });
  },

  /* ---------------- UNLOCK ---------------- */
  showUnlock(){
    Nav.reset(()=> this._unlockScreen());
    // auto-try Face ID once
    Bio.isEnabled().then(on=>{ if(on) setTimeout(()=>this._tryFaceId(true), 350); });
  },

  _unlockScreen(){
    const glyph = el(`<div style="text-align:center;margin:20px 0 6px"><div class="glyph">${this.cfg.glyph}</div></div>`);
    const nodes = [
      glyph,
      el(`<p class="huge" style="text-align:center">${esc(this.cfg.name)}</p>`),
      el(`<p class="sub" style="text-align:center">Locked</p>`),
      el(`<div class="hr"></div>`)
    ];

    const waitNote = el(`<p class="center-note" style="display:none"></p>`);
    nodes.push(waitNote);

    const faceBtn = BigBtn({title:'Unlock with Face ID / Touch ID', primary:true, arrow:false,
      onClick:()=>this._tryFaceId(false)});
    faceBtn.id='faceBtn'; faceBtn.style.display='none';
    nodes.push(faceBtn);

    const pw = el(`<input type="password" placeholder="Password" autocomplete="current-password">`);
    pw.style.display='none';
    let busy = false;                    // serialize attempts (guard-race fix)
    const pwBtn = BigBtn({title:'Unlock', primary:true, arrow:false, onClick:async ()=>{
      if(busy) return;
      const g = await guardGet();
      if(g.until > Date.now()){ tick(); return toast('Too many tries. Wait '+fmtLeft(g.until-Date.now())); }
      busy = true; pwBtn.disabled = true;
      const h0 = this.hideCount;
      try{
        await Vault.unlockWithPassword(pw.value);
        await guardClear();
        this.afterUnlock(false, null, h0);
      }catch(e){
        const g2 = await guardFail();
        pw.value='';
        if(g2.until > Date.now()){ toast('Wrong password. Locked for '+fmtLeft(g2.until-Date.now())); tick(); }
        else toast('Wrong password'+(g2.fails>=3?` (${5-g2.fails} tries before a time-out)`:''));
        pw.focus();
      }finally{ busy = false; pwBtn.disabled = false; }
    }});
    pwBtn.style.display='none';
    pw.addEventListener('keydown', e=>{ if(e.key==='Enter') pwBtn.click(); });

    const usePw = el(`<button class="btn btn-outline" style="justify-content:center">Use password instead</button>`);
    usePw.onclick=()=>{ pw.style.display='block'; pwBtn.style.display='flex'; usePw.style.display='none'; faceBtn.style.display='none'; pw.focus(); };

    nodes.push(pw, pwBtn, usePw);
    const scr = Screen(this.cfg.name, nodes, {back:false});

    Bio.isEnabled().then(on=>{
      if(on){ scr.querySelector('#faceBtn').style.display='flex'; }
      else { usePw.style.display='none'; pw.style.display='block'; pwBtn.style.display='flex'; }
    });

    // live countdown while timed out (Face ID stays available — it can't be guessed)
    const tick = async ()=>{
      const g = await guardGet();
      const left = g.until - Date.now();
      if(left > 0){
        waitNote.style.display='block';
        waitNote.textContent = 'Too many wrong tries. Password locked for '+fmtLeft(left)+'.';
        setTimeout(()=>{ if(waitNote.isConnected) tick(); }, 1000);
      } else {
        waitNote.style.display='none';
      }
    };
    tick();
    return scr;
  },

  async _tryFaceId(auto){
    const h0 = this.hideCount;
    try{
      await Bio.unlock();
      await guardClear();
      this.afterUnlock(false, null, h0);
    }catch(e){
      if(!auto) toast('Face ID failed — use your password');
    }
  },

  afterUnlock(isNew, password, hideAtStart){
    // If the app got backgrounded while the unlock was still computing, do NOT
    // reveal contents — lock straight back down.
    if(hideAtStart!=null && this.hideCount !== hideAtStart){ Vault.lock(); this.showUnlock(); return; }
    Vault.log(this.cfg.name, 'Unlocked');
    Vault.save();
    if(isNew) this._offerFaceId(password);
    else Nav.reset(this.cfg.renderHome);
  },

  async _offerFaceId(password){
    const ok = await Bio.platformAvailable();
    if(!ok){ Nav.reset(this.cfg.renderHome); return; }
    Nav.reset(()=> Screen(this.cfg.name, [
      el(`<div style="text-align:center;margin:20px 0"><div class="glyph">${this.cfg.glyph}</div></div>`),
      el(`<p class="big" style="text-align:center">Use Face ID / Touch ID?</p>`),
      el(`<p class="sub" style="text-align:center">Unlock faster with your face or fingerprint. Your password still works too.</p>`),
      el(`<p class="tiny" style="text-align:center;margin-top:10px">Note: on iPhone this also lets your device passcode open the app, so keep that passcode private.</p>`),
      el(`<div class="hr"></div>`),
      BigBtn({title:'Turn on Face ID / Touch ID', primary:true, arrow:false, onClick:async (ev)=>{
        try{ await Bio.enable(password); toast('Face ID unlock is on.'); }
        catch(e){ toast(e.message||'Could not turn it on.'); }
        Nav.reset(this.cfg.renderHome);
      }}),
      BigBtn({title:'Not now', arrow:false, onClick:()=>Nav.reset(this.cfg.renderHome)})
    ], {back:false}));
  },

  // Ask for the password (re-auth) then enable Face ID. Used from Settings,
  // where we no longer have the password in memory.
  _enableFaceIdFromSettings(){
    const pw = el(`<input type="password" placeholder="Your password" autocomplete="current-password">`);
    const go = BigBtn({title:'Turn on Face ID / Touch ID', primary:true, arrow:false, onClick:async ()=>{
      if(!pw.value) return toast('Enter your password');
      go.disabled=true;
      try{ await Bio.enable(pw.value); toast('Face ID unlock is on.'); s.close(); Nav.refresh(); }
      catch(e){ go.disabled=false; toast(e.message||'Could not turn it on.'); }
    }});
    pw.addEventListener('keydown', e=>{ if(e.key==='Enter') go.click(); });
    const s = sheet('Confirm your password', [
      el(`<p class="plain">For your security, confirm your password to turn on Face ID unlock.</p>`),
      pw, go
    ]);
  },

  /* shared Settings screen (used by both apps) */
  openSettings(){
    Nav.go(()=>{
      const nodes=[];
      const s = Vault.state;
      nodes.push(el(`<p class="sub">Your info — used to find you online. Stays on this device.</p>`));
      const name = el(`<input type="text" placeholder="Your name" value="${esc(s.profile.name)}">`);
      const emails = el(`<input type="text" placeholder="Emails (comma separated)" value="${esc(s.profile.emails.join(', '))}">`);
      const phones = el(`<input type="text" placeholder="Phone numbers (comma separated)" value="${esc(s.profile.phones.join(', '))}">`);
      const city = el(`<input type="text" placeholder="City" value="${esc(s.profile.city)}">`);
      const st = el(`<input type="text" placeholder="State" value="${esc(s.profile.state)}">`);
      const save = BigBtn({title:'Save my info', primary:true, arrow:false, onClick:async ()=>{
        s.profile.name=name.value.trim();
        s.profile.emails=emails.value.split(',').map(x=>x.trim()).filter(Boolean);
        s.profile.phones=phones.value.split(',').map(x=>x.trim()).filter(Boolean);
        s.profile.city=city.value.trim(); s.profile.state=st.value.trim();
        await Vault.save(); toast('Saved'); Nav.back();
      }});
      nodes.push(el('<label>Name</label>'),name,el('<label>Emails</label>'),emails,
        el('<label>Phone</label>'),phones,el('<label>City</label>'),city,el('<label>State</label>'),st, save);

      nodes.push(el(`<div class="hr"></div>`));
      // Face ID toggle
      const faceRow = el(`<div></div>`);
      Bio.isEnabled().then(on=>{
        faceRow.appendChild(BigBtn({title: on?'Face ID / Touch ID is ON — turn off':'Turn on Face ID / Touch ID', arrow:false, onClick:async ()=>{
          if(on){ await Bio.disable(); toast('Turned off.'); Nav.refresh(); }
          else { Shell._enableFaceIdFromSettings(); }
        }}));
      });
      nodes.push(faceRow);

      nodes.push(BigBtn({title:'Lock now', arrow:false, onClick:()=>Shell.lockNow()}));
      nodes.push(el(`<div class="hr"></div>`));
      nodes.push(BigBtn({title:'Erase everything', sub:'Wipes this app from this device', arrow:false, onClick:()=>{
        confirmSheet('Erase everything?','This deletes all your saved info and your lock from this device. It cannot be undone.','Erase', async ()=>{
          await Vault.wipeEverything(); toast('Erased'); location.reload();
        });
      }}));
      return Screen('Settings', nodes);
    });
  }
};

window.Shell = Shell;
})();
