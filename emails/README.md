# Transactional emails

All outbound mail goes through **Resend** + **React Email**, in two layers.

## Sending — `src/lib/email/`

- **`client.ts`** — the lazy Resend client + `sendTransactionalEmail({ to, subject, react })`.
  It applies the sender identity and a **no-op gate**: when `RESEND_API_KEY` is unset
  (local dev, tests, preview builds) it sends nothing and returns `false`; on a real
  Resend rejection it throws, so each caller keeps its own error policy.
- **`senders.ts` / `index.ts`** — one typed sender per email, each owning its subject and
  mapping caller primitives onto a template. Import from `@/lib/email`:

  | Sender | Trigger | Recipient |
  | --- | --- | --- |
  | `sendInquiryConfirmationEmail` | public course inquiry submitted | parent |
  | `sendPartyInquiryConfirmationEmail` | public party (proslava) inquiry submitted | parent |
  | `sendScheduleOptionsEmail` | admin sends group options for a NEW inquiry | parent |
  | `sendStudentCredentialsEmail` | student account created (from inquiry or manually) | parent |
  | `sendTeacherCredentialsEmail` | teacher account created / password reset (`variant: 'new' \| 'reset'`) | teacher |

Sender identity is **`EMAIL_FROM`** (must be a verified Resend sender domain), falling back to
`Inovatic <noreply@udruga-inovatic.hr>`. Reply-to is always `upisi@udruga-inovatic.hr`.

Server actions call the senders and never touch Resend directly. The **error policy lives at
the call site**, not in the service: confirmations swallow-and-log, credentials emails
swallow-and-flag (`emailFailed` / `emailSent`), and schedule-options surfaces a send failure to
the admin.

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
