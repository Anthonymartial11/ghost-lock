/* vault.js — encrypted, on-device storage. No server. No cleartext at rest.
 *
 * How the lock works:
 *  - Your password is turned into a key with PBKDF2 (600k rounds, SHA-256),
 *    following current OWASP guidance.
 *  - Everything you save is encrypted with AES-256-GCM using that key.
 *  - We store only: a random salt, a "verifier" (proves the password is right),
 *    and the encrypted blob. None of that reveals your password or your data.
 *  - Face ID / Touch ID unlock (optional) uses a passkey's PRF secret to wrap
 *    the key, so the device's Secure Enclave gates it. See auth.js.
 *
 * Each app keeps its OWN vault (own database name, set via window.GL_DB).
 * Ghost and Lock are independent: separate password, separate Face ID,
 * separate data. On iOS, Home Screen web apps are given isolated storage
 * anyway, so this is the honest, portable design — and a breach of one app
 * can never touch the other.
 *
 * The strength of the vault is the strength of YOUR PASSWORD times the KDF
 * cost. The owner code and the wrong-password time-outs are deterrents that
 * slow an attacker down; they are not what encrypts your data.
 */

const DB_NAME = (typeof window !== 'undefined' && window.GL_DB) ? window.GL_DB : 'ghostlock';
const STORE = 'kv';
const PBKDF2_ITERS = 600000;

function idb(){
  return new Promise((res, rej)=>{
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = ()=> r.result.createObjectStore(STORE);
    r.onsuccess = ()=> res(r.result);
    r.onerror = ()=> rej(r.error);
  });
}
async function kvGet(k){
  const db = await idb();
  return new Promise((res,rej)=>{
    const t = db.transaction(STORE,'readonly').objectStore(STORE).get(k);
    t.onsuccess=()=>res(t.result); t.onerror=()=>rej(t.error);
  });
}
async function kvSet(k,v){
  const db = await idb();
  return new Promise((res,rej)=>{
    const t = db.transaction(STORE,'readwrite').objectStore(STORE).put(v,k);
    t.onsuccess=()=>res(); t.onerror=()=>rej(t.error);
  });
}
async function kvDel(k){
  const db = await idb();
  return new Promise((res,rej)=>{
    const t = db.transaction(STORE,'readwrite').objectStore(STORE).delete(k);
    t.onsuccess=()=>res(); t.onerror=()=>rej(t.error);
  });
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = {
  // Chunked: spreading a large byte array into String.fromCharCode blows the
  // argument limit and throws, which would silently stop the vault saving.
  to:(buf)=>{
    const u8 = new Uint8Array(buf);
    let s = '';
    for(let i=0;i<u8.length;i+=0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i+0x8000));
    return btoa(s);
  },
  from:(s)=>Uint8Array.from(atob(s), c=>c.charCodeAt(0)).buffer
};

// extractable=false for the live key (default). Face ID setup derives a
// separate, transient extractable copy only when it needs to wrap the key.
// iters: new vaults use PBKDF2_ITERS; unlocking honors the count the vault
// was CREATED with (stored in meta), so an upgrade never locks the owner out.
async function deriveKey(password, salt, extractable=false, iters=PBKDF2_ITERS){
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:iters, hash:'SHA-256'},
    base,
    {name:'AES-GCM', length:256},
    extractable,
    ['encrypt','decrypt']
  );
}

async function aesEncrypt(key, plaintextStr){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(plaintextStr));
  return { iv:b64.to(iv), ct:b64.to(ct) };
}
async function aesDecrypt(key, obj){
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:new Uint8Array(b64.from(obj.iv))}, key, b64.from(obj.ct));
  return dec.decode(pt);
}

const VERIFIER_TEXT = 'ghostlock-ok';

