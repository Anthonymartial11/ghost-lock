/* Lock — protect the present. Stop trackers, ads, scams and weak spots
   BEFORE they get you. Companion app to Ghost — independent vault, own lock. */
(()=>{
const { el, esc, Nav, Screen, BigBtn, toast, sheet, confirmSheet, copy, ago } = UI;
const S = ()=>Vault.state;

/* =============== the shields (checklists) =============== */

const IPHONE = [
  {id:'ip_track', title:'Stop apps asking to track you',
    why:'Apps beg to follow you across other apps and sites to sell you stuff. One switch shuts them all up.',
    steps:['Open Settings','Privacy & Security → Tracking','Turn OFF “Allow Apps to Request to Track”']},
  {id:'ip_ads', title:'Turn off Apple personalized ads',
    why:'Apple also builds an ad profile on you. You can just say no.',
    steps:['Settings → Privacy & Security','Scroll down → Apple Advertising','Turn OFF Personalized Ads']},
  {id:'ip_privacyreport', title:'See who’s spying (App Privacy Report)',
    why:'Your iPhone keeps receipts on which apps touch your location, mic, contacts — and who they phone home to.',
    steps:['Settings → Privacy & Security','App Privacy Report → Turn On','Come back in a day and look at the worst offenders']},
  {id:'ip_location', title:'Cut location access down',
    why:'Half your apps don’t need to know where you are. Ever.',
    steps:['Settings → Privacy & Security → Location Services','For each app: pick “While Using” or “Never”','Turn off “Precise Location” for apps that don’t need it (like social media)']},
  {id:'ip_mail', title:'Hide your email opens',
    why:'Marketing emails contain invisible trackers that report when and where you read them. This blinds them.',
    steps:['Settings → Apps → Mail → Privacy Protection','Turn ON “Protect Mail Activity”']},
  {id:'ip_safari', title:'Harden Safari',
    why:'Stops pop-ups, warns you about scam sites, and hides you from cross-site trackers.',
    steps:['Settings → Apps → Safari','Turn ON: Block Pop-ups','Turn ON: Fraudulent Website Warning','Turn ON: Prevent Cross-Site Tracking','Set “Hide IP Address” to “From Trackers”']},
  {id:'ip_updates', title:'Auto-update everything',
    why:'Most hacks use holes that were already fixed. Updates are the patch. Automate it.',
    steps:['Settings → General → Software Update','Automatic Updates → turn everything ON']},
  {id:'ip_findmy', title:'Turn on Find My iPhone',
    why:'Phone stolen? You can lock and erase it from anywhere.',
    steps:['Settings → your name → Find My','Turn ON Find My iPhone (all three switches)']}
];

const MAC = [
  {id:'mac_fw', title:'Turn ON the Mac firewall',
    why:'Your Mac ships with a real firewall — turned OFF. This blocks unwanted incoming connections. Free. One switch.',
    steps:['System Settings → Network → Firewall','Turn it ON','Click Options → turn ON “Stealth Mode” (your Mac stops answering strangers)']},
  {id:'mac_filevault', title:'Encrypt the whole disk (FileVault)',
    why:'If your Mac is stolen, FileVault makes the drive unreadable without your password.',
    steps:['System Settings → Privacy & Security','FileVault → Turn On','Save the recovery key somewhere safe (not on the Mac)']},
  {id:'mac_gatekeeper', title:'Only allow trusted apps',
    why:'Blocks random downloaded programs — the #1 way Macs get infected.',
    steps:['System Settings → Privacy & Security','Under “Allow applications from”, pick “App Store & Known Developers”','Never override it for something a website told you to install']},
  {id:'mac_updates', title:'Auto-update macOS',
    why:'Same as the phone: updates close the holes hackers use.',
    steps:['System Settings → General → Software Update','Turn on all automatic updates']},
  {id:'mac_lock', title:'Lock the screen fast',
    why:'A Mac left open is an open wallet.',
    steps:['System Settings → Lock Screen','“Require password after screen saver begins or display is turned off” → set to Immediately']},
  {id:'mac_permissions', title:'Audit mic, camera & screen access',
    why:'See exactly which apps can watch and listen, and cut the ones that shouldn’t.',
    steps:['System Settings → Privacy & Security','Check: Microphone, Camera, Screen Recording, Full Disk Access','Turn off anything you don’t recognize or need']},
  {id:'mac_safari', title:'Harden Safari on Mac',
    why:'Same tracker-blinding as the phone.',
    steps:['Safari → Settings → Privacy','Turn ON “Prevent cross-site tracking”','Turn ON “Hide IP address from trackers”','Safari → Settings → Security → turn ON fraud warnings']},
  {id:'mac_backup', title:'Back up automatically',
    why:'Ransomware and dead drives can’t hurt you if your stuff exists twice.',
    steps:['Plug in any external drive','System Settings → General → Time Machine → Add Backup Disk','Leave it plugged in when you’re at your desk']}
];

const BROWSE = [
  {id:'br_blocker', title:'Install a free ad & tracker blocker in Safari',
    why:'Kills most ads, pop-ups and trackers inside the browser itself. AdGuard’s Safari extension is free.',
    steps:['App Store → search “AdGuard for Safari” (Mac) or “AdGuard” (iPhone)','Install the free version','Settings → Safari → Extensions → turn its blockers ON']},
  {id:'br_reject', title:'Cookie pop-ups: always “Reject all”',
    why:'“Accept all” = permission to follow you. The reject button is usually hiding behind “Manage options”.',
    steps:['When a cookie banner appears, never hit Accept','Tap “Reject all” / “Only necessary”','If they make it too hard — leave the site']},
  {id:'br_sso', title:'Don’t “Sign in with Google/Facebook” on random sites',
    why:'It ties everything you do on that site back to your main identity — and tells the big guys where you go.',
    steps:['Use an email + unique password instead','Or use “Sign in with Apple” and tap “Hide My Email”']},
  {id:'br_hide', title:'Use Hide My Email for sign-ups',
    why:'Give every site a fake forwarding email. If they sell it, you know exactly who snitched — and you kill that address.',
    steps:['iPhone: Settings → your name → iCloud → Hide My Email','Create a new address per site','If one starts getting spam, deactivate it']}
];

const SPAM = [
  {id:'sp_dnc', title:'Put your number on the Do Not Call list',
    why:'The free federal registry. Legitimate telemarketers must stop calling you within 31 days, and calls that still come are provably illegal — reportable on the same site.',
    url:'https://www.donotcall.gov/',
    steps:['Open donotcall.gov','Tap Register Your Phone','Enter your number and email','Confirm the email they send you']},
  {id:'sp_silence', title:'Screen unknown callers — don’t just silence them',
    why:'An unknown caller is NOT the same as a spam caller — it could be your doctor or a delivery. Screening answers the call for you, asks who it is and why, and shows you their answer live before your phone rings. Real people answer; spam robots hang up. Use full silencing only if your iPhone doesn’t have screening.',
    steps:['Settings → Apps → Phone','Tap “Screen Unknown Callers”','Choose “Ask Reason for Calling” (this is the screening option)','No screening option on your iOS? Then use “Silence Unknown Callers” — unknowns go to voicemail, real people leave a message']},
  {id:'sp_filter', title:'Screen texts from unknown senders',
    why:'Same idea for texts: messages from numbers you don’t know are held in a separate quiet list — nothing is lost, real senders (delivery updates, verification codes) still arrive, they just don’t interrupt you. Known spam never even gets that far once you report it (next item).',
    steps:['Settings → Apps → Messages','Turn ON “Screen Unknown Senders” (older iOS calls it “Filter Unknown Senders”)','Check the Unknown Senders list once in a while for real ones']},
  {id:'sp_7726', title:'Report spam texts — forward to 7726',
    why:'This is how a number officially becomes SPAM instead of just unknown. 7726 spells SPAM; forwarding a junk text there is free and tells your carrier to investigate and block the sender at the network level, for everyone.',
    steps:['Press and hold the spam message bubble','Tap More → select it → tap the forward arrow','Send it to 7726','Reply with the sender’s number when the carrier asks','Also tap “Report Junk” under the message when it appears']},
  {id:'sp_carrier', title:'Turn on your carrier’s free spam-call blocker',
    why:'This is the layer that actually knows who the SPAM callers are: carriers keep a live database of confirmed scam numbers and label or block those calls before your phone rings — while unknown-but-clean numbers ring normally. Screening handles the unknowns; this handles the known-bad.',
    steps:['App Store → search your carrier:','AT&T: “ActiveArmor” · Verizon: “Call Filter” · T-Mobile: “Scam Shield”','Install the FREE version and turn on scam blocking']},
  {id:'sp_robot', title:'Never talk to a robocall',
    why:'Pressing a button or saying “yes” marks your number as live — and multiplies the calls. Answer, say nothing you don’t have to, hang up.',
    steps:['Don’t press “press 1 to be removed” — it does the opposite','Don’t say “yes” to “can you hear me?”','Hang up. Block the number.']},
  {id:'sp_source', title:'Cut it off at the source',
    why:'Spam calls and texts exist because data-seller sites sell your number. Removing yourself there shrinks the pipeline feeding the spammers.',
    steps:['Open the Ghost app','Run “Get me off data-seller sites”','Include your phone number in Ghost’s Settings so the demand letters cover it']}
];

/* =============== STOP THE LISTENING =============== */
/* Layered on purpose. Audio only becomes an ad if it is (1) captured,
   (2) sent somewhere, and (3) matched to your ad profile. Break any link and
   the chain fails — so we break all three. */
const LISTEN = [
  // --- LAYER 0: EVIDENCE — stop guessing, start seeing ---
  {id:'li_report', title:'Turn on the receipts (App Privacy Report)', tier:'See what is really happening',
    why:'Your iPhone can log every single time an app touches the microphone, when it happened, and which servers that app talked to. This turns suspicion into evidence you can read yourself. Leave it running a few days, then look at the Microphone section — anything there that is not a call or voice app is your answer.',
    steps:['Settings → Privacy & Security','Scroll down → App Privacy Report → Turn On','Come back in 2-3 days','Open it and tap Microphone — check every app listed','Anything suspicious: revoke its mic access (next items)']},
  {id:'li_dot', title:'Learn the orange dot', tier:'See what is really happening',
    why:'iOS shows an orange dot at the top of the screen whenever the microphone is live, and green for the camera. There is no way for an app to hide it. If you see orange when nothing should be listening, swipe down from the top-right — Control Centre names the app using it.',
    steps:['Watch the top-right of the screen','Orange dot = microphone is on RIGHT NOW','Green dot = camera is on','Swipe down from top-right to see which app it is']},

  // --- LAYER 1: KILL THE ALWAYS-ON MICROPHONE ---
  {id:'li_siri', title:'Turn off "Listen for Siri"', tier:'Kill the always-on mic',
    why:'This is the real always-on microphone. To catch "Hey Siri" the phone must listen to everything continuously. It misfires often, and each misfire captures a slice of whatever you were saying. Turning it off does not remove Siri — you can still hold the side button when you actually want it.',
    steps:['Settings → Apps → Siri','Talk to Siri → set to "Off" (or "Press Side Button" only)','Turn OFF "Allow Siri When Locked"','On Mac: System Settings → Apple Intelligence & Siri → turn off "Listen for"']},
  {id:'li_dictation', title:'Turn off Dictation', tier:'Kill the always-on mic',
    why:'The microphone key on your keyboard sends audio to Apple to transcribe. Most people never use it and never realise it is enabled.',
    steps:['Settings → General → Keyboard','Turn OFF "Enable Dictation"','Confirm when it asks','Mac: System Settings → Keyboard → Dictation → Off']},
  {id:'li_assistant', title:'Kill "Hey Google" and Assistant voice history', tier:'Kill the always-on mic',
    why:'Google Assistant runs the same always-listening wake-word loop, and by default keeps the recordings. This is the one with the biggest ad machine behind it.',
    url:'https://myactivity.google.com/product/voice',
    steps:['Open the Google app → your picture → Settings → Google Assistant','Hey Google & Voice Match → turn OFF','Then open myactivity.google.com/product/voice','Delete all voice recordings','Turn OFF "Include audio and video recordings"']},
  {id:'li_alexa', title:'Mute or purge Alexa', tier:'Kill the always-on mic',
    why:'Smart speakers are microphones you paid for and pointed at your own sofa. If you keep one, at least stop it storing what it hears.',
    url:'https://www.amazon.com/alexaprivacysettings',
    steps:['Press the physical mute button on the device when not in use','Alexa app → More → Alexa Privacy → Review Voice History → Delete All','Manage Your Alexa Data → turn OFF "Save Voice Recordings"','Turn OFF "Use of Voice Recordings to Improve Alexa"']},

  // --- LAYER 2: REVOKE THE MICROPHONE, APP BY APP ---
  {id:'li_perms', title:'Revoke microphone access — the big one', tier:'Take the mic away',
    why:'This is the single most effective action on this list. An app cannot listen if the system will not give it the microphone. Be ruthless: social apps, shopping apps, games, news, weather and flashlight apps do NOT need your microphone. If one breaks later, it will ask again and you can decide then.',
    steps:['Settings → Privacy & Security → Microphone','Turn OFF every app that is not a phone, video-call, voice-memo or music app','Do the same under Speech Recognition','Mac: System Settings → Privacy & Security → Microphone — same rule','Recheck monthly: app updates re-ask for permission']},
  {id:'li_camera', title:'Audit camera and screen recording too', tier:'Take the mic away',
    why:'While you are in there. Researchers have caught apps recording the SCREEN and sending it — that was found far more often than secret audio.',
    steps:['Settings → Privacy & Security → Camera → cut anything unnecessary','Mac: Privacy & Security → Camera, Screen & System Audio Recording','Remove anything you do not recognise']},
  {id:'li_browser', title:'Stop websites asking for your mic', tier:'Take the mic away',
    why:'A web page can request the microphone too. Set Safari to refuse by default.',
    steps:['Settings → Apps → Safari → scroll to Settings for Websites','Microphone → set to "Deny"','Camera → set to "Deny"','Mac Safari: Settings → Websites → Microphone → When visiting other websites: Deny']},

  // --- LAYER 3: CUT THE PATH FROM AUDIO TO AD ---
  {id:'li_att', title:'Block cross-app tracking', tier:'Cut the path to the advert',
    why:'Even if something captures audio, it is worthless to an advertiser unless it can be tied to YOU across apps. This switch cuts that link at the system level.',
    steps:['Settings → Privacy & Security → Tracking','Turn OFF "Allow Apps to Request to Track"','This retroactively denies every app that already asked']},
  {id:'li_adid', title:'Turn off personalised ads everywhere', tier:'Cut the path to the advert',
    why:'The ad profile is the thing that turns any signal — audio, location, browsing — into a targeted advert. No profile, no targeting.',
    url:'https://myadcenter.google.com/',
    steps:['Settings → Privacy & Security → Apple Advertising → Personalized Ads OFF','myadcenter.google.com → Personalized ads OFF','Ghost → Cut Big Tech down → do the Meta "off-Meta activity" item','Amazon: amazon.com/adprefs → opt out']},
  {id:'li_dns', title:'Block the analytics servers themselves', tier:'Cut the path to the advert',
    why:'Captured data has to reach a server to matter. The whole-device shield refuses to look up the addresses of known ad and analytics companies, so the data has nowhere to go — in every app, not just the browser.',
    steps:['Go back and open "Block ads, trackers & bad sites"','Install the shield','Test it']},
  {id:'li_relay', title:'Hide your IP from trackers', tier:'Cut the path to the advert',
    why:'Your IP address is how companies link you to the people around you — the reason an ad follows a conversation you had near someone else. Hiding it breaks that link.',
    steps:['Settings → your name → iCloud → Private Relay → ON (needs iCloud+)','Settings → Apps → Safari → Hide IP Address → "From Trackers and Websites"','No iCloud+? Use a reputable paid VPN, never a free one']},

  // --- LAYER 4: THE OTHER MICROPHONES IN YOUR HOUSE ---
  {id:'li_tv', title:'Your TV is watching and listening', tier:'The other microphones',
    why:'Smart TVs run Automatic Content Recognition — they sample what is on screen (and on some sets, room audio via the voice remote) and sell viewing data to advertisers. Vizio was fined by the FTC for exactly this. This is a genuine, documented source of "how did they know" adverts.',
    steps:['Samsung: Settings → Terms & Privacy → turn off Viewing Information Services','LG: Settings → General → Live Plus → OFF, and turn off ad personalisation','Vizio: Settings → System → Reset & Admin → Viewing Data → OFF','Roku/Fire TV: Settings → Privacy → turn off ACR and ad tracking','Take the batteries out of a voice remote you never use']},
  {id:'li_ultrasonic', title:'Ultrasonic beacons — why the mic audit matters', tier:'The other microphones',
    why:'Some adverts and shop displays emit tones too high for you to hear, which a phone app with microphone access can detect to link your devices and confirm you saw an advert. It is not a theory — the FTC warned companies over it. The defence is simply that no app has your microphone, which you just fixed.',
    steps:['Nothing new to do — this is what the microphone audit prevents','Keep Bluetooth off for apps that do not need it: Settings → Privacy & Security → Bluetooth','Turn off Location Services for shopping apps']},

  // --- LAYER 5: WHEN IT REALLY MATTERS ---
  {id:'li_physical', title:'For conversations that truly matter', tier:'When it really matters',
    why:'Software settings are promises made by companies. Physics is not. For anything genuinely sensitive, remove the device from the room — that is the only guarantee that exists.',
    steps:['Leave the phone in another room — not face down on the table','Airplane Mode does not stop recording, only sending — it is not enough on its own','Powered off is reliable; a Faraday pouch is better if you need certainty','Never rely on an app that claims to "block" the microphone — none can']}
];

/* =============== helpers =============== */
function ckDone(id){ return !!S().lock.checklist[id]; }
function listDone(list){ return list.filter(i=>ckDone(i.id)).length; }
function shieldsUp(){
  return (S().lock.dnsDone?1:0) + listDone(IPHONE) + listDone(MAC) + listDone(BROWSE) + listDone(SPAM) + listDone(LISTEN);
}
function shieldsTotal(){ return 1 + IPHONE.length + MAC.length + BROWSE.length + SPAM.length + LISTEN.length; }

/* =============== HOME =============== */
function renderHome(){
  const up = shieldsUp(), total = shieldsTotal();
  const scr = Screen('Lock', [], {back:false});
  const sw = el(`<button class="switch">Ghost ›</button>`);
  sw.onclick = ()=>{ location.href = '../ghost/'; };
  scr.querySelector('.bar').appendChild(sw);
  const body = scr.lastElementChild;

  body.appendChild(el(`
    <div style="text-align:center;margin:10px 0 18px">
      <div class="glyph">${up===total?EMBLEMS.lock:EMBLEMS.lockOpen}</div>
      <p class="huge count">${up}<span style="color:var(--dim)"> / ${total}</span></p>
      <p class="sub">protections active${up===total?'. Fully hardened.':`. ${total-up} remaining.`}</p>
    </div>`));

  body.appendChild(BigBtn({title:'Block ads, trackers & bad sites',
    sub:'One shield for your whole device', badge:S().lock.dnsDone?'ON':'OFF',
    onClick:()=>Nav.go(renderDns)}));

  body.appendChild(BigBtn({title:'Is this link safe?',
    sub:'Check before you tap', onClick:()=>Nav.go(renderLink)}));

  body.appendChild(BigBtn({title:'I clicked something bad',
    sub:'Emergency steps — do these in order, right now', onClick:()=>Nav.go(renderEmergency)}));

  body.appendChild(BigBtn({title:'Check a password',
    sub:'How strong? Already stolen?', onClick:()=>Nav.go(renderPassword)}));

  body.appendChild(BigBtn({title:'Stop spam calls & texts',
    badge:`${listDone(SPAM)}/${SPAM.length}`, onClick:()=>Nav.go(()=>renderChecklist('Stop spam calls & texts', SPAM,
      'Two different problems, two different fixes. An <b>unknown</b> caller is just someone not in your contacts — could be your doctor. A <b>spam</b> caller is a confirmed bad number. These steps <b>screen</b> the unknowns so real people still reach you, and <b>block</b> the known spam outright.'))}));

  body.appendChild(BigBtn({title:'Stop the listening',
    sub:'Microphones, ad targeting, and the path between them',
    badge:`${listDone(LISTEN)}/${LISTEN.length}`, onClick:()=>Nav.go(renderListen)}));

  body.appendChild(BigBtn({title:'Harden my iPhone',
    badge:`${listDone(IPHONE)}/${IPHONE.length}`, onClick:()=>Nav.go(()=>renderChecklist('Harden my iPhone', IPHONE))}));

  body.appendChild(BigBtn({title:'Harden my Mac',
    badge:`${listDone(MAC)}/${MAC.length}`, onClick:()=>Nav.go(()=>renderChecklist('Harden my Mac', MAC))}));

  body.appendChild(BigBtn({title:'Browse without being followed',
    badge:`${listDone(BROWSE)}/${BROWSE.length}`, onClick:()=>Nav.go(()=>renderChecklist('Browse unseen', BROWSE))}));

  body.appendChild(BigBtn({title:'Settings', onClick:()=>Shell.openSettings()}));
  return scr;
}

/* =============== DNS SHIELD =============== */
function renderDns(){
  const on = S().lock.dnsDone;
  const nodes = [
    el(`<p class="plain">Your device asks a “phone book” (DNS) where every website lives. This shield swaps in a <b>free</b> phone book that simply refuses to answer for ad servers, trackers, and known scam & malware sites.</p>
    `),
    el(`<p class="plain"><b>Result:</b> fewer ads, fewer pop-ups, trackers blinded, and known bad sites can’t even load — in every app, not just Safari. Made by AdGuard, free, no account.</p>`),
    el(`<div class="hr"></div>`)
  ];

  nodes.push(BigBtn({title:'Step 1 — Download the shield file', arrow:false, onClick:()=>{
    downloadProfile();
    toast('Downloaded. Now install it (step 2).');
  }}));

  nodes.push(BigBtn({title:'Step 2 — How to install it', arrow:false, onClick:()=>{
    sheet('Install the shield', [
      el(`<p class="plain"><b>iPhone:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px;margin-top:0">
        <li>Open <b>Settings</b></li>
        <li>Tap <b>Profile Downloaded</b> (top) — or General → VPN & Device Management</li>
        <li>Tap <b>Install</b> (it will say the profile is unsigned — that’s because you made it yourself, right here)</li></ol>`),
      el(`<p class="plain"><b>Mac:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px;margin-top:0">
        <li>Double-click the downloaded file</li>
        <li>System Settings → Privacy & Security → <b>Profiles</b></li>
        <li>Double-click “Lock — DNS Shield” → <b>Install</b></li></ol>`),
      el(`<p class="tiny">If the download didn’t start inside the app, open this same page in Safari and tap it there. To undo the shield later: delete the profile the same place you installed it.</p>`)
    ]);
  }}));

  nodes.push(BigBtn({title:'Step 3 — Test the shield', sub:'Opens AdGuard’s own checker', arrow:false, onClick:()=>{
    Shell.openExternal('https://adguard.com/en/test.html');
  }}));

  nodes.push(el(`<div class="hr"></div>`));
  nodes.push(el(`<p class="sub">Profile won’t install?</p>`));

  nodes.push(BigBtn({title:'It said “VPN service could not be created”', sub:'What that means and how to fix it', arrow:false, onClick:()=>{
    sheet('“The VPN service could not be created”', [
      el(`<p class="plain">iOS builds this shield as a background network service. That message means iOS refused to create it — almost always for one of four reasons, in order of likelihood:</p>`),
      el(`<ol class="plain" style="padding-left:22px">
        <li><b>You installed it from inside the app.</b> iOS only accepts profiles downloaded through <b>Safari</b>. Open the Lock address in Safari and download it there.</li>
        <li><b>Something else already controls your DNS.</b> A VPN app, or AdGuard/NextDNS/Cloudflare/Control D, or an older copy of this profile. Only one can exist at a time.</li>
        <li><b>A half-installed copy is stuck.</b> Delete it, then install fresh.</li>
        <li><b>A work/school profile</b> restricts adding network configurations.</li>
      </ol>`),
      el(`<p class="plain"><b>Do this, in order:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px">
        <li>Settings → General → <b>VPN &amp; Device Management</b> — delete any “Lock — DNS Shield” already there</li>
        <li>Settings → General → <b>VPN</b> — turn off / delete any VPN configuration</li>
        <li>Restart the iPhone</li>
        <li>Open this page <b>in Safari</b> (not the installed app) and download again</li>
        <li>Still failing? Use the <b>Standard</b> profile below, or set DNS by hand — that always works</li>
      </ol>`)
    ]);
  }}));

  nodes.push(BigBtn({title:'Try the Standard profile instead', sub:'Plain DNS — simpler, installs where the encrypted one fails', arrow:false, onClick:()=>{
    downloadProfile('plain');
    toast('Downloaded the Standard profile. Install it the same way.');
  }}));

  nodes.push(BigBtn({title:'No profile — set DNS by hand', sub:'Always works. Nothing to install.', arrow:false, onClick:()=>{
    sheet('Set the shield by hand', [
      el(`<p class="plain">This needs no profile at all. The catch: you set it <b>per Wi-Fi network</b>, so repeat it on your home and work Wi-Fi. It does not cover mobile data.</p>`),
      el(`<p class="plain"><b>iPhone:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px;margin-top:0">
        <li>Settings → <b>Wi-Fi</b></li>
        <li>Tap the <b>ⓘ</b> next to your network</li>
        <li><b>Configure DNS</b> → <b>Manual</b></li>
        <li>Remove the existing servers, then <b>Add Server</b>:<br><b>94.140.14.14</b><br><b>94.140.15.15</b></li>
        <li><b>Save</b></li>
      </ol>`),
      el(`<p class="plain"><b>Mac:</b></p>`),
      el(`<ol class="plain" style="padding-left:22px;margin-top:0">
        <li>System Settings → <b>Network</b> → your connection → <b>Details…</b></li>
        <li><b>DNS</b> → remove what's there → <b>+</b> and add both addresses above</li>
        <li><b>OK</b>, then <b>Apply</b></li>
      </ol>`),
      el(`<p class="tiny">To undo: set Configure DNS back to Automatic.</p>`)
    ]);
  }}));

  nodes.push(el(`<div class="hr"></div>`));
  nodes.push(BigBtn({title: on?'✓ Shield is ON':'The test says I’m protected', primary:!on, arrow:false, onClick:async ()=>{
    S().lock.dnsDone = !on;
    // Non-sensitive status flag so Ghost can tell you whether the shield is up.
    // (Only a yes/no — the vaults themselves stay separate and encrypted.)
    try{ localStorage.setItem('gl_shield', !on ? '1' : '0'); }catch(e){}
    if(!on){ Vault.log('Lock','DNS shield turned ON'); toast('Protection active.'); }
    await Vault.save(); Nav.refresh();
  }}));

  nodes.push(el(`<p class="tiny" style="margin-top:14px">Want blocking with no ad-filtering (just malware)? Quad9 (quad9.net) is a free non-profit alternative — but for ads + trackers + malware in one, this shield is the one.</p>`));
  return Screen('Whole-device shield', nodes);
}

function uuid(){
  return crypto.randomUUID ? crypto.randomUUID() :
    ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
}

function downloadProfile(mode){
  const encrypted = mode !== 'plain';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>
        ${encrypted
          ? `<key>DNSProtocol</key><string>HTTPS</string>
        <key>ServerURL</key><string>https://dns.adguard-dns.com/dns-query</string>`
          : `<key>DNSProtocol</key><string>Cleartext</string>
        <key>ServerAddresses</key>
        <array><string>94.140.14.14</string><string>94.140.15.15</string></array>`}
      </dict>
      <key>PayloadDescription</key><string>Blocks ads, trackers and known malicious sites via AdGuard public DNS.</string>
      <key>PayloadDisplayName</key><string>Lock — DNS Shield</string>
      <key>PayloadIdentifier</key><string>com.ghostlock.dnsshield.settings</string>
      <key>PayloadType</key><string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key><string>${uuid()}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>ProhibitDisablement</key><false/>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Free whole-device shield: ads, trackers and known bad sites are blocked at the DNS level.</string>
  <key>PayloadDisplayName</key><string>Lock — DNS Shield (ads, trackers, malware)</string>
  <key>PayloadIdentifier</key><string>com.ghostlock.dnsshield</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${uuid()}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>`;
  const blob = new Blob([xml], {type:'application/x-apple-aspen-config'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = encrypted ? 'Lock-DNS-Shield.mobileconfig' : 'Lock-DNS-Shield-Standard.mobileconfig';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 30000);
}


function renderListen(){
  const nodes = [
    el(`<div class="card"><h3>How this actually works</h3>
      <p style="color:var(--fg)">Audio only becomes an advert if three things happen: it is <b>captured</b>, it is <b>sent somewhere</b>, and it is <b>matched to your ad profile</b>. Break any one link and the chain fails. This list breaks all three.</p>
      <p style="color:var(--fg)">Start with the receipts — before changing anything, turn on the App Privacy Report so you can see for yourself which apps touch your microphone.</p></div>`)
  ];
  const tiers = [...new Set(LISTEN.map(x=>x.tier))];
  for(const t of tiers){
    const items = LISTEN.filter(x=>x.tier===t);
    nodes.push(el(`<div class="hr"></div>`));
    nodes.push(el(`<p class="sub"><b>${esc(t)}</b> — ${items.filter(i=>ckDone(i.id)).length} of ${items.length} done</p>`));
    for(const item of items){
      const done = ckDone(item.id);
      const node = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
        <span class="dot ${done?'done':''}"></span>
        <span class="grow"><b>${esc(item.title)}</b><small>${done?'Done ✓':'Tap for steps'}</small></span>
        <span class="arrow">›</span></button>`);
      node.onclick = ()=>checkSheet(item, 'Stop the listening', LISTEN);
      nodes.push(node);
    }
  }
  return Screen('Stop the listening', nodes);
}

