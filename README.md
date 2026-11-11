# E-Service Book Campaign Platform: GitHub + Vercel + Supabase

Email (automatic), SMS, WhatsApp, Pop-up campaigns, accounts (owner / admin / user), Admin panel, activity log.

IMPORTANT: when you upload to GitHub, `index.html` and the `api` folder must be at the TOP of the repository
(not inside another folder). This is the #1 cause of "404 / page error".

## Files
index.html, config.js, logo.png, package.json, vercel.json, .env.example
api/process-queue.js  (sends emails, called every minute)
api/claim-owner.js    (owner setup with the owner code)
api/unsub.js          (unsubscribe link)
api/health.js         (checks your setup)
supabase/schema.sql   (the database)

## Setup (about 30 minutes, use a laptop)
1. SUPABASE (supabase.com, free): New project (save the database password). Open SQL Editor -> New query ->
   paste ALL of supabase/schema.sql -> Run. It must say "Success". Then Authentication -> Providers -> Email ->
   turn OFF "Confirm email" -> Save. Then Project Settings -> API: copy Project URL, anon key, service_role key.
2. config.js: put the Project URL and anon key between the quotes. (The service_role key NEVER goes here.)
3. GITHUB (github.com): New repository (private is fine). Add file -> Upload files -> drag in everything from this folder
   (index.html, api folder, etc.) -> Commit.
4. VERCEL (vercel.com, sign in with GitHub): Add New -> Project -> Import your repository.
   Framework Preset: Other. Root Directory: leave as is. Build Command, Output Directory: leave empty.
   Open "Environment Variables" and add EVERY line from .env.example (SUPABASE_SERVICE_KEY is secret).
   SITE_URL = your final address, for example https://my-esb.vercel.app. Click Deploy.
5. If you add or change a variable later: Deployments -> the latest -> Redeploy.
6. EMAIL SENDER (free): cron-job.org -> Create cronjob -> URL
   https://YOUR-SITE.vercel.app/api/process-queue?key=YOUR_CRON_SECRET -> every 1 minute -> Save.
   (Vercel's free plan cannot run jobs every minute itself, so this small free service calls it.)
7. CHECK: open https://YOUR-SITE.vercel.app/api/health?key=YOUR_CRON_SECRET . Every env line should say "set",
   database "ok", smtp "ok: login works". Fix anything that says MISSING or ERROR.
8. OWNER: open your site -> Owner setup -> email, password, owner code. Do this first.
9. EMAIL DNS: ask your email host to set SPF and DKIM for eservicebook.com.bd. Start with about 50 emails a day.

## Test checklist
Owner setup works / sign up a second account / Owner makes it Admin in Admin panel -> Users / add yourself as a contact /
send yourself an email (arrives within about 2 minutes with logo, button and unsubscribe link) / click Unsubscribe /
schedule an email 5 minutes ahead / WhatsApp button opens a chat / Admin panel -> Activity log shows everything.

## If you see an error
- Vercel 404 NOT_FOUND: files are inside a folder in GitHub. Move index.html and api to the top, or set Root Directory.
- "Setup needed" on the site: config.js still has the placeholder text.
- /api/... shows 404: the api folder was not uploaded.
- /api/... shows 500 or FUNCTION_INVOCATION_FAILED: open /api/health?key=... to see what is missing, then Redeploy.
- "Wrong owner code": OWNER_CODE_HASH is missing or not the 64-character value from .env.example. Redeploy after fixing.
- "Your profile was not found": schema.sql did not finish. Run it again. If you had users before, delete them in Supabase -> Authentication -> Users.
- Emails stay "queued": the cron-job.org job is missing, or its key does not match CRON_SECRET.
- Emails show "failed": the reason is in History. Usually SMTP_HOST, SMTP_PORT (465 or 587) or SMTP_PASS is wrong.
- Old page after a fix: refresh with Ctrl+Shift+R.

Notes: Vercel's free (Hobby) plan is meant for personal, non-commercial use; a company site needs Vercel Pro.
The Supabase free database pauses after a week without use; the 1-minute job keeps it awake.
SMS and WhatsApp campaigns queue messages and you tap Open SMS / Open chat to send each one.
Automatic WhatsApp needs Meta's WhatsApp Business Platform; automatic SMS needs an SMS gateway.
