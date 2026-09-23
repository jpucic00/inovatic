# DNS cutover: domene.hr → Cloudflare, WordPress → Railway

> **STATUS: Phases 0–7 completed 2026-08-03.** Apex and `www` serve the Next.js
> app from Railway with valid Let's Encrypt certificates; M365 mail, Resend and
> all verification records survived intact. **Phase 8 cleanup is outstanding —
> the SPF `+a` fix is now live-affecting and should not wait.**
>
> During cutover Railway answered the apex from `69.46.46.20` and then
> `69.46.46.23` within the same evening. That rotation, inside hours, is the
> concrete reason a pinned `A` record was never viable and Cloudflare's CNAME
> flattening was required.

Moves DNS hosting for `udruga-inovatic.hr` to Cloudflare so the apex can point at
Railway, retires the old WordPress site, and keeps Microsoft 365 mail working
throughout.

**Guiding principle:** replicate the zone in Cloudflare *exactly as it is today*,
verify it by querying Cloudflare directly while it is still inert, delegate, and
only then change anything. At no point are the old and new zones allowed to
disagree.

---

## Measured starting state (2026-08-03)

| Fact | Value |
|---|---|
| Registry / registrar | CARNET via domene.hr (free `.hr`) |
| Delegation at registry | `dns1.webmedia.hr`, `dns2.webmedia.hr` — TTL **14400** (4 h) |
| In-zone NS (informational) | `dns1.cdn.hr`, `dns2.cdn.hr` |
| Zone host | Avalon / CDN.hr, edited via cPanel Zone Editor |
| All zone record TTLs | **300** (5 min) — cutover and rollback are fast |
| DNSSEC | **Not enabled** — no DS record at the registry |
| Old hosting IP | `185.58.73.35` |
| Railway target | `xup747x0.up.railway.app` (TTL 60) |
| Mail | Microsoft 365 |

No DNSSEC is the single most important one: a DS record left at the registry
during a nameserver change causes total resolution failure. There is none, so
this migration has no such trap.

---

## Complete record inventory

Everything currently in the zone, and what happens to it.

### Must be preserved — Microsoft 365 depends on these

| Type | Name | Value | Prio |
|---|---|---|---|
| MX | `@` | `udrugainovatic-hr01e.mail.protection.outlook.com` | 0 |
| TXT | `@` | `v=spf1 ip4:185.58.73.35 +a +mx +ip4:185.58.73.11 +include:spf.protection.outlook.com -all` | |
| TXT | `@` | `MS=ms40956879` | |
| TXT | `_dmarc` | `v=DMARC1; p=none` | |
| CNAME | `autodiscover` | `autodiscover.outlook.com` | |
| CNAME | `enterpriseregistration` | `enterpriseregistration.windows.net` | |
| CNAME | `enterpriseenrollment` | `enterpriseenrollment.manage.microsoft.com` | |

`MS=ms40956879` is the M365 domain-ownership proof. Removing it can cause
Microsoft to un-verify the domain, which breaks mail flow. It looks like junk.
It is not.

### Must be preserved — Resend

| Type | Name | Value | Prio |
|---|---|---|---|
| TXT | `resend._domainkey` | your DKIM public key | |
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | |

### Changes to Railway in Phase 6

| Type | Name | Before | After |
|---|---|---|---|
| A → CNAME | `@` | `185.58.73.35` | `xup747x0.up.railway.app` |
| CNAME | `www` | `udruga-inovatic.hr` | `xup747x0.up.railway.app` |

### Replicate temporarily, delete in Phase 8

| Type | Name | Value |
|---|---|---|
| A | `mail`, `webmail`, `cpanel`, `whm`, `ftp`, `webdisk`, `cpcalendars`, `cpcontacts` | `185.58.73.35` |
| TXT | `default._domainkey` | cPanel's own DKIM key |

Replicate `mail` as an **A record**, not as the CNAME-to-apex it currently is.
Otherwise it follows the apex to Railway in Phase 6.

### Do not replicate

| Type | Name | Why |
|---|---|---|
| TXT | `_acme-challenge` | spent Let's Encrypt validation token |

---

## Phase 0 — Pre-flight

1. **Back up WordPress** — files and database, downloaded locally. Unrecoverable
   once the cPanel account is closed.
2. **Confirm nobody uses cPanel services** — webmail, FTP, cPanel mailboxes. Mail
   is on M365, so these are almost certainly vestigial. Ask before assuming.
3. **Confirm the Railway app works** on `xup747x0.up.railway.app` first. Never
   debug the app and DNS at the same time.
4. **Create the Cloudflare account** with an email address **not** on
   `udruga-inovatic.hr`. If DNS breaks, mail breaks with it, and a password reset
   sent to an address that can't receive it is a dead end. Enable 2FA. Register it
   as the association's account, not a personal one.

Domain registration is already confirmed independent of the hosting — the free
`.hr` comes from CARNET, not from CDN.hr.

---

