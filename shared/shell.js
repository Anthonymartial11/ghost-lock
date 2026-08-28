/* shell.js — the shared lock. Setup, Face ID / password unlock, auto-lock.
   Both Ghost and Lock boot through here so the security is identical.

   Owner-only protections:
   - Setting up a NEW device requires the owner code (see shared/owner.js).
     Strangers who find the public URL can't even start using the app.
   - Wrong password attempts trigger escalating time-outs (30s → 1m → 5m →
     15m → 1h), remembered across restarts. Face ID is never delayed — your
     face can't be "guessed".
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

  async boot(cfg){
    this.cfg = cfg;                      // { name, glyph, renderHome }
    Nav.init(document.getElementById('root'));
    // security: lock the moment the app is hidden/backgrounded
    document.addEventListener('visibilitychange', ()=>{ if(document.hidden) this.lockNow(true); });
    window.addEventListener('pagehide', ()=> this.lockNow(true));

    if(await Vault.exists()) this.showUnlock();
    else this.showSetup();
  },

  lockNow(silent){
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
        if((p1.value||'').length<6) return toast('Use at least 6 characters');
        if(p1.value!==p2.value) return toast('The two do not match');
        create.disabled=true; create.querySelector('.txt').textContent='Checking…';
        try{
          if(needCode && !(await ownerOk(oc.value))){
            create.disabled=false; create.querySelector('.txt').textContent='Create my lock';
            return toast('Wrong owner code. This app belongs to its owner.');
          }
          create.querySelector('.txt').textContent='Setting up…';
          await Vault.create(p1.value);
          await guardClear();
          Vault.log(this.cfg.name,'Created the lock');
          await Vault.save();
          this.afterUnlock(true);
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
        el(`<p class="center-note">Pick something you will remember.<br>There is no "forgot password" — that is what keeps it safe.</p>`));
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

    const faceBtn = BigBtn({ico:'☺', title:'Unlock with Face ID', primary:true, arrow:false,
      onClick:()=>this._tryFaceId(false)});
    faceBtn.id='faceBtn'; faceBtn.style.display='none';
    nodes.push(faceBtn);

    const pw = el(`<input type="password" placeholder="Password" autocomplete="current-password">`);
    pw.style.display='none';
    const pwBtn = BigBtn({title:'Unlock', primary:true, arrow:false, onClick:async ()=>{
      const g = await guardGet();
      if(g.until > Date.now()) return toast('Too many tries. Wait '+fmtLeft(g.until-Date.now()));
      try{
        await Vault.unlockWithPassword(pw.value);
        await guardClear();
        this.afterUnlock(false);
      }catch(e){
        const g2 = await guardFail();
        pw.value='';
        if(g2.until > Date.now()){ toast('Wrong password. Locked for '+fmtLeft(g2.until-Date.now())); tick(); }
        else toast('Wrong password'+(g2.fails>=3?` (${5-g2.fails} tries before a time-out)`:''));
        pw.focus();
      }
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
        waitNote.textContent = '⏳ Too many wrong tries. Password locked for '+fmtLeft(left)+'.';
        setTimeout(()=>{ if(waitNote.isConnected) tick(); }, 1000);
      } else {
        waitNote.style.display='none';
      }
    };
    tick();
    return scr;
  },

  async _tryFaceId(auto){
    try{
      await Bio.unlock();
      await guardClear();
      this.afterUnlock(false);
    }catch(e){
      if(!auto) toast('Face ID failed — use your password');
    }
  },

  afterUnlock(isNew){
    Vault.log(this.cfg.name, 'Unlocked');
    Vault.save();
    if(isNew) this._offerFaceId();
    else Nav.reset(this.cfg.renderHome);
  },

  async _offerFaceId(){
    const ok = await Bio.platformAvailable();
    if(!ok){ Nav.reset(this.cfg.renderHome); return; }
    Nav.reset(()=> Screen(this.cfg.name, [
      el(`<div style="text-align:center;margin:20px 0"><div class="glyph">☺</div></div>`),
      el(`<p class="big" style="text-align:center">Use Face ID?</p>`),
      el(`<p class="sub" style="text-align:center">Unlock fast with your face or fingerprint. Your password still works too.</p>`),
      el(`<div class="hr"></div>`),
      BigBtn({title:'Turn on Face ID', primary:true, arrow:false, onClick:async ()=>{
        try{ await Bio.enable(); toast('Face ID is on'); }
        catch(e){ toast(e.message||'Could not turn on Face ID'); }
        Nav.reset(this.cfg.renderHome);
      }}),
      BigBtn({title:'Not now', arrow:false, onClick:()=>Nav.reset(this.cfg.renderHome)})
    ], {back:false}));
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
        faceRow.appendChild(BigBtn({ico:'☺', title: on?'Face ID is ON — turn off':'Turn on Face ID', arrow:false, onClick:async ()=>{
          if(on){ await Bio.disable(); toast('Face ID off'); }
          else { try{ await Bio.enable(); toast('Face ID on'); }catch(e){ toast(e.message);} }
          Nav.refresh();
        }}));
      });
      nodes.push(faceRow);

      nodes.push(BigBtn({ico:'🔒', title:'Lock now', arrow:false, onClick:()=>Shell.lockNow()}));
      nodes.push(el(`<div class="hr"></div>`));
      nodes.push(BigBtn({ico:'🗑', title:'Erase everything', sub:'Wipes this app from this device', arrow:false, onClick:()=>{
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
