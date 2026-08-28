/* tools.js — the working engine bits shared by Ghost and Lock.
 *
 * 1) Password breach check — uses the free "Pwned Passwords" k-anonymity API.
 *    Your password NEVER leaves the device. We hash it, send only the first
 *    5 characters of the hash, and check the returned list locally.
 * 2) Password strength — local, instant.
 * 3) Link checker — spots scam/phishing links with local rules. Nothing sent.
 * 4) Letter writer — generates legal-style "delete my data" demands (CCPA/GDPR).
 */

async function sha1Hex(str){
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}

const Tools = {

  /* ---- 1) breached password check (free, anonymous-by-design) ---- */
  async pwnedCount(password){
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0,5), suffix = hash.slice(5);
    const res = await fetch('https://api.pwnedpasswords.com/range/'+prefix, {
      headers:{'Add-Padding':'true'}
    });
    if(!res.ok) throw new Error('check unavailable');
    const text = await res.text();
    for(const line of text.split('\n')){
      const [suf, count] = line.trim().split(':');
      if(suf === suffix) return parseInt(count,10)||0;
    }
    return 0;
  },

  /* ---- 2) password strength (local) ---- */
  strength(pw){
    if(!pw) return {score:0, word:'Empty', why:['Type a password to check it.']};
    const why=[]; let score=0;
    if(pw.length>=16) score+=40; else if(pw.length>=12) score+=30; else if(pw.length>=8) score+=15;
    else why.push('Too short. 12+ characters is the big one.');
    if(/[a-z]/.test(pw)&&/[A-Z]/.test(pw)) score+=15; else why.push('Mix BIG and small letters.');
    if(/\d/.test(pw)) score+=10; else why.push('Add a number.');
    if(/[^A-Za-z0-9]/.test(pw)) score+=15; else why.push('Add a symbol like ! or #.');
    if(/(.)\1{2,}/.test(pw)){ score-=10; why.push('Repeated characters make it weaker.'); }
    if(/^(password|123456|qwerty|letmein|iloveyou|admin|welcome|abc123|football|monkey)/i.test(pw)){
      score=5; why.length=0; why.push('This is one of the most-guessed passwords on Earth.');
    }
    if(/(19|20)\d{2}/.test(pw)) { score-=5; why.push('Years (like birth years) are easy to guess.'); }
    score=Math.max(0,Math.min(100,score+20));
    const word = score>=80?'Strong': score>=55?'Okay': score>=30?'Weak':'Very weak';
    if(score>=80 && !why.length) why.push('Good. Long + mixed = hard to crack.');
    return {score, word, why};
  },

  /* ---- 3) scam link checker (local rules, nothing sent anywhere) ---- */
  checkLink(raw){
    const reasons=[]; let risk=0;
    let url;
    let s=(raw||'').trim();
    if(!s) return {risk:0, verdict:'Nothing to check', reasons:['Paste a link first.']};
    if(!/^https?:\/\//i.test(s)) s='http://'+s;
    try{ url=new URL(s); }catch(e){ return {risk:100, verdict:'Not a real link', reasons:['This is not a valid web address.']}; }

    const host=url.hostname.toLowerCase();

    if(url.protocol==='http:'){ risk+=20; reasons.push('Not secure (http, no padlock). Real sites use https.'); }
    if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)){ risk+=40; reasons.push('It goes to a raw number address, not a name. Big scam sign.'); }
    if(host.includes('xn--')){ risk+=40; reasons.push('Uses look-alike foreign letters to fake a real name.'); }
    if((host.match(/\./g)||[]).length>=3){ risk+=15; reasons.push('Lots of dots — scammers hide real names deep in the address.'); }
    if(url.href.includes('@')){ risk+=35; reasons.push('Has an @ — everything before it is fake, browser goes to what is after.'); }
    if(url.href.length>120){ risk+=10; reasons.push('Extremely long address — often used to hide the real target.'); }

    const shorteners=['bit.ly','tinyurl.com','goo.gl','t.co','ow.ly','is.gd','buff.ly','rebrand.ly','cutt.ly','rb.gy'];
    if(shorteners.includes(host)){ risk+=25; reasons.push('Shortened link — you cannot see where it really goes.'); }

    const badTlds=['.zip','.mov','.xyz','.top','.club','.work','.click','.link','.gq','.tk','.ml','.cf','.loan','.win','.vip'];
    if(badTlds.some(t=>host.endsWith(t))){ risk+=25; reasons.push('Ends in a cheap domain scammers love ('+host.slice(host.lastIndexOf('.'))+').'); }

    const brands=['paypal','apple','amazon','google','microsoft','netflix','bank','wellsfargo','chase','bofa','venmo','coinbase','fedex','ups','usps','irs'];
    const parts=host.split('.');
    const registered=parts.slice(-2).join('.');
    for(const brand of brands){
      if(host.includes(brand) && !registered.startsWith(brand+'.')){
        risk+=45; reasons.push(`Pretends to be ${brand[0].toUpperCase()+brand.slice(1)} but the real owner of this address is "${registered}".`);
        break;
      }
    }
    if(/login|verify|secure|account|update|confirm|wallet|invoice/i.test(url.pathname+url.search) && risk>0){
      risk+=15; reasons.push('Asks about logins/verifying — plus other red flags. Classic phishing.');
    }

    risk=Math.min(100,risk);
    const verdict = risk>=60?'DANGER — do not open': risk>=30?'Suspicious — be careful':'Looks okay';
    if(!reasons.length) reasons.push('No red flags found. Still: only log in on sites you typed yourself.');
    return {risk, verdict, reasons};
  },

  /* ---- 4) letter writer ---- */
  deletionLetter(brokerName, profile){
    const name = profile.name || '[YOUR NAME]';
    const emails = profile.emails.length? profile.emails.join(', ') : '[YOUR EMAIL]';
    const phones = profile.phones.length? profile.phones.join(', ') : '';
    const loc = [profile.city, profile.state].filter(Boolean).join(', ');
    return `To: ${brokerName} — Privacy / Data Protection Officer

Subject: Request to DELETE my personal information (CCPA / CPRA & GDPR)

To whom it may concern,

I am formally requesting that you:

1. DELETE all personal information you hold about me, under the California
   Consumer Privacy Act (CCPA/CPRA) and, where applicable, GDPR Article 17
   ("right to erasure").
2. STOP selling or sharing my personal information, under my right to opt out
   of sale/sharing.
3. TELL ME every third party you have sold, shared, or licensed my
   information to, so I can request deletion from them as well.
4. CONFIRM in writing when the deletion is complete.

Information to identify my records:
- Name: ${name}
- Email(s): ${emails}${phones?`\n- Phone(s): ${phones}`:''}${loc?`\n- Location: ${loc}`:''}

Please treat this as a verifiable consumer request. You are required to
respond within 45 days under the CCPA. Do not use this information for any
purpose other than processing this request.

Regards,
${name}`;
  },

  unsubscribeLetter(sender, profile){
    const email = profile.emails[0] || '[YOUR EMAIL]';
    return `To: ${sender}

Unsubscribe ${email} from ALL marketing lists immediately.

Under CAN-SPAM you must honor this within 10 business days. Also delete my
personal data from your marketing systems (CCPA/GDPR right to deletion) and
do not sell or share it.

${profile.name||''}`;
  }
};

window.Tools = Tools;