## Phase 1 — Get Resend verified first

Add the three Resend records in cPanel and confirm Resend shows the domain
verified. Doing this before the migration means a later failure is attributable
to the migration rather than to Resend setup.

```bash
dig +short TXT resend._domainkey.udruga-inovatic.hr
dig +short MX send.udruga-inovatic.hr
dig +short TXT send.udruga-inovatic.hr
```

**After this, make no further changes in cPanel Zone Editor.** The two zones must
stay identical until the delegation completes.

---

## Phase 2 — Build the Cloudflare zone

Add `udruga-inovatic.hr` to Cloudflare, Free plan. Cloudflare scans the existing
zone — **treat the result as a draft**. It routinely misses records.

Enter every row from the inventory above. Two rules:

- **Apex stays on `185.58.73.35`.** Do not point anything at Railway yet.
- **Everything is DNS-only (grey cloud).** Nothing proxied.

The grey-cloud rule matters most for `autodiscover`. Cloudflare defaults new
CNAMEs to proxied, and a proxied `autodiscover` breaks Outlook client
autoconfiguration for everyone in the association — the most likely way to
silently damage M365 in this migration. Check all three
`autodiscover` / `enterpriseregistration` / `enterpriseenrollment` rows
explicitly.

Do not skip to Phase 4 because Cloudflare's banner says the zone is ready. It has
no idea whether your records are complete.

---

## Phase 3 — Verify the replica while it is still inert

This is the safety gate that makes the whole migration low-risk. Cloudflare's
assigned nameservers answer queries for your zone **before** you delegate to
them, so you can prove the zone is correct while the live site and mail are
completely untouched.

Cloudflare gives you two nameservers, e.g. `kate.ns.cloudflare.com`. Query them
directly:

```bash
NS=kate.ns.cloudflare.com   # substitute your assigned nameserver
for q in "MX @" "TXT @" "A @" "TXT _dmarc" "CNAME autodiscover" "CNAME enterpriseregistration" "CNAME enterpriseenrollment" "TXT resend._domainkey" "MX send" "TXT send" "CNAME www"; do
  set -- $q
  n=$([ "$2" = "@" ] && echo "udruga-inovatic.hr" || echo "$2.udruga-inovatic.hr")
  echo "--- $1 $n"; dig @$NS +short $1 $n
done
```

Compare every answer against the live zone:

```bash
for q in "MX @" "TXT @" "A @" "TXT _dmarc" "CNAME autodiscover" "TXT resend._domainkey" "MX send" "CNAME www"; do
  set -- $q
  n=$([ "$2" = "@" ] && echo "udruga-inovatic.hr" || echo "$2.udruga-inovatic.hr")
  echo "--- $1 $n"; dig @dns1.webmedia.hr +short $1 $n
done
```

**Every line must match.** A missing MX here is a mail outage in Phase 4. Do not
proceed on a partial match.

---

## Phase 4 — Switch the delegation

In the **domene.hr** administration panel (not cPanel — cPanel's NS records are
in-zone and irrelevant), replace:

```
dns1.webmedia.hr  →  coraline.ns.cloudflare.com
dns2.webmedia.hr  →  ishaan.ns.cloudflare.com
```

Phase 3 diff verified clean on 2026-08-03: all 11 core records identical between
both Cloudflare nameservers and the live zone, no proxy leaks on the M365 CNAMEs,
all 8 cPanel subdomains replicated.

**Do not add glue A records.** Glue is only needed when a nameserver lives inside
the domain it serves. Cloudflare's are under `ns.cloudflare.com`, already
resolvable.

Nothing changes for visitors or mail — both zones serve identical data.

Timing: domene.hr publishes in ~2 h, but the old delegation is cached for its
TTL of **14400 s (4 h)**. Budget half a day before it is fully settled.

---

## Phase 5 — Verify propagation, then test mail

```bash
dig +short NS udruga-inovatic.hr
dig +short MX udruga-inovatic.hr
dig +short A udruga-inovatic.hr
dig +short CNAME autodiscover.udruga-inovatic.hr
dig +short TXT udruga-inovatic.hr
```

Cloudflare's dashboard should report the zone **Active**.

Then test M365 for real, not just via DNS:

1. Send an email **to** an `@udruga-inovatic.hr` address from an outside account.
2. Send an email **from** an `@udruga-inovatic.hr` address to an outside account.
3. Confirm Outlook still connects — ideally add the account fresh on one device
   to exercise `autodiscover`.

The website is still WordPress at this point. **Do not proceed until mail is
confirmed working.** This is the checkpoint the whole ordering exists to create.

---

## Phase 6 — Point the domain at Railway

1. In Railway, add **both** custom domains: `udruga-inovatic.hr` and
   `www.udruga-inovatic.hr`. Railway must know a domain before it will route it
   or issue a certificate.