/* =============== EMERGENCY: I CLICKED SOMETHING BAD =============== */
const EMERGENCY = [
  {id:'em_offline', title:'1. Cut it off — go offline now',
    why:'If something is talking to a criminal’s server, this stops the conversation mid-sentence. Do this first, before anything else.',
    steps:['Turn ON Airplane Mode','Leave it on until you finish step 3','On a Mac: turn Wi-Fi off']},
  {id:'em_typed', title:'2. Did you type anything? Change that password NOW',
    why:'A phishing page’s only goal is your password. If you typed one — even partly, even if the page “errored” — treat it as stolen. Speed matters more than certainty.',
    steps:['Use a DIFFERENT device that you did not click on','Change the password for that exact account first','Then change it anywhere you reused it','Turn on two-step login for that account']},
  {id:'em_cards', title:'3. Typed a card number? Call the bank',
    why:'Freezing the card takes two minutes and beats disputing charges for weeks.',
    steps:['Use the number on the BACK of your card — never a number from the email','Ask them to freeze the card and issue a new one','Watch the statement for small test charges']},
  {id:'em_install', title:'4. Did anything download or ask to install?',
    why:'On iPhone, a website alone cannot install an app — but it CAN push a configuration profile, which is the real iPhone attack. On Mac, a downloaded file is the danger.',
    steps:['iPhone: Settings → General → VPN & Device Management. If ANY profile is there you did not add, delete it','Mac: check your Downloads folder — drag anything from that site to the Trash, then empty it','Never open a downloaded installer “to see what it is”']},
  {id:'em_scan', title:'5. Mac: run a real scan',
    why:'Your Mac has a built-in cleanup tool, and Malwarebytes’ free scanner is the trusted second opinion. This is the actual “destroy the malware” step — it needs a real program, not a web app.',
    steps:['Restart the Mac (clears anything running in memory)','Download Malwarebytes ONLY from malwarebytes.com','Run a full scan and quarantine anything it finds','Apple menu → System Settings → General → Software Update → install everything']},
  {id:'em_shield', title:'6. Turn the shield on so it cannot happen again',
    why:'The whole-device DNS shield blocks known phishing and malware domains before they ever load. It is the one protection that works while you are not paying attention.',
    steps:['Go back and open “Block ads, trackers & bad sites”','Install the shield profile','Test it']},
  {id:'em_watch', title:'7. Watch for the follow-up',
    why:'Criminals who get one thing come back for more — often pretending to be your bank’s “fraud department” calling to help.',
    steps:['Nobody legitimate will ever call and ask for a code, password, or remote access','If “your bank” calls, hang up and call the number on your card','Check your email rules/forwarding for anything you did not create']}
];

