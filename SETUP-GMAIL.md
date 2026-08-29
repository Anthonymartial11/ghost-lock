# Turn on Ghost's Gmail hookup (about 5 minutes, one time)

Ghost talks straight to your Gmail using **your own** Google app key. You create that key once. It is safe to be public — what protects your inbox is Google's own sign-in and the fact that only *you* are allowed to use your app.

## What you're creating
A free "OAuth Client ID" in Google Cloud. No billing, no code.

## Steps

1. Go to **console.cloud.google.com** and sign in with the Gmail you want Ghost to manage.
2. Top bar → project dropdown → **New Project** → name it `Ghost` → Create. Select it.
3. Left menu → **APIs & Services → Library**. Search **Gmail API** → open it → **Enable**.
4. Left menu → **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - App name `Ghost`, your email for the two contact fields → Save and continue.
   - **Scopes** page: Save and continue (we request scopes from the app itself; nothing to add here).
   - **Test users** → **Add users** → add your own Gmail address → Save. (Leaving the app in "Testing" and listing only yourself is exactly what we want — no one else can ever use it.)
5. Left menu → **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Name: `Ghost web`.
   - **Authorized JavaScript origins → Add URI:** `https://anthonymartial11.github.io`
   - **Authorized redirect URIs → Add URI:** `https://anthonymartial11.github.io/ghost-lock/ghost/`
   - Create.
6. Copy the **Client ID** it shows (ends in `.apps.googleusercontent.com`).
7. Send me that Client ID. I paste it into `shared/gmail-config.js`, redeploy, and the "Scan my inbox" feature goes live. (Or edit that file yourself and push.)

## What Ghost can and cannot do with this
- **Can:** read message *headers* in your Promotions category (sender, subject, unsubscribe instructions) and send the unsubscribe emails you approve.
- **Cannot:** read the body/content of any email. Delete anything. Touch any inbox but the one you sign in with. Act without your tap.
- The access key lives in memory only, expires within an hour, and **Disconnect** revokes it at Google immediately.

## Note on the "unverified app" screen
Because the app stays in Testing with only you as a user, Google shows a "Google hasn't verified this app" notice at sign-in. That's expected for a personal app — tap **Advanced → Go to Ghost (unsafe)**. It is your own app; the warning is Google's blanket message for un-published apps, not a sign of danger.
