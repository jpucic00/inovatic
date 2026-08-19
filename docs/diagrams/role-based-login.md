# Role-Based Login Redirect

After a successful login, the user lands on the route that matches their `UserRole`. The same mapping is enforced on every subsequent request at two layers — edge `middleware.ts` and per-page `requireX()` guards — so a stale link or direct URL can never escape the role boundary.

| Role | Post-login `router.push` target | Edge middleware allows | Server-side guard helpers that pass |
|---|---|---|---|
| `ADMIN` | `/admin` — **unless dual-role**, then a panel chooser (see below) | `/admin/*`, `/nastavnik/*`, `/portal/*` (any auth) | `requireAuth`, `requireAdmin`, `requireTeacher` *(ADMIN bypass for support)* |
| `TEACHER` | `/nastavnik` | `/nastavnik/*`, `/portal/*` (any auth) | `requireAuth`, `requireTeacher` |
| `STUDENT` | `/portal` — **only with an ACTIVE enrollment** | `/portal/*` (any auth) | `requireAuth`, `requireStudent`, `requireActiveStudent` |
| unauthenticated | `/portal` — the login screen renders **in place** there | nothing below `/portal`; every other match redirects to `/portal` | none |

> **`/portal` is both the sign-in screen and the student destination (2026-08-06).** The URL swap moved the public signup form onto `/prijava` and login onto `/portal`, so there is no standalone sign-in route any more: `(portal)/portal/page.tsx` branches — guest (or a fail-closed session with no `city` claim) → `<LoginScreen>`, ADMIN → `/admin`, TEACHER → `/nastavnik`, STUDENT → dashboard. Every auth redirect in the app targets `/portal`, which makes it the **loop terminator**: it must never bounce a guest. The middleware therefore exempts the exact `/portal` path (see below) and the `(portal)` layout no longer gates — its chrome renders only for a city-bearing STUDENT, and access control lives in the student actions' own `requireStudent()`.

> **Student access is gated on being currently in a program (2026-08-17).** "Active" means the CURRENT school year **plus the NEXT** — `activeSchoolYears()` / `activeEnrollmentWhere()` in `src/lib/enrollment-activity.ts`, the single definition behind the login gate, the token revalidation and every student-facing read. The next-year arm is not a nicety: next year's accounts are created over the summer and the CREDENTIALS campaign runs in the same window, so a current-year-only rule would refuse every child the moment they used the password they had just been mailed. There is deliberately **no grace tail** after 1 September — a child who was not re-enrolled losing access then is the requested behaviour. The TS and Prisma forms must stay in sync; a unit test asserts they agree.

> Middleware lets any authenticated user through to `/portal/*`, but `requireStudent()` rejects non-STUDENT roles at the page level. ADMIN bypass inside `requireTeacher()` is deliberate so admins can support a class without holding a teacher seat.

