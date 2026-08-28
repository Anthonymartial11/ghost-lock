/* delete-accounts.js — direct "delete my account" doors for common services.
   difficulty: easy = a few taps · medium = some digging · hard = they fight you */

window.DELETE_ACCOUNTS = [
  {id:'facebook', name:'Facebook', url:'https://www.facebook.com/help/delete_account', difficulty:'medium', note:'Choose DELETE, not deactivate. Takes 30 days to fully die.'},
  {id:'instagram', name:'Instagram', url:'https://www.instagram.com/accounts/remove/request/permanent/', difficulty:'medium', note:'Direct delete page. Log in first.'},
  {id:'x', name:'X / Twitter', url:'https://x.com/settings/deactivate', difficulty:'medium', note:'Deactivate, then it deletes after 30 days of not logging in.'},
  {id:'tiktok', name:'TikTok', url:'https://www.tiktok.com/setting', difficulty:'medium', note:'Settings → Manage account → Delete account.'},
  {id:'snapchat', name:'Snapchat', url:'https://accounts.snapchat.com/accounts/delete_account', difficulty:'easy', note:'Deactivates 30 days, then deletes.'},
  {id:'linkedin', name:'LinkedIn', url:'https://www.linkedin.com/mypreferences/d/close-account', difficulty:'easy', note:'Direct close-account page.'},
  {id:'reddit', name:'Reddit', url:'https://www.reddit.com/settings/account', difficulty:'easy', note:'Bottom of account settings → Delete account. Posts stay unless deleted first.'},
  {id:'pinterest', name:'Pinterest', url:'https://www.pinterest.com/settings/account-settings/', difficulty:'easy', note:'Account settings → Delete account.'},
  {id:'tumblr', name:'Tumblr', url:'https://www.tumblr.com/account/delete', difficulty:'easy', note:'Direct delete page.'},
  {id:'spotify', name:'Spotify', url:'https://support.spotify.com/us/article/close-account/', difficulty:'medium', note:'Follow close-account flow (chat may be required).'},
  {id:'amazon', name:'Amazon', url:'https://www.amazon.com/privacy/data-deletion', difficulty:'hard', note:'Request account closure + data deletion. Orders history dies with it.'},
  {id:'ebay', name:'eBay', url:'https://www.ebay.com/help/account/protecting-account/closing-account?id=4200', difficulty:'medium', note:'Close via account settings; takes 30 days.'},
  {id:'paypal', name:'PayPal', url:'https://www.paypal.com/myaccount/settings/', difficulty:'medium', note:'Settings → Close account. Withdraw money first.'},
  {id:'dropbox', name:'Dropbox', url:'https://www.dropbox.com/account/delete', difficulty:'easy', note:'Direct delete page. Download files first.'},
  {id:'discord', name:'Discord', url:'https://discord.com/channels/@me', difficulty:'easy', note:'User Settings → My Account → Delete account.'},
  {id:'twitch', name:'Twitch', url:'https://www.twitch.tv/user/delete-account', difficulty:'easy', note:'Direct delete page.'},
  {id:'yahoo', name:'Yahoo', url:'https://login.yahoo.com/account/delete-user', difficulty:'easy', note:'Direct delete page. Old Yahoo accounts are a top breach source.'},
  {id:'skype', name:'Skype / Microsoft', url:'https://account.microsoft.com/account/close-account', difficulty:'medium', note:'Closes the whole Microsoft account — check what it is tied to first.'},
  {id:'uber', name:'Uber', url:'https://help.uber.com/riders/article/delete-my-account?nodeId=cd93e0be-b02f-499f-ac07-3ee43b53c4d3', difficulty:'easy', note:'In-app: Settings → Privacy → Delete account.'},
  {id:'doordash', name:'DoorDash', url:'https://www.doordash.com/consumer/privacy/', difficulty:'medium', note:'Privacy page → Delete my data.'},
  {id:'venmo', name:'Venmo', url:'https://account.venmo.com/settings/profile', difficulty:'medium', note:'Settings → Close Venmo account. Transfer balance out first.'},
  {id:'myspace', name:'MySpace', url:'https://myspace.com/settings/profile', difficulty:'medium', note:'Old accounts = old photos of you still public. Delete from settings.'}
];
