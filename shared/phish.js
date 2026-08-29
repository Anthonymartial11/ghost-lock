/* phish.js — the shared phishing brain. Ghost uses it before opening ANY link
   from an email; Lock uses it for the paste-a-link checker.
 *
 * Honest scope: this inspects the link itself, on your device, without visiting
 * it. It cannot see the page's contents, and it is not a malware scanner —
 * nothing in a browser can be. What it does is catch the shapes real phishing
 * takes, and refuse to open the ones that look like traps.
 *
 * Scoring: 0-100. >=60 = BLOCK (Ghost refuses to open it at all).
 *          30-59 = WARN (explicit confirm, with reasons).
 *          <30   = OK (still shows the destination).
 */
(()=>{

// Big legit email-sending platforms: marketing links legitimately pass through
// these, so a mismatch with the sender's domain is NOT suspicious by itself.
const ESP_HOSTS = [
  'list-manage.com','mailchimp.com','sendgrid.net','sparkpostmail.com','mailgun.org',
  'cmail1.com','cmail2.com','cmail19.com','cmail20.com','createsend.com','campaign-archive.com',
  'hubspotemail.net','hs-sites.com','klaviyomail.com','klaviyo.com','mandrillapp.com',
  'salesforce.com','exacttarget.com','et.exacttarget.com','pardot.com','marketo.com','mktoresp.com',
  'constantcontact.com','rs6.net','aweber.com','getresponse.com','activehosted.com',
  'braze.com','iterable.com','customeriomail.com','postmarkapp.com','amazonses.com','sendinblue.com',
  'brevo.com','substack.com','beehiiv.com','ghost.io','convertkit-mail.com','icptrack.com',
  'shopifyemail.com','squarespace.com','wixsite.com','intercom-mail.com','zendesk.com'
];

// Cheap/abused TLDs that overwhelmingly host throwaway phishing infrastructure.
const RISKY_TLDS = ['.zip','.mov','.xyz','.top','.club','.work','.click','.link','.gq','.tk','.ml',
  '.cf','.ga','.loan','.win','.vip','.rest','.cyou','.icu','.buzz','.monster','.quest','.sbs',
  '.cam','.bar','.beauty','.hair','.skin','.makeup','.lol','.fit','.autos','.boats'];

const SHORTENERS = ['bit.ly','tinyurl.com','goo.gl','t.co','ow.ly','is.gd','buff.ly','rebrand.ly',
  'cutt.ly','rb.gy','shorturl.at','tiny.cc','soo.gd','s.id','clck.ru','t.ly','shorte.st'];

// Brands phishers impersonate most. Key = brand token, value = domains that are
// genuinely theirs (registrable form).
const BRANDS = {
  paypal:['paypal.com'], apple:['apple.com','icloud.com'], amazon:['amazon.com','amazon.co.uk'],
  google:['google.com','googlemail.com','gmail.com'], microsoft:['microsoft.com','office.com','live.com','outlook.com'],
  netflix:['netflix.com'], facebook:['facebook.com','fb.com'], instagram:['instagram.com'],
  chase:['chase.com'], wellsfargo:['wellsfargo.com'], bankofamerica:['bankofamerica.com','bofa.com'],
  citibank:['citi.com','citibank.com'], venmo:['venmo.com'], zelle:['zellepay.com'],
  coinbase:['coinbase.com'], binance:['binance.com'], metamask:['metamask.io'],
  fedex:['fedex.com'], ups:['ups.com'], usps:['usps.com'], dhl:['dhl.com'],
  irs:['irs.gov'], docusign:['docusign.com','docusign.net'], dropbox:['dropbox.com'],
  linkedin:['linkedin.com'], x:['x.com','twitter.com'], tiktok:['tiktok.com'],
  walmart:['walmart.com'], target:['target.com'], costco:['costco.com'], ebay:['ebay.com'],
  att:['att.com'], verizon:['verizon.com'], tmobile:['t-mobile.com'], geeksquad:['bestbuy.com'],
  norton:['norton.com'], mcafee:['mcafee.com']
};

const registrable = (host)=>String(host||'').toLowerCase().split('.').slice(-2).join('.');

function isEsp(host){
  const h = String(host||'').toLowerCase();
  return ESP_HOSTS.some(e => h === e || h.endsWith('.'+e) || registrable(h) === e);
}

/* Inspect a link that arrived in an email.
   opts: { senderEmail } — the address the message came from, when known. */
function inspect(rawUrl, opts){
  opts = opts || {};
  const reasons = [];
  let risk = 0;
  const s = String(rawUrl||'').trim();
  if(!s) return { risk:100, verdict:'block', host:'', reasons:['There is no link to check.'] };

  // Scheme: anything that isn't ordinary web is an immediate refusal.
  if(!/^https?:\/\//i.test(s)){
    if(/^(javascript|data|blob|file|vbscript):/i.test(s)){
      return { risk:100, verdict:'block', host:'',
        reasons:['This is not a normal web link — it is a command disguised as one. Never open it.'] };
    }
    return { risk:100, verdict:'block', host:'', reasons:['This is not a valid web address.'] };
  }

  let url;
  try{ url = new URL(s); }
  catch(e){ return { risk:100, verdict:'block', host:'', reasons:['This is not a valid web address.'] }; }

  const host = url.hostname.toLowerCase();
  const reg = registrable(host);
  const path = (url.pathname + url.search).toLowerCase();

  // --- structural red flags -------------------------------------------------
  if(url.protocol === 'http:'){ risk += 30; reasons.push('Not secure (no padlock) — anything you type could be read in transit, and real companies stopped using this years ago.'); }
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)){ risk += 45; reasons.push('It points at a bare number address instead of a company name. Almost always a trap.'); }
  if(host.includes('xn--')){ risk += 45; reasons.push('The address uses look-alike foreign letters to imitate a real name.'); }
  if(s.includes('@')){ risk += 40; reasons.push('The address contains an @ — the part you can read is fake; your browser goes somewhere else.'); }
  if(SHORTENERS.includes(reg)){ risk += 30; reasons.push('A shortened link — the real destination is hidden from you.'); }
  const badTld = RISKY_TLDS.find(t => host.endsWith(t));
  if(badTld){ risk += 30; reasons.push('Ends in "'+badTld+'", a throwaway domain type phishing sites use heavily.'); }
  if((host.match(/\./g)||[]).length >= 4){ risk += 15; reasons.push('Unusually deep address — a trick for burying the real owner.'); }
  if(s.length > 180){ risk += 10; reasons.push('Extremely long link, often used to hide the real target.'); }
  if(/-{2,}|\d{6,}/.test(host)){ risk += 10; reasons.push('The address has the throwaway pattern of auto-generated phishing hosts.'); }

  // --- brand impersonation --------------------------------------------------
  for(const brand in BRANDS){
    if(host.includes(brand) && !BRANDS[brand].includes(reg)){
      risk += 45;
      reasons.push('Pretends to be '+brand.charAt(0).toUpperCase()+brand.slice(1)+', but this address is really owned by "'+reg+'".');
      break;
    }
  }

  // --- credential harvesting cues ------------------------------------------
  const credWords = /(login|signin|sign-in|verify|verification|secure|account|update|confirm|billing|payment|wallet|password|invoice|suspend|unlock|recover)/;
  if(credWords.test(path)){
    if(risk > 0){ risk += 20; reasons.push('Asks you to log in or “verify” — combined with the other flags, this is classic phishing.'); }
    else { risk += 12; reasons.push('This page wants a login or verification. A real unsubscribe never needs one.'); }
  }
  // A link that hands you an executable is never legitimate in an email — block
  // it outright, no matter how trustworthy the domain looks (domains get hacked).
  if(/\.(exe|scr|msi|dmg|pkg|apk|jar|bat|cmd|vbs|ps1|sh|iso|img)(\?|#|$)/i.test(path)){
    return { risk:100, verdict:'block', host, reg, url:url.href,
      reasons:['This link hands you a program to run. No unsubscribe page ever does that — it is how devices get infected.'] };
  }
  if(/\.(zip|rar|7z|gz)(\?|#|$)/i.test(path)){
    risk += 45; reasons.push('This link downloads an archive file. Unsubscribe pages never do that.');
  }

  // --- sender vs destination ------------------------------------------------
  if(opts.senderEmail){
    const senderReg = registrable(String(opts.senderEmail).split('@')[1]||'');
    if(senderReg && reg && senderReg !== reg && !isEsp(host)){
      risk += 20;
      reasons.push('The sender is "'+senderReg+'" but this link goes to "'+reg+'" — a different company entirely.');
    } else if(senderReg && senderReg === reg){
      // Matching the sender's domain is reassuring, but it can never excuse a
      // hard defect like an insecure connection — only trim soft suspicion.
      if(url.protocol === 'https:'){ risk = Math.max(0, risk - 10); }
      reasons.push('Destination matches the sender’s own domain.');
    } else if(isEsp(host)){
      if(url.protocol === 'https:'){ risk = Math.max(0, risk - 5); }
      reasons.push('Goes through a known mailing platform, which is normal for marketing.');
    }
  }

  risk = Math.max(0, Math.min(100, risk));
  const verdict = risk >= 60 ? 'block' : risk >= 30 ? 'warn' : 'ok';
  if(!reasons.length) reasons.push('No red flags in the address itself.');
  return { risk, verdict, host, reg, reasons, url: url.href };
}

window.Phish = { inspect, registrable, isEsp };
})();
