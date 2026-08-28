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
  to:(buf)=>btoa(String.fromCharCode(...new Uint8Array(buf))),
  from:(s)=>Uint8Array.from(atob(s), c=>c.charCodeAt(0)).buffer
};

// extractable=false for the live key (default). Face ID setup derives a
// separate, transient extractable copy only when it needs to wrap the key.
async function deriveKey(password, salt, extractable=false){
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:PBKDF2_ITERS, hash:'SHA-256'},
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
    const key = await deriveKey(password, new Uint8Array(b64.from(meta.salt)));
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
    const key = await deriveKey(password, new Uint8Array(b64.from(meta.salt)), true);
    const check = await aesDecrypt(key, meta.verifier).catch(()=>null);
    if(check !== VERIFIER_TEXT) throw new Error('wrong password');
    return crypto.subtle.exportKey('raw', key);
  },

  async load(){
    const blob = await kvGet('data');
    if(!blob){ this.state = freshState(); return; }
    const json = await aesDecrypt(this.key, blob);
    this.state = Object.assign(freshState(), JSON.parse(json));
  },

  async save(){
    if(!this.key) return;               // never write while locked
    const blob = await aesEncrypt(this.key, JSON.stringify(this.state));
    await kvSet('data', blob);
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
    profile:{ name:'', emails:[], phones:[], usernames:[], city:'', state:'' },
    ghost:{ brokers:{}, accounts:{}, unsubs:[] },  // brokers/accounts: id -> 'todo'|'sent'|'done'|'na'
    lock:{ checklist:{}, dnsDone:false },
    log:[]
  };
}

window.Vault = Vault;
