/* auth.js — Face ID / Touch ID unlock using a passkey (WebAuthn) + PRF.
 *
 * Plain English:
 *  - When you turn on Face ID, we create a passkey on THIS device. The phone's
 *    Secure Enclave keeps it. We ask that passkey for a secret (the "PRF"),
 *    and use that secret to lock a copy of your vault key.
 *  - To unlock, Face ID proves it's you, the passkey hands back the same secret,
 *    we unlock the key, and you're in — no password typing.
 *  - Nothing leaves the device. If Face ID isn't available, your password still
 *    works and always will.
 */

const RP_ID = location.hostname;              // e.g. "localhost" or your domain
const b = {
  to:(buf)=>btoa(String.fromCharCode(...new Uint8Array(buf))),
  from:(s)=>Uint8Array.from(atob(s), c=>c.charCodeAt(0)).buffer
};

const Bio = {
  supported(){ return !!(window.PublicKeyCredential && navigator.credentials); },

  async platformAvailable(){
    try{ return this.supported() &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch(e){ return false; }
  },

  async isEnabled(){ return !!(await kvGet('bio')); },

  // Turn on Face ID unlock. Requires the password (re-auth) so we can wrap a
  // transient extractable copy of the key without ever making the live key
  // extractable. Vault must be unlocked.
  async enable(password){
    if(!Vault.key) throw new Error('unlock first');
    if(!password) throw new Error('password required');
    const rawVaultKey = await Vault.rawKeyFromPassword(password); // throws on wrong password
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const userId  = crypto.getRandomValues(new Uint8Array(16));

    // ---- Reuse the passkey the sibling app already made, if there is one ----
    // A passkey is scoped to the DOMAIN, not the folder, so the one enrolled in
    // Ghost is usable by Lock and vice versa. Reusing it means you set Face ID
    // up ONCE for both apps.
    // Security note: each app still uses its OWN random PRF salt, so each app
    // derives a DIFFERENT wrapping key. One face, but two independent locks —
    // the vaults stay cryptographically separate.
    try{
      const found = await navigator.credentials.get({ publicKey:{
        rpId: RP_ID,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        userVerification: 'required',
        timeout: 60000,
        extensions:{ prf:{ eval:{ first: prfSalt } } }
      }});
      const fx = found && found.getClientExtensionResults().prf;
      if(fx && fx.results && fx.results.first){
        const wrapKey0 = await this._wrapKeyFrom(fx.results.first);
        const iv0 = crypto.getRandomValues(new Uint8Array(12));
        const wrapped0 = await crypto.subtle.encrypt({name:'AES-GCM',iv:iv0}, wrapKey0, rawVaultKey);
        await kvSet('bio', {
          credId: b.to(found.rawId), prfSalt: b.to(prfSalt),
          iv: b.to(iv0), wrapped: b.to(wrapped0), reused: true
        });
        return true;                       // done — no second passkey created
      }
    }catch(e){ /* nothing to reuse, or the user dismissed it — enrol fresh below */ }

    const cred = await navigator.credentials.create({ publicKey:{
      rp:{ id:RP_ID, name:'Ghost + Lock' },
      user:{ id:userId, name:'you@device', displayName:'You' },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{
        authenticatorAttachment:'platform',
        userVerification:'required',
        residentKey:'required'
      },
      timeout:60000,
      extensions:{ prf:{ eval:{ first: prfSalt } } }
    }});

    const ext = cred.getClientExtensionResults();
    const prf = ext.prf;
    if(!prf || (!prf.enabled && !(prf.results && prf.results.first))){
      throw new Error('This browser can\'t use Face ID to unlock (no PRF). Your password still works.');
    }

    // Get the PRF secret. Unlock always uses the get()/assertion path, so a
    // secret obtained from an assertion here is representative and needs no
    // extra check. A secret returned by create() can differ from get()-time on
    // some authenticators, so in that case verify with one real assertion
    // before we trust it — otherwise we'd report "Face ID is on" for a setup
    // that silently fails at the lock screen later.
    let secret = prf.results && prf.results.first;
    const secretFromCreate = !!secret;
    if(!secret){
      secret = (await this._assert(cred.rawId, prfSalt)).secret;
    }
    const wrapKey = await this._wrapKeyFrom(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({name:'AES-GCM',iv}, wrapKey, rawVaultKey);

    if(secretFromCreate){
      const check = await this._assert(cred.rawId, prfSalt);
      const verifyKey = await this._wrapKeyFrom(check.secret);
      let ok = false;
      try{
        const back = await crypto.subtle.decrypt({name:'AES-GCM', iv}, verifyKey, wrapped);
        ok = b.to(back) === b.to(rawVaultKey);
      }catch(e){ ok = false; }
      if(!ok) throw new Error('Face ID could not be verified on this device. Your password still works.');
    }

    await kvSet('bio', {
      credId: b.to(cred.rawId),
      prfSalt: b.to(prfSalt),
      iv: b.to(iv),
      wrapped: b.to(wrapped)
    });
    return true;
  },

  async disable(){ await kvDel('bio'); },

  // Unlock the vault with Face ID. Returns true on success.
  async unlock(){
    const rec = await kvGet('bio');
    if(!rec) throw new Error('Face ID not set up');
    const { secret } = await this._assert(b.from(rec.credId), new Uint8Array(b.from(rec.prfSalt)));
    const wrapKey = await this._wrapKeyFrom(secret);
    const rawVaultKey = await crypto.subtle.decrypt(
      {name:'AES-GCM', iv:new Uint8Array(b.from(rec.iv))}, wrapKey, b.from(rec.wrapped)
    );
    await Vault.unlockWithRawKey(rawVaultKey);
    return true;
  },

  async _assert(credIdBuf, prfSalt){
    const assertion = await navigator.credentials.get({ publicKey:{
      rpId:RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials:[{ id:credIdBuf, type:'public-key' }],
      userVerification:'required',
      timeout:60000,
      extensions:{ prf:{ eval:{ first: prfSalt } } }
    }});
    const prf = assertion.getClientExtensionResults().prf;
    if(!prf || !prf.results || !prf.results.first) throw new Error('Face ID secret unavailable');
    return { secret: prf.results.first };
  },

  async _wrapKeyFrom(secretBuf){
    const base = await crypto.subtle.importKey('raw', secretBuf, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'HKDF', hash:'SHA-256', salt:new Uint8Array(0), info:new TextEncoder().encode('ghostlock-wrap')},
      base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']
    );
  }
};

window.Bio = Bio;
