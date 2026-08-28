/* vault.js — encrypted, on-device storage. No server. No cleartext at rest.
 *
 * How the lock works:
 *  - Your password is turned into a key with PBKDF2 (250k rounds, SHA-256).
 *  - Everything you save is encrypted with AES-GCM using that key.
 *  - We store only: a random salt, a "verifier" (proves the password is right),
 *    and the encrypted blob. None of that reveals your password or your data.
 *  - Face ID / Touch ID unlock (optional) uses a passkey's PRF secret to wrap
 *    the key, so the phone's Secure Enclave gates it. See auth.js.
 *
 * Both apps (Ghost + Lock) share ONE vault because they live on the same origin.
 * That's on purpose: set your password once, unlock both, one shared profile.
 */

const DB_NAME = 'ghostlock';
const STORE = 'kv';

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

async function deriveKey(password, salt){
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:250000, hash:'SHA-256'},
    base,
    {name:'AES-GCM', length:256},
    true,                       // extractable so Face ID setup can wrap it
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
  key: null,            // live AES key (in memory only)
  state: null,          // decrypted app data (in memory only)

  async exists(){ return !!(await kvGet('meta')); },

  async create(password){
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const verifier = await aesEncrypt(key, VERIFIER_TEXT);
    await kvSet('meta', { v:1, salt:b64.to(salt), verifier });
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

  // used by Face ID unlock: it recovers the raw key bytes and imports them
  async unlockWithRawKey(rawKeyBuf){
    const key = await crypto.subtle.importKey('raw', rawKeyBuf, {name:'AES-GCM'}, true, ['encrypt','decrypt']);
    const meta = await kvGet('meta');
    const check = await aesDecrypt(key, meta.verifier); // throws if wrong
    if(check !== VERIFIER_TEXT) throw new Error('bad key');
    this.key = key;
    await this.load();
    return true;
  },

  async exportRawKey(){ return crypto.subtle.exportKey('raw', this.key); },

  async load(){
    const blob = await kvGet('data');
    if(!blob){ this.state = freshState(); return; }
    const json = await aesDecrypt(this.key, blob);
    this.state = Object.assign(freshState(), JSON.parse(json));
  },

  async save(){
    const blob = await aesEncrypt(this.key, JSON.stringify(this.state));
    await kvSet('data', blob);
  },

  lock(){ this.key=null; this.state=null; },

  async wipeEverything(){
    await kvDel('meta'); await kvDel('data'); await kvDel('bio');
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
    ghost:{ brokers:{}, accounts:{}, unsubs:[] },  // brokers/accounts: id -> 'todo'|'sent'|'done'
    lock:{ checklist:{}, dnsDone:false },
    log:[]
  };
}

window.Vault = Vault;