2. In Cloudflare:

   | Type | Name | Value | Proxy |
   |---|---|---|---|
   | CNAME | `@` | `xup747x0.up.railway.app` | DNS only |
   | CNAME | `www` | `xup747x0.up.railway.app` | DNS only |

   Delete the old `A @ 185.58.73.35`. Cloudflare accepts a CNAME at the apex and
   flattens it into A records automatically.
3. Keep both **grey cloud** so Railway's Let's Encrypt challenge isn't
   intercepted.
4. Wait for Railway to mark both domains Active with a valid certificate.

At 300 s TTL this takes effect in about five minutes, and reverting
`@` to `A 185.58.73.35` restores WordPress just as fast.

Optional afterwards: switch `@` and `www` to orange cloud for Cloudflare's CDN,
with SSL/TLS mode **Full (strict)**. Mail records stay grey permanently.

---

## Phase 7 — Railway configuration

**No code changes and no required env changes.** The app is already configured
for this:

- `src/lib/auth.config.ts:12` sets `trustHost: true` — added precisely because
  Railway sits behind a reverse proxy. Auth.js resolves redirects against the
  real request origin, not against a configured URL, so login works on any
  hostname without setting `AUTH_URL` / `NEXTAUTH_URL`.
- `publicBaseUrl()` in `src/lib/email/senders.ts:15` falls back to the literal
  `'https://udruga-inovatic.hr'`, which is the target domain. Email links are
  already correct even with nothing set.
- Canonical URLs are hardcoded to the apex in `src/app/sitemap.ts`,
  `src/app/robots.ts`, `src/app/layout.tsx` and every page's
  `alternates.canonical`.

### Env vars: nothing to set

`NEXT_PUBLIC_APP_URL` is **not** a declared ARG, so setting it in Railway has no
build-time effect. Leave it unset and let the fallback apply.

Umami is not in use yet. `UmamiAnalytics` returns `null` unless **both**
`NEXT_PUBLIC_UMAMI_SCRIPT_URL` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` are set
(`src/components/public/umami-analytics.tsx:17`), so `NEXT_PUBLIC_UMAMI_DOMAINS`
is never read. Nothing to configure at cutover.

**When Umami is enabled later:** all three are declared `ARG`s in the Dockerfile
and therefore inlined at *build* time. Set them in Railway and **trigger a
redeploy** — a restart silently keeps the old (empty) values. Set
`NEXT_PUBLIC_UMAMI_DOMAINS` to `udruga-inovatic.hr` at that point.

### Verification — this is the real work of Phase 7

1. **Submit a real inquiry** from `/upisi`. This is the highest-value single
   test: it exercises a Server Action (every mutation in the app is one), the DB,
   and Resend end to end. `next.config.ts` sets no
   `serverActions.allowedOrigins`, so Next derives the allowed origin from the
   proxied host — it works today on `*.up.railway.app`, but a custom domain is a
   different host, so prove it rather than assume it.
2. **Log in as admin** on the new domain, then as a teacher and a student.
3. Confirm the inquiry email arrived, with links pointing at
   `https://udruga-inovatic.hr`.
4. Spot-check old WordPress URLs against `src/lib/wp-redirects.ts`.
5. `/sitemap.xml`, `/robots.txt`, and `/kontakt` (308 → `/lokacije`).
6. Confirm Cloudinary images render — `remotePatterns` allows
   `res.cloudinary.com` and is domain-independent, so this should be free.

---

## Phase 8 — Cleanup, after a stable week

**Fix the SPF record** — this one matters:

```
v=spf1 include:spf.protection.outlook.com -all
```

The current record contains `+a`, meaning "whatever IP the apex resolves to may
send mail as this domain." Once the apex points at Railway, that authorizes
Railway's shared edge IPs — infrastructure shared with every other Railway
tenant — to send mail as `udruga-inovatic.hr`. `ip4:185.58.73.35` and `+mx` are
likewise stale. Resend is unaffected; it authenticates via the `send.` subdomain.

Then delete:

- `default._domainkey` (cPanel's DKIM)
- `mail`, `webmail`, `cpanel`, `whm`, `ftp`, `webdisk`, `cpcalendars`, `cpcontacts`

**Close the cPanel hosting last**, only after the backup is verified.

Export the Cloudflare zone (BIND format) and keep the file as a backup.

---

## Rollback

| Phase | How to undo | Time |
|---|---|---|
| 2–3 | Delete the Cloudflare zone; nothing was live | instant |
| 4 | Restore `dns1/dns2.webmedia.hr` at domene.hr | ~4 h |
| 6 | Restore `A @ 185.58.73.35` in Cloudflare | 5 min |
| 8 | Restore the previous SPF string | 5 min |

Keep the cPanel account alive at least 30 days after cutover as the escape hatch.

---

## Optional hardening, later

- Add M365 DKIM (`selector1` / `selector2._domainkey` CNAMEs). You currently have
  none, so M365 signs as `onmicrosoft.com`.
- Tighten DMARC from `p=none` to `p=quarantine` once you've confirmed all
  legitimate senders pass.

Do both well after the migration, separately.
