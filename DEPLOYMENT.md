# Deployment checklist

Go through this before each production deploy of the cookie and consent (UK GDPR / PECR) release, and again whenever the hosting settings change. Steps 1 to 3 are environment variables. Steps 4 to 6 are scripts the owner runs by hand: each does a dry run by default, and writes only when given `--apply`.

## 1. `TRUSTED_CLIENT_IP_HEADER=do-connecting-ip` (DigitalOcean App Platform, run time)

Set this before the deploy, not after.

- **Where:** Apps → mployedin → the web service → Settings → Environment Variables. Scope: **Run time**.
- **What happens without it:** every visitor shares one rate-limit bucket, called `"direct"`.
  - One script can lock sign-in, sign-up and password reset for everyone.
  - Every IP address the app stores (audit log, sign-up and Terms consent rows, signatures) reads `direct`.
- **How you'll notice:**
  - The server logs an error once at start-up: `[clientIp] No trusted client-IP source is configured ...`.
  - Admin → System health shows a red "Visitor IP addresses aren't configured" panel.
- **Do not set `TRUSTED_PROXY_HOPS`** on DigitalOcean.
- **Then confirm that DigitalOcean overwrites a client-sent value.** Send `curl -s -H "do-connecting-ip: 203.0.113.99" https://<domain>/api/countries -o /dev/null`, and check that the app logged your own address, not `203.0.113.99`. If it logged `203.0.113.99`, the header can be forged on this host: stop and tell the developer.

## 2. `RECAPTCHA_ALLOWED_HOSTS` (run time)

- **Value:** the apex domain, `www`, and the staging host, comma-separated.
- **Why:** when `RECAPTCHA_SECRET_KEY` is set, a token from a host that is not listed is refused. The contact form and the quick-apply code would then fail with 403.

## 3. `NEXT_PUBLIC_SPACES_PUBLIC_HOST` (build time; rebuild after setting it)

- **Value:** the bucket host and/or its CDN host, comma-separated if both. For example: `<bucket>.<region>.digitaloceanspaces.com,<bucket>.<region>.cdn.digitaloceanspaces.com`.
- **What it does:** public pages then load images only from those hosts, and `/api/image-proxy` fetches only from them.
- **Before setting it:** check that stored image URLs use the hosts you list.

## 4. Unique indexes: `scripts/consent-receipt-unique-index.mjs`

This builds two indexes:
- one cookie receipt per choice reference;
- one consent-log row per account, reference and category.

Run it on staging, and on production if `ensureIndexes` logs `UNIQUE index FAILED` for `consentreceipts` or `consentlogs`:

1. Dry run: `node --env-file=.env scripts/consent-receipt-unique-index.mjs`. Read what it would remove.
2. Then: `node --env-file=.env scripts/consent-receipt-unique-index.mjs --apply`.
3. If it prints `RE-RUN THE SCRIPT` (exit code 1), a duplicate arrived while it ran. Run it again with `--apply`.

The Atlas cluster needs free space for the index builds.

## 5. Cookie Policy: `scripts/update-legal-content.mjs`, only after solicitor sign-off

- **Order:**
  1. The solicitor signs off the generated en and ar text. The review copy comes from `node scripts/write-cookie-policy-review.mjs`.
  2. Dry run: `node scripts/update-legal-content.mjs`. It shows the size change and the first changed lines for each language.
  3. Then: `node --env-file=.env scripts/update-legal-content.mjs --apply`.
- **Scope:** it writes only the Cookie Policy. The Privacy Policy is written only if you name it with `--slug=privacy-policy`. Don't do that until the Privacy Policy text is refreshed and signed off.
- **Until it is applied:** `/cookies` shows the policy generated from the registry instead of the old CMS text. The server logs a warning saying so.
- **After applying:** replace `PREVIOUS_COOKIE_BODY*` in the script with the applied text.

## 6. Avatar re-host: `scripts/rehost-provider-avatars.mjs`

- A dry run is fine.
- Run `--apply` only on a release where admin erasure deletes stored profile photos. That is the case from the final GDPR fix wave on (`src/lib/gdpr/erasure.ts`, `eraseStoredAvatar`); never run it on an older build.
- [LEGAL] The privacy notice must say that our server fetches and keeps a copy of the Google or LinkedIn profile photo, and on what basis.