const Vault = {
  key: null,            // live AES key (in memory only, non-extractable)
  state: null,          // decrypted app data (in memory only)

  async exists(){ return !!(await kvGet('meta')); },

  async create(password){
    if(await this.exists()) throw new Error('vault already exists'); // never clobber
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const verifier = await aesEncrypt(key, VERIFIER_TEXT);
    await kvSet('meta', { v:2, salt:b64.to(salt), iters:PBKDF2_ITERS, verifier });
    this.key = key;
    this.state = freshState();
    await this.save();
    return true;
  },

  async unlockWithPassword(password){
    const meta = await kvGet('meta');
    if(!meta) throw new Error('no vault');
    const key = await deriveKey(password, new Uint8Array(b64.from(meta.salt)), false, meta.iters || 250000);
    try{
      const check = await aesDecrypt(key, meta.verifier);
      if(check !== VERIFIER_TEXT) throw 0;
    }catch(e){ throw new Error('wrong password'); }
    this.key = key;
    await this.load();
    return true;
  },

  // used by Face ID unlock: recover the raw key bytes and import them (non-extractable)
  async unlockWithRawKey(rawKeyBuf){
    const key = await crypto.subtle.importKey('raw', rawKeyBuf, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
    const meta = await kvGet('meta');
    const check = await aesDecrypt(key, meta.verifier); // throws if wrong
    if(check !== VERIFIER_TEXT) throw new Error('bad key');
    this.key = key;
    await this.load();
    return true;
  },

  // Face ID setup only: re-derive an EXTRACTABLE key from the password (verified),
  // export its raw bytes for wrapping, then throw the key away. this.key is never
  // extractable, so a stray console call can't lift the permanent key.
  async rawKeyFromPassword(password){
    const meta = await kvGet('meta');
    if(!meta) throw new Error('no vault');
    const key = await deriveKey(password, new Uint8Array(b64.from(meta.salt)), true, meta.iters || 250000);
    const check = await aesDecrypt(key, meta.verifier).catch(()=>null);
    if(check !== VERIFIER_TEXT) throw new Error('wrong password');
    return crypto.subtle.exportKey('raw', key);
  },


  /* ---- Backup / restore -------------------------------------------------
     The export is the ENCRYPTED vault, byte for byte. It cannot be read
     without your password, so it is safe to store in iCloud, Files, or on a
     USB stick. This exists because phones evict web-app storage: without a
     backup, an eviction is permanent data loss. */
  async exportBackup(){
    const meta = await kvGet('meta');
    const data = await kvGet('data');
    if(!meta) throw new Error('nothing to back up');
    return JSON.stringify({
      format:'ghostlock-backup', v:1, app: DB_NAME,
      exported: new Date().toISOString(), meta, data: data || null
    }, null, 1);
  },

  /* Restores an encrypted backup. Does NOT unlock it — you still need the
     password the backup was made with. */
  async importBackup(text){
    let obj;
    try{ obj = JSON.parse(text); }catch(e){ throw new Error('That file is not a backup.'); }
    if(!obj || obj.format !== 'ghostlock-backup' || !obj.meta || !obj.meta.salt || !obj.meta.verifier){
      throw new Error('That file is not a Ghost/Lock backup.');
    }
    await kvSet('meta', obj.meta);
    if(obj.data) await kvSet('data', obj.data); else await kvDel('data');
    await kvDel('bio');      // the old device's Face ID wrap is meaningless here
    await kvDel('guard');
    this.lock();
    return true;
  },

  /* Has the browser promised not to evict our storage? */
  async storageIsPersistent(){
    try{ return !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); }
    catch(e){ return false; }
  },

  async load(){
    const blob = await kvGet('data');
    if(!blob){ this.state = freshState(); return; }
    const json = await aesDecrypt(this.key, blob);
    const loaded = Object.assign(freshState(), JSON.parse(json));
    // Older vaults won't have newer profile fields — fill the gaps rather than
    // leaving them undefined.
    loaded.profile = Object.assign(freshState().profile, loaded.profile || {});
    loaded.ghost = Object.assign(freshState().ghost, loaded.ghost || {});
    loaded.lock = Object.assign(freshState().lock, loaded.lock || {});
    this.state = loaded;
  },

  // Returns true if written, false if the app was locked mid-operation.
  // Callers that must know (batch sends) check the result.
  async save(){
    if(!this.key) return false;         // never write while locked
    const blob = await aesEncrypt(this.key, JSON.stringify(this.state));
    await kvSet('data', blob);
    return true;
  },

  lock(){ this.key=null; this.state=null; },

  async wipeEverything(){
    await kvDel('meta'); await kvDel('data'); await kvDel('bio'); await kvDel('guard');
    this.lock();
  },

  log(app, action){
    if(!this.state) return;
    this.state.log.unshift({ t:Date.now(), app, action });
    this.state.log = this.state.log.slice(0,300);
  }
};

function freshState(){
  return {
    /* The identifiers data brokers actually index you by. The more of these are
       filled, the harder it is for a company to claim they "couldn't locate"
       your record — which is the standard dodge. */
    profile:{ name:'', otherNames:'', birthYear:'', emails:[], phones:[],
              usernames:[], street:'', city:'', state:'', zip:'',
              pastAddresses:[], relatives:'' },
    ghost:{ brokers:{}, accounts:{}, unsubs:[], bigtech:{} },  // brokers/accounts: id -> 'todo'|'sent'|'done'|'na'
    lock:{ checklist:{}, dnsDone:false },
    log:[]
  };
}

window.Vault = Vault;
