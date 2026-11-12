# StackPrep website

Landing page for StackPrep: AP1/AP2 exam prep for all IT apprenticeships (Fachinformatiker:in, IT-System-Elektroniker:in, Kaufleute für IT-System-Management, Kaufleute für Digitalisierungsmanagement) and computer science students in Germany, plus a contact form for training companies. The page itself is in German, the target audience's language.

Static site: plain HTML, one stylesheet, one small script. No build step, no dependencies, no third-party requests. The only server code is the endpoints in `api/`.

```
index.html            landing page
betriebe/index.html   page for training companies (/betriebe/) with the company form
impressum.html        legal stub (fill in the [placeholders])
datenschutz.html      privacy draft (fill in, then have it checked)
assets/css/styles.css
assets/js/main.js     forms (progressive enhancement) and visit attribution
assets/img/           logo mark and favicon
assets/fonts/         self-hosted fonts (see below)
api/waitlist/         waitlist endpoints (Vercel functions, see below)
api/betriebe/         form for training companies
api/besuch.mjs        counts visits through links with a source
_headers              security headers for Netlify / Cloudflare Pages
vercel.json           the same security headers for Vercel (where the site is hosted)
.well-known/security.txt
robots.txt
brand/                logo files and LinkedIn banners (not linked from the site)
```

## Before going live

1. **Fonts.** Done: `assets/fonts/Sora-Variable.woff2` (Sora v17, latin subset, weights 100–800, covers ä ö ü ß „“ €), licensed under the SIL Open Font License (`assets/fonts/Sora-OFL.txt`). It is self-hosted on purpose: embedding Google Fonts from Google's servers sends visitors' IP addresses to Google, which German courts have ruled a GDPR violation (LG München I, 3 O 17493/20). Until the files are there, the page falls back to system fonts.
2. **Placeholders.** Search for `[` in `impressum.html`, `datenschutz.html` and `.well-known/security.txt`.
3. **Waitlist backend.** Built, see "Waitlist backend" below. The confirmation e-mail still needs an e-mail provider.
4. **Headers.** Make sure your host sends the headers from `_headers`. Check with <https://securityheaders.com> and <https://observatory.mozilla.org> after deploying.

## Security model

- **Strict CSP**: `default-src 'none'`, everything else `'self'`. No inline scripts, no inline styles, no `eval`, no external origins. The same policy is also set as a `<meta>` tag as a fallback; the HTTP header is the one that counts (only it can set `frame-ancestors`).
- **No third parties**: no CDN, analytics, fonts or embeds. Nothing to compromise upstream and no cookie banner needed.
- **Clickjacking**: `frame-ancestors 'none'` plus `X-Frame-Options: DENY`.
- **HSTS**: two years with subdomains. Add `; preload` and submit to hstspreload.org only once every subdomain serves HTTPS.
- **Form script** writes only `textContent`, so nothing from the server or user input can inject markup. Without JavaScript the form still posts normally with native browser validation.
- **Honeypot** field `website` catches simple bots.

## Waitlist backend

The form posts `multipart/form-data` to `/api/waitlist` (`api/waitlist/index.mjs`). The entries are stored in the Convex backend of the StackPrep app (repo `Gamius00/stackprep-mvp`, `convex/waitlist.ts` and `convex/http.ts`). The two servers share a secret; the Convex routes reject every request without it.

What the endpoint does:

- Accepts only `POST` from `SITE_URL` (and its `www.` variant), checked via the `Origin` header.
- Validates `email` (max. 254 chars), `alter = 16plus` and `einwilligung = ja`. If the honeypot `website` is filled, it answers like a success and stores nothing.
- Rate-limits to 5 requests per 10 minutes per IP. Only an HMAC of the IP is stored.
- **Double opt-in**: stores the entry as `pending` with the consent time and `CONSENT_TEXT_VERSION`, and creates a random single-use token that expires after 48 hours. Only its SHA-256 hash is stored. The link in the e-mail opens `/api/waitlist/confirm`, which shows a button; only the button's `POST` confirms (mail scanners open links on their own).
- Gives the same answer whether an address is new, pending or already confirmed, so the form does not reveal who is on the list.
- Answers JSON when the script sends the form, and a plain page in the site's look for browsers without JavaScript. Every response is `Cache-Control: no-store`.

When you change the checkbox texts in `index.html`, bump `CONSENT_TEXT_VERSION` (waitlist) or `COMPANY_CONSENT_TEXT_VERSION` (company form) in `api/_lib/waitlist.mjs`.

The waitlist form also sends the optional profession (`beruf`) and the attribution (`quelle`, `kampagne`). Selecting “Etwas anderes” reveals an optional text field (`berufAndere`, max. 120 characters), saved as `professionOther` in Convex. Without JavaScript the field remains visible; its value is only saved when `beruf` is `andere`.

## Company form

The form for training companies lives on its own page, `/betriebe/`; the landing page links there. It posts to `/api/betriebe` (`api/betriebe/index.mjs`) and is stored in Convex (`convex/companyInquiries.ts`). Same origin check, honeypot and rate limit as the waitlist. There is no double opt-in, because it is a contact request, not a newsletter. Submitting again with the same address updates the inquiry instead of adding a second one.

## What a post or link brings

Use links with UTM parameters, for example `https://stackprep.de/?utm_source=linkedin&utm_campaign=launch-2026-11`. Values are lowercased and may contain `a-z 0-9 . _ -` (max. 40 characters).

- `assets/js/main.js` reads `utm_source` and `utm_campaign`. Without `utm_source` it falls back to the referrer (LinkedIn, Google, Instagram and so on map to one name each). It stores nothing in the browser.
- If there is a source, it sends one beacon to `/api/besuch`, which increments a daily counter per source and campaign in Convex (`campaignDailyStats`). Max. 30 counts per IP in 10 minutes.
- Both forms send the source along, so every waitlist entry and company inquiry has it, and the daily counters also count signups, confirmations and company inquiries.
- The numbers are in the admin dashboard of the StackPrep app (`/admin`, section "Herkunft der Anmeldungen").

Environment variables on Vercel:

| Variable | Value |
|---|---|
| `CONVEX_SITE_URL` | HTTP actions URL of the Convex deployment, for production `https://moonlit-sparrow-601.eu-west-1.convex.site` |
| `WAITLIST_API_SECRET` | Long random string; the same value as `WAITLIST_API_SECRET` on Convex |
| `SITE_URL` | Optional, defaults to `https://stackprep.de` |
| `RESEND_API_KEY`, `WAITLIST_FROM_EMAIL` | Optional. Once both are set, the confirmation e-mail is sent via [Resend](https://resend.com). Until then entries stay `pending` and the form says a confirmation e-mail will follow. |

## Same headers for other hosts

**nginx**

```nginx
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
server_tokens off;
```

## Local preview

```bash
python3 -m http.server 8080
```

The local server does not send the security headers; only the `<meta>` CSP applies there.
