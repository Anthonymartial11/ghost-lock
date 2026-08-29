/* bigtech.js — the giants who hold the biggest file on you.
 *
 * Two levers per company, same as data brokers:
 *   1. STOP the collection (settings you switch off)
 *   2. DEMAND what they already hold (download it, then delete it)
 *
 * `impact` orders the list: 'critical' items are the ones that actually move
 * the needle. `warn` marks anything with a real trade-off you must understand
 * before doing it.
 */
window.BIGTECH = [

  /* ============================ APPLE ============================ */
  {id:'ap_adp', company:'Apple', impact:'critical', warn:true,
   title:'Turn on Advanced Data Protection',
   why:'This is the single biggest one. By default Apple keeps the keys to your iCloud backup, photos, notes and files — meaning they can read them and hand them over. This switch encrypts nearly all of it so only your devices can open it.',
   caution:'Real trade-off: if you lose access, Apple CANNOT recover your data. You must save a recovery key or set a recovery contact first. Do not enable this casually.',
   steps:['Settings → your name → Sign-In & Security → make sure Two-Factor Authentication is ON',
          'Settings → your name → iCloud → Advanced Data Protection',
          'Turn On, and follow the prompt to save a Recovery Key or add a Recovery Contact',
          'Write the recovery key down on paper and keep it somewhere safe — not on the phone']},

  {id:'ap_siglocations', company:'Apple', impact:'critical',
   title:'Erase Significant Locations',
   why:'A hidden log of where you sleep, work and visit, with dates and times, built automatically. Most people never know it exists.',
   steps:['Settings → Privacy & Security → Location Services',
          'Scroll to the bottom → System Services',
          'Significant Locations → Clear History',
          'Then turn Significant Locations OFF']},

  {id:'ap_syssvc', company:'Apple', impact:'high',
   title:'Shut down Apple’s system-level tracking',
   why:'Buried under System Services are switches feeding Apple analytics, ad targeting and routing data from your movements.',
   steps:['Settings → Privacy & Security → Location Services → System Services',
          'Turn OFF: iPhone Analytics, Routing & Traffic, Location-Based Suggestions, Location-Based Ads',
          'Leave Find My iPhone ON — that one protects you']},

  {id:'ap_ads', company:'Apple', impact:'high',
   title:'Kill Apple’s ad profile',
   why:'Apple runs its own ad business in the App Store, News and Stocks, and builds a profile of you to target it.',
   steps:['Settings → Privacy & Security → Apple Advertising → Personalized Ads OFF',
          'Settings → App Store → turn OFF Personalized Recommendations']},

  {id:'ap_analytics', company:'Apple', impact:'medium',
   title:'Stop sending Apple your analytics',
   why:'Detailed usage and diagnostic data from your device and iCloud, shared by default.',
   steps:['Settings → Privacy & Security → Analytics & Improvements',
          'Turn OFF: Share iPhone Analytics, Share iCloud Analytics, Improve Siri & Dictation, Share with App Developers']},

  {id:'ap_siri', company:'Apple', impact:'medium',
   title:'Delete your Siri history',
   why:'Recordings and transcripts of what you have said to your devices.',
   steps:['Settings → Apps → Siri → Siri & Dictation History → Delete Siri & Dictation History',
          'Do the same on Mac: System Settings → Apple Intelligence & Siri → Delete Siri & Dictation History']},

  {id:'ap_request', company:'Apple', impact:'critical',
   title:'Make Apple show you everything they hold',
   why:'Your legal right. You get a full export — then you can see exactly what to demand they delete.',
   url:'https://privacy.apple.com/',
   steps:['Open privacy.apple.com and sign in',
          'Choose "Request a copy of your data"',
          'Select ALL categories, submit',
          'They email you a download link (can take up to 7 days)']},

  {id:'ap_delete', company:'Apple', impact:'high', warn:true,
   title:'Delete specific Apple data (or the account)',
   why:'The same page lets you delete data or the whole Apple Account.',
   caution:'Deleting your Apple Account wipes purchases, iCloud content, iMessage and Find My. Only do the full deletion if you are leaving Apple entirely.',
   url:'https://privacy.apple.com/',
   steps:['privacy.apple.com → sign in',
          'Use "Request deletion of your account" only if you truly mean it',
          'Otherwise delete individual data from within each app/service first']},

  /* ============================ GOOGLE ============================ */
  {id:'go_activity', company:'Google', impact:'critical',
   title:'Delete your entire Google activity history',
   why:'Google holds a searchable record of what you searched, watched, said out loud, and where you went — often stretching back years. This is the largest single pile of data about you anywhere.',
   url:'https://myactivity.google.com/',
   steps:['Open myactivity.google.com',
          'Click "Delete" → "All time" → confirm',
          'Do it again under each tab: Web & App Activity, YouTube History, Location History (Timeline)']},

  {id:'go_autodelete', company:'Google', impact:'critical',
   title:'Make Google auto-delete going forward',
   why:'Deleting once does nothing if it starts refilling tomorrow. This caps how long they can keep anything new.',
   url:'https://myactivity.google.com/activitycontrols',
   steps:['Open myactivity.google.com/activitycontrols',
          'Web & App Activity → turn OFF (or set auto-delete to 3 months)',
          'YouTube History → turn OFF (or 3 months)',
          'Timeline / Location History → turn OFF',
          'Turn OFF "Include audio and video recordings"']},

  {id:'go_ads', company:'Google', impact:'high',
   title:'Kill Google’s ad profile',
   why:'Google guesses your age, income, interests and life events to sell ads. You can see the list — it is unsettling — and switch it off.',
   url:'https://myadcenter.google.com/',
   steps:['Open myadcenter.google.com',
          'Turn "Personalized ads" OFF',
          'Review the interests they inferred and remove them']},

  {id:'go_takeout', company:'Google', impact:'high',
   title:'Download everything Google has on you',
   why:'Your legal right to see the whole file before you demand deletion.',
   url:'https://takeout.google.com/',
   steps:['Open takeout.google.com',
          'Select all products → export',
          'Wait for the email, then review what surprises you']},

  {id:'go_devices', company:'Google', impact:'medium',
   title:'Cut off old devices and connected apps',
   why:'Apps and devices you forgot about still hold access to your Google account and its data.',
   url:'https://myaccount.google.com/security',
   steps:['Open myaccount.google.com/security',
          'Review "Your devices" → sign out anything you do not recognise',
          'Review "Your connections to third-party apps & services" → remove everything you do not actively use']},

  {id:'go_delete', company:'Google', impact:'high', warn:true,
   title:'Delete Google services you do not use',
   why:'You can delete individual services (YouTube history, Photos, etc.) without nuking your whole account.',
   caution:'Deleting the whole Google Account kills Gmail — including Ghost’s inbox scanning. Delete individual services instead unless you are fully leaving Google.',
   url:'https://myaccount.google.com/delete-services-or-account',
   steps:['Open myaccount.google.com/delete-services-or-account',
          'Choose "Delete a Google service" to remove them one at a time',
          'Keep Gmail if you still use it']},

  /* ============================ META ============================ */
  {id:'me_offmeta', company:'Meta', impact:'critical',
   title:'Cut Meta’s off-Facebook tracking',
   why:'Facebook and Instagram receive a feed of your activity from other companies’ websites and apps — even ones you never linked to them, even if you barely use Facebook.',
   url:'https://accountscenter.facebook.com/info_and_permissions',
   steps:['Open accountscenter.facebook.com → Your information and permissions',
          '"Your activity off Meta technologies" → Manage future activity → turn OFF',
          'Then "Clear previous activity"']},

  {id:'me_ads', company:'Meta', impact:'high',
   title:'Turn off Meta ad targeting',
   why:'Meta builds a profile from your activity, your data brokers’ files, and your friends.',
   url:'https://accountscenter.facebook.com/ad_preferences',
   steps:['accountscenter.facebook.com → Ad preferences',
          'Turn off activity-based targeting and data from partners',
          'Review and remove inferred interests']},

  {id:'me_download', company:'Meta', impact:'medium',
   title:'Download and delete your Meta data',
   why:'See the file, then remove it. Ghost’s account list also has the direct delete pages for Facebook and Instagram.',
   url:'https://accountscenter.facebook.com/info_and_permissions',
   steps:['accountscenter.facebook.com → Download your information',
          'Request everything, review it',
          'Then use Ghost’s "Delete my old accounts" for the account itself']},

  /* ============================ OTHERS ============================ */
  {id:'ot_amazon', company:'Amazon', impact:'medium',
   title:'Amazon: ad prefs, voice recordings, browsing history',
   why:'Amazon keeps your purchase, browsing and Alexa voice history and uses it for targeting.',
   url:'https://www.amazon.com/adprefs',
   steps:['amazon.com/adprefs → opt out of personalised ads',
          'Account → Alexa Privacy → Review Voice History → delete all',
          'Turn OFF "Save my voice recordings"',
          'Browsing History → Manage → Remove all + turn off']},

  {id:'ot_microsoft', company:'Microsoft', impact:'medium',
   title:'Microsoft: clear the activity dashboard',
   why:'Windows, Bing, Xbox and Edge activity collects in one place you can clear.',
   url:'https://account.microsoft.com/privacy',
   steps:['Open account.microsoft.com/privacy',
          'Clear browsing, search, location and voice activity',
          'Turn off personalised ads at account.microsoft.com/privacy/ad-settings']},

  {id:'ot_linkedin', company:'LinkedIn', impact:'low',
   title:'LinkedIn: stop data sharing',
   why:'LinkedIn shares profile data with partners and uses your activity for ads.',
   url:'https://www.linkedin.com/psettings/',
   steps:['linkedin.com/psettings → Data privacy',
          'Turn off "Social, economic and workplace research" and advertising data sharing',
          'Turn off profile visibility to search engines if you want to be unfindable']}
];
