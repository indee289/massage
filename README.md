# Sanya Messenger — GitHub + Supabase

Production-oriented Telegram Mini App architecture:

- Frontend: static HTML/CSS/JS, suitable for GitHub + GitHub Pages (or any static HTTPS host)
- Backend: Supabase Database + Realtime + Storage + Edge Functions
- Telegram: Mini App launch + Telegram Stars payment webhook
- Authentication: Telegram Mini App `initData` is verified in the Supabase Edge Function
- Realtime: Supabase Realtime, no WebSocket server to maintain
- Data: PostgreSQL, not SQLite

## 1. Create Supabase project

Create a Supabase project and open SQL Editor.

Run:

`supabase/schema.sql`

Then create a Storage bucket named `chat-media` and make it private.

## 2. Supabase secrets

In Supabase Dashboard → Edge Functions → Secrets, set:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_ID`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_WEBAPP_URL`

Never put the bot token or service-role key in frontend code.

## 3. Deploy Edge Functions

Install Supabase CLI, log in, link your project, then deploy:

```bash
supabase functions deploy api
supabase functions deploy telegram-webhook
```

The frontend calls the `api` function.

Set the Telegram webhook to:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/telegram-webhook`

Use the secret token configured above when registering the webhook.

## 4. Frontend

The `frontend/` folder is a static site.

For GitHub Pages:

1. Create a GitHub repository.
2. Upload the contents of `frontend/`.
3. Enable GitHub Pages from the repository settings.
4. Use the resulting HTTPS URL as the Telegram Mini App URL.

Important: Telegram Mini Apps require HTTPS for a public deployment.

## 5. Telegram Bot

In BotFather, configure your bot's Main Mini App / menu button to open the GitHub Pages URL.

Users open the Mini App from your bot and Telegram supplies `initData`.

## 6. Admin

Put your Telegram numeric ID in `TELEGRAM_ADMIN_ID`.

The admin can use the in-app Admin section to:

- see conversations
- reply to users
- search users
- ban/unban
- grant days
- grant lifetime access
- revoke premium
- broadcast

The frontend never receives the bot token.

## 7. Important security model

The browser does NOT decide who the user is.

Every protected API request sends Telegram's raw `initData` to the Edge Function. The Edge Function validates the HMAC signature using the Telegram bot token and then uses the verified Telegram user ID.

Supabase Row Level Security protects direct database access.

For production, keep the `service_role` key server-side only.

## 8. Realtime

Enable Realtime for:

- `messages`
- `profiles`
- `subscriptions`

The app subscribes to the current user's conversation and updates the UI instantly.

## 9. Telegram Stars

The `create-invoice` API creates a Telegram Stars invoice through Bot API.

After payment, Telegram sends `successful_payment` to `telegram-webhook`, which activates the user's 30-day Premium subscription.

Price: 299 XTR
Duration: 30 days

Lifetime access can be granted by the admin from the Admin screen.

## 10. GitHub Pages caveat

GitHub Pages is only static hosting. It is NOT the backend.

That is intentional here:

GitHub Pages → UI
Supabase → secure backend/database/realtime/storage
Telegram → identity + bot + payments

This keeps the architecture simple and avoids running a permanent Python server.
