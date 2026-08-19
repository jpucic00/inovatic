# Transactional emails

All outbound mail goes through **Resend** + **React Email**, in two layers.

## Sending — `src/lib/email/`

- **`client.ts`** — the lazy Resend client + `sendTransactionalEmail({ to, subject, react })`.
  It applies the sender identity and a **no-op gate**: when `RESEND_API_KEY` is unset
  (tests, preview builds — a developer's `.env.local` may well hold a working key) it
  sends nothing and returns `false`; on a real
  Resend rejection it throws, so each caller keeps its own error policy.
- **`senders.ts` / `index.ts`** — one typed sender per email, each owning its subject and
  mapping caller primitives onto a template. Import from `@/lib/email`:

  | Sender | Trigger | Recipient |
  | --- | --- | --- |
  | `sendInquiryConfirmationEmail` | public course inquiry submitted | parent |
  | `sendInquiryNotificationEmail` | public course inquiry submitted | the inquiry city's inbox, reply-to the parent |
  | `sendPartyInquiryConfirmationEmail` | public party (proslava) inquiry submitted | parent |
  | `sendPartyInquiryNotificationEmail` | public party (proslava) inquiry submitted | `prijave@`, reply-to the parent |
  | `sendScheduleOptionsEmail` | admin sends group options for a NEW inquiry | parent |
  | `sendStudentCredentialsEmail` | **nothing — no caller since 2026-08-17** (see below) | parent |
  | `sendTeacherCredentialsEmail` | teacher account created / password reset (`variant: 'new' \| 'reset'`) | teacher |
  | `sendBulkMessageEmail` | an admin runs a campaign from `/admin/email` | one mail per recipient row |
  | `sendReleaseNotesEmail` | a new version in `src/lib/releases.ts` reaches production | every non-deleted ADMIN, once per version |

**Student logins leave the building ONLY through a CREDENTIALS campaign (2026-08-17).** Creating
a student account — from an inquiry or manually — now mails nothing at all. An admin sends the
logins from `/admin/email` once contracts are signed, which is what makes the send deliberate,
auditable per family, and repeatable. `sendStudentCredentialsEmail` is kept for a possible
future single-child send but currently has no caller; do not wire it back into an account
creation path, because it has none of the campaign's per-child ownership check
(`assertCredentialsBelongTo`). Note `knip` cannot flag it — two unit tests reference it.

Sender identity **follows the city**: a sender that takes `city` passes it to
`sendTransactionalEmail`, which uses `cityInboxEmail(city)` as both the From address and the
default reply-to — `Inovatic <prijave@udruga-inovatic.hr>` for Split, `Inovatic
<prijave.sibenik@udruga-inovatic.hr>` for Šibenik. It is not configurable per environment (there
is no `EMAIL_FROM`); both addresses live on the one verified Resend domain. Association-level
mail with no city (the /stem-edukacija B2B form, Split-only proslave) keeps the association
address. The inbound notifications flip reply-to around — they go *to* an inbox and reply to the
person who submitted the form, so staff answer straight from Outlook.

Server actions call the senders and never touch Resend directly. The **error policy lives at
the call site**, not in the service: confirmations swallow-and-log, teacher credentials
swallow-and-flag (`emailSent` — the account is already committed and the password stays readable
in the UI), and schedule-options surfaces a send failure to the admin. Campaign sends record
their outcome per recipient row instead, so a failure is visible on `/admin/email/[campaignId]`
rather than thrown away.

## Templates — `emails/*.tsx`

Each template `export default`s its component and shares the scaffold, **logo header** and
footer via `emails/components/email-layout.tsx` (`<EmailLayout preview="…">` + the `emailStyles`
tokens). Every template also declares `Component.PreviewProps` with realistic sample data — this
is what the preview server renders.

The logo is served from Cloudinary (`branding/inovatic-logo`, delivered at `w_280`) via the
`LOGO_URL` constant in the layout — **not** from the app's `public/`, because email clients need
an absolute URL and the apex domain doesn't serve the new app's assets yet. Re-point `LOGO_URL`
if the logo moves or the app takes over the domain.

## Local preview

```bash
npm run email        # react-email dev server → http://localhost:3001
```

Open the URL and pick a template; it hot-reloads on edit. **Dynamic content** is driven by each
template's `PreviewProps` — edit that object (or change values live in the preview UI) to see
different states: the optional city / proposed-date lines present vs. absent, multiple schedule
options, the two teacher subjects, etc. Port 3001 keeps it clear of the Next dev server on 3000.
(The preview requires the `react-email` + `@react-email/ui` devDependencies, already installed.)

## Adding a new email

1. Create `emails/<name>.tsx`: build the body inside `<EmailLayout>`, `export default` the
   component, and add a `.PreviewProps` sample.
2. Add a typed sender in `src/lib/email/senders.ts` (it owns the subject) and re-export it from
   `index.ts`.
3. Call the sender from the relevant server action, wrapping it in the error policy that action
   needs.

## The one email with no server action behind it

`release-notes.tsx` is not triggered by anything a person clicks. It is sent by
`src/lib/release-announce.ts` when the server starts and finds a version in
`src/lib/releases.ts` that has no `ReleaseAnnouncement` row — i.e. by pushing a release.
It is also the only template addressed to staff rather than families, which is why it
sets `showSignature={false}`: a mail *to* the association must not close with the
association's own contact card. Notes are written by the `/release` skill; preview it
with `npm run email` like any other template.