> **Dual-role admin.** An `ADMIN` who also holds at least one `TeacherAssignment` (e.g. the Šibenik city admin, who is also that city's only teacher) is **not** auto-redirected. `loginAction` returns `showTeacherPanel: true` and `LoginForm` swaps the form for a two-button chooser — *Administracija* → `/admin`, *Nastavnički panel* → `/nastavnik`. No guard or middleware change was needed: both prefixes already accept `ADMIN` via the middleware `/nastavnik` branch and the `requireTeacher` bypass. A non-teaching admin never sees the chooser — `/admin` is their unambiguous landing page — but the admin sidebar's "Nastavnički panel" shortcut is unconditional, so `/nastavnik` is one click away for them too.

## Login → first redirect

```mermaid
sequenceDiagram
    actor User
    participant Form as LoginForm (client component)
    participant Action as loginAction (server action)
    participant Auth as next-auth signIn('credentials')
    participant DB as User table
    participant Router as next/navigation router

    User->>Form: identifier + password
    Form->>Form: react-hook-form + Zod (loginSchema)
    Form->>Action: loginAction({ identifier, password })

    Action->>Action: loginSchema.safeParse
    Note right of Action: invalid → 'Podaci nisu valjani.'

    Action->>Auth: signIn('credentials', { redirect: false })
    Auth->>Auth: Zod parse — z.string().email().safeParse(identifier)
    Note right of Auth: success → lookup by email<br/>fail → lookup by username
    Auth->>DB: findUnique by chosen field (select includes deletedAt + city)
    DB-->>Auth: { passwordHash, role, deletedAt, city } or null
    alt user missing or user.deletedAt is set
        Auth-->>Action: return null → AuthError
    end
    Auth->>Auth: bcrypt compare password vs passwordHash
    alt role === 'STUDENT'
        Auth->>DB: enrollment.count({ userId, schoolYear in activeSchoolYears() })
        DB-->>Auth: n
        alt n === 0
            Auth-->>Action: throw NoActiveProgramError (code 'no_active_program')
            Note right of Action: 'Vaš račun više nije dio nijednog programa…'<br/>Deliberately different copy from the wrong-password case —<br/>the password WAS right. This is the PRIMARY gate because<br/>it is the only point where NO cookie is ever minted.
        end
    end
    Auth-->>Action: ok or AuthError
    Note right of Action: AuthError → 'Pogrešno korisničko ime ili lozinka.'
    Note over Auth,DB: JWT callback stamps token.city on login and re-checks<br/>deletedAt + role + city every refresh (60s TTL) via revalidateTokenClaims.<br/>A legacy token WITHOUT a city claim is refreshed immediately regardless<br/>of TTL — a prod city flip propagates without re-login (src/lib/auth-token.ts)
    Note over Auth,DB: revalidateTokenClaims ALSO evicts a STUDENT whose active-enrollment<br/>count has fallen to 0 (returns null) — the JWT has no maxAge override, so<br/>@auth/core's 30-day default would otherwise keep a cookie minted on 31 August<br/>valid deep into September. It sits INSIDE the same try as the deletedAt check,<br/>so the deliberate fail-open covers it: a Neon cold start must not log out the<br/>whole student body. Worst case ~60s of stale access at the rollover.

    Action->>DB: findUnique by email or username (select id + role for routing)
    DB-->>Action: { id, role }
    Note right of Action: missing row → same error string<br/>(don't leak which field was wrong)

    alt role === 'ADMIN'
        Action->>DB: teacherAssignment.count({ where: { userId: id } })
        DB-->>Action: n
        Note right of Action: showTeacherPanel = n > 0
    end

    Action-->>Form: { success: true, role, showTeacherPanel }

    alt ADMIN and showTeacherPanel
        Form->>Form: renders "Prijava uspješna. Odaberite panel:"
        User->>Form: clicks Administracija or Nastavnički panel
        Form->>Router: goTo('/admin') or goTo('/nastavnik')
    else
        Form->>Form: destination = '/portal' (default)<br/>ADMIN → '/admin'<br/>TEACHER → '/nastavnik'
        Form->>Router: goTo(destination)
    end
    Note over Form,Router: goTo(d) = router.push(d) + router.refresh()
```

> Sources: `src/actions/login.ts` (server action, the dual-role `teacherAssignment.count` probe, and the `code === 'no_active_program'` branch that picks the message), `src/components/auth/login-form.tsx` (panel chooser + client role switch), `src/lib/auth.ts` `authorize()` (Zod email parse, `deletedAt` rejection, **and the active-enrollment gate**), `src/lib/auth.ts` jwt callback (re-check on refresh), `src/lib/auth-token.ts` (`revalidateTokenClaims`), `src/lib/enrollment-activity.ts` (the active-year definition). Line numbers are deliberately not cited — the previous ones (`auth.ts:17-33`, `:48-75`) had drifted by roughly twenty lines and pointed at unrelated code.

## Subsequent requests — edge middleware

```mermaid
flowchart TD
    REQ["Request matches matcher:<br/>/admin/:path*  /nastavnik/:path*  /portal/:path*"] --> PATH{Path prefix?}

    PATH -->|/admin| A{role === 'ADMIN'?}
    PATH -->|/nastavnik| N{role === 'TEACHER'<br/>or role === 'ADMIN'?}
    PATH -->|"exactly /portal"| EX["always continue —<br/>this IS the sign-in screen"]
    PATH -->|"below /portal"| P{req.auth set?}

    A -->|Yes| PASS[continue]
    A -->|No| RED["NextResponse.redirect → /portal"]
    N -->|Yes| PASS
    N -->|No| RED
    EX --> PASS
    P -->|Yes| PASS
    P -->|No| RED

    style PASS fill:#d1fae5
    style EX   fill:#d1fae5
    style RED  fill:#fee2e2
```

> Source: `src/middleware.ts`. Matcher list at the bottom of the file pins exactly which prefixes the middleware fires for; anything else passes straight to the route. The `pathname !== '/portal'` condition on the portal branch is load-bearing, not an optimization: `/portal` is where every other branch redirects to, so gating it would bounce a guest to the page they are already on.

## Subsequent requests — server-side guards

```mermaid
flowchart TD
    CALL["Server Component or Server Action<br/>calls a guard helper"] --> WHICH{Which helper?}

    WHICH -->|requireAuth| A1{session.user set<br/>AND city claim present?}
    WHICH -->|requireAdmin| A2{role === 'ADMIN'?}
    WHICH -->|requireTeacher| A3{role === 'TEACHER'<br/>or role === 'ADMIN'?}
    WHICH -->|requireStudent| A4{role === 'STUDENT'?}
    WHICH -->|requireActiveStudent| A5{role === 'STUDENT' AND<br/>enrollment count in active years > 0?}

    A1 -->|No| RED[redirect → /portal]
    A1 -->|Yes| OK[return session]
    A2 -->|No| RED
    A2 -->|Yes| OK
    A3 -->|No| RED
    A3 -->|Yes| OK
    A4 -->|No| RED
    A4 -->|Yes| OK
    A5 -->|"No role"| RED
    A5 -->|"No active enrollment"| NF["notFound() — NOT redirect"]
    A5 -->|Yes| OK

    style NF  fill:#fee2e2
    style OK  fill:#d1fae5
    style RED fill:#fee2e2
```

> Source: `src/lib/auth-guard.ts`. Each helper composes on top of `requireAuth()` (module-private), so an unauthenticated request always lands on `/portal` regardless of which role check follows — the same target as the middleware, `logoutAction` and `pages.signIn`. `requireAuth` also **fails closed on a session without a `city` claim** — Prisma treats `city: undefined` in a where-clause as "no filter", so a legacy token must never reach a query. `requireAdminCtx()` returns `{ session, city }` for read actions; `adminAction` hands the same city to wrapped mutations via handler ctx.
>
> **`requireActiveStudent()`** composes on `requireStudent()` and adds proof the child is currently in a program. It gates every student-facing read of course content (`src/actions/student/materials.ts`, `gallery.ts`, `assessment.ts`), and `/api/download/[materialId]` mirrors it inline because it authorises off a session rather than through the guard. It fails with **`notFound()`, deliberately NOT `redirect('/portal')`** — `/portal` renders the dashboard for a STUDENT session, so redirecting there would loop forever. It checks that the CALLER is active, **not** that the requested group belongs to the active year: an enrolled child looking back at their own previous group is legitimate, and year-filtering the per-group lookups would quietly withdraw the parent-visible evaluation. It closes the residual window the login gate leaves — a JWT minted while the child was still enrolled stays valid until `revalidateTokenClaims` next runs (≤60 s). **Known gap:** `/api/proxy/elearning` is the one session-authorised surface that does not yet apply it.

## Defence in depth

Two layers cover slightly different concerns:

- **Middleware** runs at the edge before any React rendering, so it bounces stale URLs cheaply and never paints a flash of unauthorized content.
- **Guards** run inside Server Components and Server Actions, where role checks can be more granular (e.g. `assertTeacherOwnsGroup` builds on top of `requireTeacher` to also check `TeacherAssignment`). They also handle the case of someone calling a Server Action directly without crossing the middleware boundary.

If you change a route's role expectation, update **both** layers — and the post-login switch in `LoginForm` if the new route should be the default landing page for that role, including the dual-role chooser branch, which hardcodes its two destinations.

**City is enforced at the data layer, not in middleware.** Middleware stays role-only (it is non-authoritative); tenant separation comes from `session.user.city` flowing into every query/guard (`requireAdminCtx`, `adminAction` ctx, `city-guard.ts` asserts, city-bound ADMIN bypasses in `teacher-guard.ts`). There is no city switcher — an account's city is a static fact, changed only in the DB (the 60s JWT re-check propagates it without re-login).