function renderEmergency(){
  const nodes = [
    el(`<div class="card"><h3>Read this first</h3>
      <p style="color:var(--fg)">Most phishing clicks steal <b>what you type</b>, not your device. If you clicked but typed nothing, downloaded nothing, and installed nothing, you are very probably fine — do steps 1, 4 and 6 anyway.</p>
      <p style="color:var(--fg)">No app in a web browser can scan or delete malware — Apple forbids it. Step 5 is the real removal step and uses a proper program.</p></div>`)
  ];
  nodes.push(el(`<p class="sub">Work down the list in order. ${listDone(EMERGENCY)} of ${EMERGENCY.length} done.</p>`));
  for(const item of EMERGENCY){
    const done = ckDone(item.id);
    const node = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
      <span class="dot ${done?'done':''}"></span>
      <span class="grow"><b>${esc(item.title)}</b><small>${done?'Done ✓':'Tap for steps'}</small></span>
      <span class="arrow">›</span></button>`);
    node.onclick = ()=>checkSheet(item, 'I clicked something bad', EMERGENCY);
    nodes.push(node);
  }
  nodes.push(el(`<div class="hr"></div>`));
  nodes.push(BigBtn({title:'Reset this checklist', arrow:false, onClick:async ()=>{
    EMERGENCY.forEach(i=>{ delete S().lock.checklist[i.id]; });
    await Vault.save(); Nav.refresh(); toast('Reset.');
  }}));
  return Screen('I clicked something bad', nodes);
}

/* =============== LINK CHECKER =============== */
function renderLink(){
  const inp = el(`<input type="text" placeholder="Paste the link here" autocapitalize="off" autocorrect="off">`);
  const out = el(`<div></div>`);
  const from = el(`<input type="email" placeholder="Who sent it? (optional email address)" autocapitalize="off">`);
  const btn = BigBtn({title:'Check it', primary:true, arrow:false, onClick:()=>{
    const r = Phish.inspect(inp.value, { senderEmail: from.value.trim() });
    const verdict = r.verdict==='block' ? 'DANGER — do not open'
                  : r.verdict==='warn' ? 'Suspicious — be careful' : 'No red flags found';
    out.innerHTML = `<div class="card">
      <h3>${esc(verdict)}</h3>
      <p style="color:var(--fg)">Danger score: <b class="count">${r.risk}/100</b>${r.host?` · goes to <b>${esc(r.host)}</b>`:''}</p>
      ${r.reasons.map(x=>`<p>• ${esc(x)}</p>`).join('')}
      ${r.risk>=30?`<p style="color:var(--fg)"><b>What to do:</b> don’t open it. If it claims to be your bank or a company, type their address yourself or use their app.</p>`:
        `<p style="color:var(--fg)">Still: only ever log in on a site you opened yourself.</p>`}
    </div>`;
    if(r.risk>=60){ Vault.log('Lock','Checked a dangerous link ('+(r.host||'?')+')'); Vault.save(); }
  }});
  return Screen('Is this link safe?', [
    el(`<p class="sub">Got a weird text or email with a link? Paste it here <b>instead of tapping it</b>. Checked on your device — the link is never visited. Adding the sender’s address makes the check sharper.</p>`),
    inp, from, btn, out
  ]);
}

/* =============== PASSWORD CHECK =============== */
function renderPassword(){
  const inp = el(`<input type="password" placeholder="Type a password">`);
  const meter = el(`<div class="card" style="display:none"></div>`);
  const out = el(`<div></div>`);
  inp.addEventListener('input', ()=>{
    if(!inp.value){ meter.style.display='none'; return; }
    const s = Tools.strength(inp.value);
    meter.style.display='block';
    meter.innerHTML = `<h3>${esc(s.word)}</h3>
      <div style="height:14px;border:2px solid var(--line);border-radius:99px;overflow:hidden;margin:10px 0">
        <div style="height:100%;width:${s.score}%;background:var(--fg)"></div>
      </div>
      ${s.why.map(w=>`<p>• ${esc(w)}</p>`).join('')}`;
  });
  const btn = BigBtn({title:'Was it stolen?', primary:true, arrow:false, onClick:async ()=>{
    if(!inp.value) return toast('Type a password first');
    out.innerHTML=`<div class="spinner" style="margin:18px auto"></div>`;
    try{
      const n = await Tools.pwnedCount(inp.value);
      out.innerHTML = n>0
        ? `<div class="card"><h3>Yes — stolen ${n.toLocaleString()} times</h3><p style="color:var(--fg)">Criminals already have this one. Don’t use it anywhere. Ever.</p></div>`
        : `<div class="card"><h3>✓ Not in known leaks</h3><p style="color:var(--fg)">Good sign. Long + unique per site is the winning move.</p></div>`;
    }catch(e){ out.innerHTML=`<div class="card"><h3>Couldn’t check</h3><p>Try again when you’re online.</p></div>`; }
  }});
  return Screen('Check a password', [
    el(`<p class="sub">Strength is checked on your device. The stolen-check sends only a tiny scrambled piece — your password <b>never leaves this device</b>.</p>`),
    inp, meter, btn, out,
    el(`<p class="tiny" style="margin-top:14px">Golden rule: one password = one site. Let iPhone/Mac suggest and remember them for you (that’s free too).</p>`)
  ]);
}

/* =============== CHECKLISTS =============== */
function renderChecklist(title, list, intro){
  const nodes = [];
  if(intro) nodes.push(el(`<p class="sub">${intro}</p>`));
  nodes.push(el(`<p class="sub">${listDone(list)} of ${list.length} done. Tap one, follow the steps, mark it.</p>`));
  for(const item of list){
    const done = ckDone(item.id);
    const node = el(`<button class="item" style="width:100%;cursor:pointer;text-align:left">
      <span class="dot ${done?'done':''}"></span>
      <span class="grow"><b>${esc(item.title)}</b><small>${done?'Done ✓':'Tap for steps'}</small></span>
      <span class="arrow">›</span></button>`);
    node.onclick = ()=>checkSheet(item, title, list);
    nodes.push(node);
  }
  return Screen(title, nodes);
}

function checkSheet(item, title, list){
  const done = ckDone(item.id);
  const s = sheet(item.title, [
    el(`<p class="plain">${esc(item.why)}</p>`),
    el(`<ol class="plain" style="padding-left:22px">${item.steps.map(x=>`<li style="margin:8px 0">${esc(x)}</li>`).join('')}</ol>`),
    item.url ? BigBtn({title:'Open the page', arrow:false, onClick:()=>Shell.openExternal(item.url)}) : null,
    BigBtn({title: done?'Mark as not done':'Mark as done', primary:!done, arrow:false, onClick:async ()=>{
      S().lock.checklist[item.id] = !done;
      if(!done) Vault.log('Lock', item.title);
      await Vault.save(); s.close(); Nav.refresh();
      if(!done) toast('Done.');
    }})
  ]);
}

/* =============== boot =============== */
Shell.boot({ name:'Lock', glyph:EMBLEMS.lock, renderHome });
})();
