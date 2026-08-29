/* gate.js — the front-page owner-code wall. A separate file (not inline) so the
   page can enforce script-src 'self': injected scripts can never run here. */
(()=>{
  const code = document.getElementById('code');
  const btn = document.getElementById('enter');
  const msg = document.getElementById('msg');
  const gate = document.getElementById('gate');
  const menu = document.getElementById('menu');

  const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
                  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };

  // Hide install instructions when running AS an installed app, or once dismissed.
  const installed = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const install = document.getElementById('install');
  if(installed || store.get('gl_install_done')==='1') install.remove();
  else document.getElementById('hideInstall').addEventListener('click', ()=>{ store.set('gl_install_done','1'); install.remove(); });

  // A device that has passed the gate once stays trusted (per-browser, local only).
  if(store.get('gl_gate')==='1' || store.get('gl_owner_ok')==='1'){ gate.remove(); menu.hidden = false; }

  async function ok(v){
    const O = window.OWNER;
    if(!O || !O.hashHex) return true;
    if(!(crypto && crypto.subtle)){ msg.textContent='Open this page over https.'; return false; }
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(v.trim()), 'PBKDF2', false, ['deriveBits']);
    const salt = Uint8Array.from(O.saltHex.match(/.{2}/g).map(x=>parseInt(x,16)));
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt, iterations:O.iterations, hash:'SHA-256'}, base, 256);
    const hex = [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
    return hex === O.hashHex.toLowerCase();
  }

  async function go(){
    if(!code.value) return;
    btn.disabled = true; msg.textContent = 'Checking…';
    try{
      if(await ok(code.value)){ store.set('gl_gate','1'); store.set('gl_owner_ok','1'); gate.remove(); menu.hidden = false; }
      else { msg.textContent = 'Wrong owner code.'; code.value=''; code.focus(); }
    }catch(e){ msg.textContent = 'Could not check. Try again.'; }
    btn.disabled = false;
    if(msg.textContent==='Checking…') msg.textContent='';
  }
  btn.addEventListener('click', go);
  code.addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
})();
