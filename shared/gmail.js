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

  /* Scan bulk mail across ALL tabs — including Primary, because plenty of
     marketing sneaks in there — several pages deep, headers only. The human
     shield is the header filter, not the tab: a sender is listed ONLY if its
     mail carries a List-Unsubscribe header (bulk/marketing infrastructure).
     Real people's emails never have that header, so they can never appear,
     even when scanning Primary.
     Returns senders: {name, email, count, mailto, link, subject, lastSeen}
     where lastSeen is the newest message time (ms) — used for re-checks. */
  async scan(onProgress){
    const LABELS = ['CATEGORY_PERSONAL','CATEGORY_PROMOTIONS','CATEGORY_UPDATES','CATEGORY_SOCIAL'];
    const PAGES = 3;                 // up to 300 messages per tab (~1200 total)
    const idSet = new Set();
    for(const label of LABELS){
      let pageToken = '';
      for(let page=0; page<PAGES; page++){
        const q = new URLSearchParams({ maxResults:'100', labelIds: label });
        if(pageToken) q.set('pageToken', pageToken);
        const res = await this._api('/messages?'+q.toString());
        (res.messages||[]).forEach(m=>idSet.add(m.id));
        pageToken = res.nextPageToken;
        if(!pageToken) break;
      }
    }
    const ids = [...idSet];
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
          const when = parseInt(m.internalDate||'0',10) || 0;
          const from = hs['from'] || '';
          const em = (from.match(/<([^>]+)>/) || [null, from.trim()])[1].toLowerCase();
          if(em && em.includes('@')){
            const name = from.replace(/<[^>]*>/,'').replace(/"/g,'').trim() || em;
            const unsub = hs['list-unsubscribe'] || '';
            const mailto = (unsub.match(/<mailto:([^>]+)>/i) || [])[1] || '';
            const link = (unsub.match(/<(https?:[^>]+)>/i) || [])[1] || '';
            const cur = senders.get(em) || {name, email:em, count:0, mailto:'', link:'', subject:hs['subject']||'', lastSeen:0, hasUnsub:false};
            cur.count++;
            if(when > cur.lastSeen) cur.lastSeen = when;
            if(mailto){ cur.mailto = mailto; cur.hasUnsub = true; }
            if(link){ cur.link = link; cur.hasUnsub = true; }
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
    // Keep only real bulk senders (those that offer an unsubscribe channel).
    return [...senders.values()].filter(s=>s.hasUnsub).sort((a,b)=>b.count-a.count);
  },

  /* Parse a List-Unsubscribe mailto (attacker-controlled) into a SAFE target.
     Strips CR/LF so nothing can inject extra headers, and rejects anything that
     isn't a single well-formed address. */
  _parseMailto(mailto){
    if(!mailto) throw new Error('no unsubscribe email address');
    const [addrRaw, qs] = mailto.split('?');
    const params = new URLSearchParams(qs||'');
    const oneLine = (s)=>String(s||'').replace(/[\r\n]+/g,' ').trim();
    const addr = oneLine(addrRaw);
    if(!/^[^\s@,<>"]+@[^\s@,<>"]+\.[^\s@,<>"]+$/.test(addr)) throw new Error('unsafe unsubscribe address');
    const subject = oneLine(params.get('subject'));
    const body = params.get('body') != null ? String(params.get('body')) : '';
    return { addr, subject, body, hasParams: !!(subject || body) };
  },

  /* Build + send one plain-text email. `to`/`subject` are sanitized to a single
     header line; only a valid single recipient is allowed. */
  async sendRaw(to, subject, body){
    const oneLine = (s)=>String(s||'').replace(/[\r\n]+/g,' ').trim();
    const addr = oneLine(to);
    if(!/^[^\s@,<>"]+@[^\s@,<>"]+\.[^\s@,<>"]+$/.test(addr)) throw new Error('unsafe address');
    const raw =
      'To: ' + addr + '\r\n' +
      'Subject: ' + oneLine(subject) + '\r\n' +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      '\r\n' + String(body||'');
    const b64url = btoa(unescape(encodeURIComponent(raw)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await this._call(API + '/messages/send', {         // shares the expiry gate + 401->reconnect
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ raw: b64url })
    });
    return true;
  },

  /* Just the compliant unsubscribe the sender's header asks for. */
  async sendUnsubscribe(sender){
    const p = this._parseMailto(sender.mailto);
    return this.sendRaw(p.addr, p.subject || 'unsubscribe',
      p.body || 'Please unsubscribe this address from all mailing lists.');
  },

  /* Stop AND erase: unsubscribe + a CCPA/GDPR deletion demand.
     - If the header specifies an exact unsubscribe token (subject/body), we send
       that first (so the unsubscribe registers), then a separate deletion demand.
     - If we control the message, we send one combined demand. */
  async unsubscribeAndDelete(sender, deletionBody){
    const p = this._parseMailto(sender.mailto);
    if(p.hasParams){
      await this.sendRaw(p.addr, p.subject || 'unsubscribe',
        p.body || 'Please unsubscribe this address from all mailing lists.');
      await this.sendRaw(p.addr, 'Delete my data and stop selling it (CCPA/GDPR)', deletionBody);
    } else {
      await this.sendRaw(p.addr, 'Unsubscribe me and delete my data (CCPA/GDPR)', deletionBody);
    }
    return true;
  }
};

window.Gmail = Gmail;
})();
