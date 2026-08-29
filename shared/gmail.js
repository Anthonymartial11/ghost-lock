/* gmail.js — Ghost's Gmail hookup. Security rules, in order:
 *
 * 1. LEAST ACCESS. Scopes: gmail.metadata (headers only — From, Subject,
 *    List-Unsubscribe; message bodies are NOT readable with this scope),
 *    gmail.send (send the unsubscribe emails you approve), email (show which
 *    account is connected). Nothing else.
 * 2. NO THIRD-PARTY CODE. The sign-in is a plain OAuth redirect to Google and
 *    back — no Google script is ever loaded into the app.
 * 3. TOKEN IN MEMORY ONLY. The access key Google returns lives in a variable,
 *    never in storage. Closing or reloading the app forgets it. It expires on
 *    its own within an hour. Disconnect revokes it at Google immediately.
 * 4. NO MIDDLEMAN. Every call goes browser -> googleapis.com over TLS.
 * 5. ASK-FIRST. Scanning and every send happen on your tap.
 */
(()=>{

const AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth';
const API        = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO   = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPES = [
  'email',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.send'
].join(' ');

let token = null;          // memory only
let tokenExp = 0;          // ms epoch
let account = '';          // connected email, memory only

const rndHex = (n)=>[...crypto.getRandomValues(new Uint8Array(n))].map(b=>b.toString(16).padStart(2,'0')).join('');

const Gmail = {
  configured(){ return !!(window.GMAIL_CONFIG && GMAIL_CONFIG.clientId); },
  connected(){ return !!token && Date.now() < tokenExp - 30000; },
  account(){ return account; },

  /* The redirect target must EXACTLY match what's registered in Google Cloud.
     Normalize so /ghost/ and /ghost/index.html both resolve to the same URI. */
  _redirectUri(){
    let p = location.pathname.replace(/index\.html$/, '');
    if(!p.endsWith('/')) p += '/';
    return location.origin + p;
  },

  /* Step out to Google's own sign-in page, come back with a short-lived key. */
  connect(){
    if(!this.configured()) return;
    const state = rndHex(16);
    try{ sessionStorage.setItem('gm_state', state); }catch(e){}
    const p = new URLSearchParams({
      client_id: GMAIL_CONFIG.clientId,
      redirect_uri: this._redirectUri(),
      response_type: 'token',
      scope: SCOPES,
      state,
      include_granted_scopes: 'true',
      prompt: 'consent'
    });
    location.href = AUTH_URL + '?' + p.toString();
  },

  /* Called at boot: if Google just sent us back, capture the key and scrub
     the address bar before anything else can see it. */
  handleRedirect(){
    if(!location.hash || location.hash.indexOf('access_token=') === -1) return false;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);   // scrub immediately
    let expect = null;
    try{ expect = sessionStorage.getItem('gm_state'); sessionStorage.removeItem('gm_state'); }catch(e){}
    if(!expect || h.get('state') !== expect) return false;                 // not a redirect we started
    if(h.get('error')) return false;
    const t = h.get('access_token');
    if(!t) return false;
    token = t;
    tokenExp = Date.now() + (parseInt(h.get('expires_in')||'3600',10) * 1000);
    fetch(USERINFO, {headers:{Authorization:'Bearer '+token}})
      .then(r=>r.ok?r.json():null).then(j=>{ if(j && j.email) account = j.email; }).catch(()=>{});
    return true;
  },

  async disconnect(){
    if(token){
      try{
        await fetch(REVOKE_URL, {
          method:'POST',
          headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body:'token='+encodeURIComponent(token)
        });
      }catch(e){}
    }
    token = null; tokenExp = 0; account = '';
  },

  /* One caller for every Google request. Distinguishes the failure modes:
     - not connected / 401  -> 'reconnect' (token is dead; clear it)
     - 403 / 429            -> back off and retry (usually rate-limit bursts);
                               if it never clears, surface 'reconnect'
     - network hiccup       -> retry; if it never clears, surface 'busy' */
  _backoff(attempt){ return new Promise(r=>setTimeout(r, 400*Math.pow(2,attempt) + Math.random()*250)); },

  async _call(url, opts){
    if(!this.connected()){ token=null; tokenExp=0; throw new Error('reconnect'); }
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { Authorization:'Bearer '+token });
    let sawForbidden = false;
    for(let attempt=0; attempt<4; attempt++){
      let r;
      try{ r = await fetch(url, opts); }
      catch(e){ await this._backoff(attempt); continue; }        // network blip -> retry
      if(r.status === 401){ token=null; tokenExp=0; throw new Error('reconnect'); }
      if(r.status === 403 || r.status === 429){ sawForbidden = (r.status===403); await this._backoff(attempt); continue; }
      if(!r.ok) throw new Error('http '+r.status);
      return r;
    }
    if(sawForbidden){ token=null; tokenExp=0; throw new Error('reconnect'); } // persistent 403 = likely revoked
    throw new Error('busy');                                                  // rate-limited / network
  },

  async _api(path){
    const r = await this._call(API + path);
    return r.json();
  },

  /* Scan marketing mail (Promotions category), headers only.
     Returns deduped senders: {name, email, count, mailto, link, subject} */
  async scan(onProgress){
    const ids = [];
    let pageToken = '';
    for(let page=0; page<2; page++){
      const q = new URLSearchParams({ maxResults:'100', labelIds:'CATEGORY_PROMOTIONS' });
      if(pageToken) q.set('pageToken', pageToken);
      const res = await this._api('/messages?'+q.toString());
      (res.messages||[]).forEach(m=>ids.push(m.id));
      pageToken = res.nextPageToken;
      if(!pageToken) break;
    }

    const total = ids.length;
    const senders = new Map();
    let done = 0, failed = 0;
    const worker = async ()=>{
      while(ids.length){
        const id = ids.shift();
        try{
          const m = await this._api('/messages/'+id+'?format=metadata'
            +'&metadataHeaders=From&metadataHeaders=List-Unsubscribe&metadataHeaders=Subject');
          const hs = {};
          ((m.payload||{}).headers||[]).forEach(h=>{ hs[h.name.toLowerCase()] = h.value; });
          const from = hs['from'] || '';
          const em = (from.match(/<([^>]+)>/) || [null, from.trim()])[1].toLowerCase();
          if(em && em.includes('@')){
            const name = from.replace(/<[^>]*>/,'').replace(/"/g,'').trim() || em;
            const unsub = hs['list-unsubscribe'] || '';
            const mailto = (unsub.match(/<mailto:([^>]+)>/i) || [])[1] || '';
            const link = (unsub.match(/<(https?:[^>]+)>/i) || [])[1] || '';
            const cur = senders.get(em) || {name, email:em, count:0, mailto:'', link:'', subject:hs['subject']||''};
            cur.count++;
            if(mailto) cur.mailto = mailto;
            if(link) cur.link = link;
            senders.set(em, cur);
          }
        }catch(e){
          if(e.message==='reconnect') throw e;   // dead token -> abort loudly
          failed++;                              // transient failure -> count it, keep going
        }
        done++; if(onProgress) onProgress(done, total);
      }
    };
    await Promise.all([worker(),worker(),worker(),worker()]);
    // Don't pass off a partial scan as a complete one: if too much failed,
    // the caller keeps the previous good scan instead of overwriting it.
    if(total > 0 && failed > Math.max(3, total*0.2)){
      const err = new Error('partial'); err.partial = true; throw err;
    }
    return [...senders.values()].sort((a,b)=>b.count-a.count);
  },

  /* Send the unsubscribe email a sender's List-Unsubscribe header asks for.
     Honors the mailto's own subject/body when given (some need an exact token). */
  async sendUnsubscribe(sender){
    if(!sender.mailto) throw new Error('no unsubscribe email address');
    const [addrRaw, qs] = sender.mailto.split('?');
    const params = new URLSearchParams(qs||'');
    // The unsubscribe header is attacker-controlled. Strip any CR/LF so nothing
    // can inject extra headers (Bcc, To, etc.) into the message we send, and
    // accept only a single, well-formed recipient address.
    const oneLine = (s)=>String(s||'').replace(/[\r\n]+/g,' ').trim();
    const addr = oneLine(addrRaw);
    if(!/^[^\s@,<>"]+@[^\s@,<>"]+\.[^\s@,<>"]+$/.test(addr)){
      throw new Error('unsafe unsubscribe address');   // refuse to send anywhere questionable
    }
    const subject = oneLine(params.get('subject')) || 'unsubscribe';
    const body = String(params.get('body') || 'Please unsubscribe this address from all mailing lists.');
    const raw =
      'To: ' + addr + '\r\n' +
      'Subject: ' + subject + '\r\n' +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      '\r\n' + body;
    const b64url = btoa(unescape(encodeURIComponent(raw)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await this._call(API + '/messages/send', {         // shares the expiry gate + 401->reconnect
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ raw: b64url })
    });
    return true;
  }
};

window.Gmail = Gmail;
})();
