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

/* The owner code is a per-DEVICE check, not a per-launch one. Once any part
   of the system (front page or either app) has verified it on this device,
   no screen here asks again. */
/* How long the app may stay unlocked after it leaves the screen.
   0 = lock instantly (safest). Stored per-device; not secret. */
function lockDelayMs(){
  try{ const v = parseInt(localStorage.getItem('gl_lock_delay')||'0',10); return isNaN(v)?0:v; }
  catch(e){ return 0; }
}
function setLockDelay(ms){ try{ localStorage.setItem('gl_lock_delay', String(ms)); }catch(e){} }

function ownerRemembered(){ try{ return localStorage.getItem('gl_owner_ok')==='1'; }catch(e){ return false; } }
function ownerDisabled(){ try{ return localStorage.getItem('gl_owner_off')==='1'; }catch(e){ return false; } }
function setOwnerDisabled(v){ try{ v ? localStorage.setItem('gl_owner_off','1') : localStorage.removeItem('gl_owner_off'); }catch(e){} }
function rememberOwner(){ try{ localStorage.setItem('gl_owner_ok','1'); localStorage.setItem('gl_gate','1'); }catch(e){} }
function fmtLeft(ms){
  const s = Math.ceil(ms/1000);
  return s>=60 ? Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s' : s+'s';
}

const Shell = {
  cfg:null,

  hideCount:0,          // bumped every time the app is backgrounded

  async boot(cfg){
    this.cfg = cfg;                      // { name, glyph, renderHome, sibling:{name,url} }
    Nav.init(document.getElementById('root'));
    // ask the browser to protect our storage from eviction (vault must survive)
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
    // security: lock the moment the app is hidden/backgrounded — UNLESS we
    // ourselves just opened an external link (the user tapped a button that
    // opens a removal page etc.), which also fires visibilitychange.
    // ALWAYS lock when the app leaves the screen — no exceptions. Opening an
    // external link is no longer an excuse to stay unlocked: coming back is one
    // Face ID tap, and a backgrounded-but-unlocked app is exactly what a thief
    // (or anyone who picks up the phone) needs.
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden){
        this.hideCount++;
        this.closeSheets();                    // never leave content on screen
        const grace = lockDelayMs();
        if(grace <= 0){ this.lockNow(true); return; }
        // Grace period: stay unlocked briefly so hopping to the other app (or
        // opening a link) doesn't force a re-unlock. We record WHEN we left —
        // a background timer can't be trusted on iOS, so we check on return.
        this._hiddenAt = Date.now();
        this._graceTimer = setTimeout(()=>this.lockNow(true), grace);
      } else {
        clearTimeout(this._graceTimer);
        const grace = lockDelayMs();
        if(this._hiddenAt && (grace <= 0 || Date.now() - this._hiddenAt > grace)) this.lockNow(true);
        this._hiddenAt = 0;
      }
    });
    window.addEventListener('pagehide', ()=>{ this.hideCount++; this.lockNow(true); });

    if(await Vault.exists()) this.showUnlock();
    else this.showSetup();
  },

  // Open an external URL. The app locks behind you (see visibilitychange) —
  // that's deliberate. Scheme guard: only ordinary web/mail targets.
  openExternal(url){
    if(!/^(https?:|mailto:)/i.test(String(url||''))) return;
    window.open(url, '_blank', 'noopener');
  },


  /* ---------------- switching between Ghost and Lock ----------------
     On iPhone, an installed web app cannot launch ANOTHER installed web app —
     iOS provides no way to do it. Worse, navigating out of our scope opens the
     other app inside THIS one's browser view, with a different storage box, so
     it looks brand new and asks to be set up. That is a trap, so in an
     installed app we explain instead of navigating. In a normal browser tab the
     link works fine, so we just go. */
  isInstalled(){
    try{
      return (window.matchMedia && matchMedia('(display-mode: standalone)').matches)
             || window.navigator.standalone === true;
    }catch(e){ return false; }
  },

  goSibling(name, url){
    if(!this.isInstalled()){ location.href = url; return; }
    const isPhone = /iPhone|iPad|iPod/.test(navigator.userAgent);
    sheet('Switch to ' + name, [
      el(`<p class="plain"><b>${esc(name)}</b> is its own app with its own icon \u2014 they are deliberately separate so a problem in one can never reach the other.</p>`),
      isPhone
        ? el(`<p class="plain"><b>Fastest way:</b> swipe up from the bottom of the screen and hold, then pick ${esc(name)}. Or tap its icon on your Home Screen.</p>`)
        : el(`<p class="plain"><b>Fastest way:</b> use the Dock, or \u2318\u21E5 (Command\u2013Tab) and pick ${esc(name)}.</p>`),
      el(`<div class="card"><h3>Don\u2019t open it in here</h3>
        <p style="color:var(--fg)">If you open ${esc(name)} inside this app it loads in a browser window with separate storage \u2014 it will look empty and ask you to set it up again. Always use its own icon.</p></div>`),
      BigBtn({title:'Got it', primary:true, arrow:false, onClick:()=>Shell.closeSheets()}),
      BigBtn({title:'Open it here anyway', sub:'Only if ' + esc(name) + ' is not installed on this device', arrow:false, onClick:()=>{ Shell.closeSheets(); location.href = url; }})
    ]);
  },

  /* Top-bar pill. */
  switchPill(name, url){
    const b = el(`<button class="switch">${esc(name)} \u203A</button>`);
    b.onclick = ()=> this.goSibling(name, url);
    return b;
  },

  /* Big, thumb-reachable version for the bottom of the home screen — the top
     corner is hard to reach one-handed on a large phone. */
  switchTile(name, url, blurb){
    return BigBtn({title:'Open ' + name, sub: blurb, onClick:()=> this.goSibling(name, url)});
  },

  closeSheets(){
    document.querySelectorAll('.sheet, .sheet-bg').forEach(n=>n.remove());
  },

  lockNow(silent){
    this.closeSheets();                 // never leave vault content/buttons over the lock screen
    try{ if(window.Gmail) Gmail.forget(); }catch(e){}   // Gmail key dies with the lock
    if(!Vault.key) return;
    Vault.lock();
    if(!silent) toast('Locked');
    this.showUnlock();
  },

  /* ---------------- SETUP (first run on a device) ---------------- */
  showSetup(){
    const needCode = !!(window.OWNER && window.OWNER.hashHex) && !ownerRemembered() && !ownerDisabled();
    Nav.reset(()=>{
      const oc = el(`<input type="password" placeholder="Owner code" autocomplete="off" autocapitalize="characters">`);
      const p1 = el(`<input type="password" placeholder="Make a password" autocomplete="new-password">`);
      const p2 = el(`<input type="password" placeholder="Type it again" autocomplete="new-password">`);
      const create = BigBtn({title:'Create my lock', primary:true, arrow:false, onClick:async ()=>{
        if((p1.value||'').length<10) return toast('Use at least 10 characters. A short phrase is best.');
        if(p1.value!==p2.value) return toast('The two do not match');
        create.disabled=true; create.querySelector('.txt').textContent='Checking…';
        try{
          if(needCode){
            if(!(await ownerOk(oc.value))){
              create.disabled=false; create.querySelector('.txt').textContent='Create my lock';
              return toast('Wrong owner code. This app belongs to its owner.');
            }
            rememberOwner();   // this device is now trusted — never ask again here
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
      nodes.push(p1, p2, create);

      // Restoring an encrypted backup needs NO owner code — the backup is
      // useless without the password it was made with, so the code adds nothing
      // here and would only lock the owner out of their own data.
      const restore = el(`<input type="file" accept=".json,application/json" style="display:none">`);
      restore.addEventListener('change', async ()=>{
        const f = restore.files && restore.files[0]; if(!f) return;
        try{
          await Vault.importBackup(await f.text());
          toast('Backup restored. Unlock with that backup\u2019s password.');
          this.showUnlock();
        }catch(e){ toast(e.message || 'Could not read that backup.'); }
        finally{ try{ restore.value=''; }catch(e){} }
      });
      nodes.push(el(`<div class="hr"></div>`));
      nodes.push(BigBtn({title:'Restore from a backup', sub:'Been here before? Bring your data back. No owner code needed.', arrow:false, onClick:()=>restore.click()}));
      nodes.push(restore);

      if(needCode){
        nodes.push(BigBtn({title:'I don\u2019t have my owner code', arrow:false, onClick:()=>{
          sheet('Where your owner code lives', [
            el(`<p class="plain">The owner code is only asked when setting this app up on a device for the first time. It is <b>not</b> what protects your data \u2014 your password does that.</p>`),
            el(`<p class="plain">You were given it when these apps were built, and it is written in the project notes on your Mac:</p>`),
            el(`<p class="plain mono" style="font-size:15px">~/ghost-lock/OWNER-CODE.txt</p>`),
            el(`<p class="plain">Once you are in, you can switch the code off entirely from <b>Settings</b> so this never blocks you again.</p>`)
          ]);
        }}));
      }
      nodes.push(el(`<p class="center-note">Use a phrase you'll remember — the longer, the stronger.<br>There is no "forgot password". That is what keeps it safe.</p>`));
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

    Bio.isEnabled().then(async on=>{
      if(on){ scr.querySelector('#faceBtn').style.display='flex'; return; }
      usePw.style.display='none'; pw.style.display='block'; pwBtn.style.display='flex';
      // Face ID turns every unlock into one tap — the real fix for re-unlocking
      // when you switch apps. Offer it if the device supports it.
      if(await Bio.platformAvailable()){
        const tip = el(`<p class="center-note">Tip: turn on Face ID in Settings — unlocking becomes one tap.</p>`);
        scr.lastElementChild.appendChild(tip);
      }
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
      const stg = window.Profile ? Profile.strength(Vault.state.profile) : null;
      nodes.push(BigBtn({title:'My details',
        sub: stg ? `Demand strength ${stg.pct}% — the info your removal letters use` : 'The info your removal letters use',
        onClick:()=>Nav.go(Profile.render)}));

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

      // ---- how quickly it locks ----
      nodes.push(el(`<div class="hr"></div>`));
      nodes.push(el(`<p class="sub">Locking when you leave the app</p>`));
      const DELAYS = [[0,'Instantly','Safest. You unlock every time you come back.'],
                      [60000,'After 1 minute','Hop to the other app and back without unlocking.'],
                      [300000,'After 5 minutes','Most convenient. Least safe if the phone is taken.']];
      const cur = lockDelayMs();
      for(const [ms,label,blurb] of DELAYS){
        const on = cur === ms;
        const b = BigBtn({title:(on?'\u2713 ':'')+label, sub:blurb, arrow:false, onClick:()=>{
          setLockDelay(ms); toast('Saved.'); Nav.refresh();
        }});
        nodes.push(b);
      }
      nodes.push(el(`<p class="tiny">While the app is waiting to lock, its contents stay decrypted in memory \u2014 that is the trade. Anything above "Instantly" means someone who picks up your unlocked phone within that window gets in. Face ID makes "Instantly" almost painless.</p>`));

      // ---- backup ----
      nodes.push(el(`<div class="hr"></div>`));
      nodes.push(el(`<p class="sub">Your data lives only on this device. Phones sometimes clear web-app storage \u2014 a backup is the only protection against that.</p>`));

      const persistNote = el(`<p class="tiny"></p>`);
      Vault.storageIsPersistent().then(p=>{
        persistNote.textContent = p
          ? 'This device has agreed to keep your data (storage marked persistent).'
          : 'Warning: this device has NOT guaranteed to keep your data. Back up now, and keep the file.';
      });
      nodes.push(persistNote);

      nodes.push(BigBtn({title:'Back up my data', sub:'Encrypted file \u2014 useless without your password', arrow:false, onClick:async ()=>{
        try{
          const text = await Vault.exportBackup();
          const name = (window.GL_DB||'ghostlock') + '-backup-' + new Date().toISOString().slice(0,10) + '.json';
          const blob = new Blob([text], {type:'application/json'});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = name;
          document.body.appendChild(a); a.click();
          setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          toast('Backup saved. Keep it somewhere safe.');
        }catch(e){ toast('Could not create a backup.'); }
      }}));

      const restoreS = el(`<input type="file" accept=".json,application/json" style="display:none">`);
      restoreS.addEventListener('change', async ()=>{
        const f = restoreS.files && restoreS.files[0]; if(!f) return;
        const txt = await f.text();
        confirmSheet('Replace everything on this device?',
          'This overwrites this app\u2019s current data with the backup. You will need the password that backup was made with.',
          'Restore', async ()=>{
            try{ await Vault.importBackup(txt); toast('Restored. Unlock with that backup\u2019s password.'); location.reload(); }
            catch(e){ toast(e.message || 'Could not read that backup.'); }
          });
        try{ restoreS.value=''; }catch(e){}
      });
      nodes.push(BigBtn({title:'Restore from a backup', arrow:false, onClick:()=>restoreS.click()}));
      nodes.push(restoreS);

      // ---- owner code switch ----
      if(window.OWNER && window.OWNER.hashHex){
        const offNow = ownerDisabled();
        nodes.push(el(`<div class="hr"></div>`));
        nodes.push(BigBtn({title: offNow ? 'Owner code: OFF \u2014 turn back on' : 'Owner code: ON \u2014 turn off',
          sub: offNow ? 'Setup on this device will not ask for it' : 'Stops it ever locking you out of your own app',
          arrow:false, onClick:()=>{
            if(offNow){ setOwnerDisabled(false); toast('Owner code back on.'); Nav.refresh(); }
            else confirmSheet('Turn the owner code off?',
              'It only gates first-time setup and can be bypassed by a technical attacker anyway \u2014 your password is what actually protects your data. Turning it off means you can never be locked out by a lost code.',
              'Turn it off', ()=>{ setOwnerDisabled(true); toast('Owner code off.'); Nav.refresh(); });
          }}));
      }

      nodes.push(el(`<div class="hr"></div>`));
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
