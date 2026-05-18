# Role-Based Login Redirect

After a successful login, the user lands on the route that matches their `UserRole`. The same mapping is enforced on every subsequent request at two layers — edge `middleware.ts` and per-page `requireX()` guards — so a stale link or direct URL can never escape the role boundary.

| Role | Post-login `router.push` target | Edge middleware allows | Server-side guard helpers that pass |
|---|---|---|---|
| `ADMIN` | `/admin` | `/admin/*`, `/nastavnik/*`, `/portal/*` (any auth) | `requireAuth`, `requireAdmin`, `requireTeacher` *(ADMIN bypass for support)* |
| `TEACHER` | `/nastavnik` | `/nastavnik/*`, `/portal/*` (any auth) | `requireAuth`, `requireTeacher` |
| `STUDENT` | `/portal` | `/portal/*` (any auth) | `requireAuth`, `requireStudent` |
| unauthenticated | login page | none — every match redirects to `/prijava` | none |

> Middleware lets any authenticated user through to `/portal/*`, but `requireStudent()` rejects non-STUDENT roles at the page level. ADMIN bypass inside `requireTeacher()` is deliberate so admins can support a class without holding a teacher seat.

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
    Auth->>DB: findUnique by chosen field (select includes deletedAt)
    DB-->>Auth: { passwordHash, role, deletedAt } or null
    alt user missing or user.deletedAt is set
        Auth-->>Action: return null → AuthError
    end
    Auth->>Auth: bcrypt compare password vs passwordHash
    Auth-->>Action: ok or AuthError
    Note right of Action: AuthError → 'Pogrešno korisničko ime ili lozinka.'
    Note over Auth,DB: JWT callback re-checks deletedAt on every refresh (max 60s TTL) per src/lib/auth.ts:65-67

    Action->>DB: findUnique by email or username (re-fetch role for routing)
    DB-->>Action: { role }
    Note right of Action: missing row → same error string<br/>(don't leak which field was wrong)

    Action-->>Form: { success: true, role }
    Form->>Form: destination = '/portal' (default)<br/>ADMIN → '/admin'<br/>TEACHER → '/nastavnik'

    Form->>Router: router.push(destination)
    Form->>Router: router.refresh()
```

> Sources: `src/actions/login.ts:14-41` (server action), `src/components/auth/login-form.tsx:30-44` (client switch), `src/lib/auth.ts:17-33` (authorize callback: Zod email parse + deletedAt rejection), `src/lib/auth.ts:48-75` (JWT callback re-check on refresh).

## Subsequent requests — edge middleware

```mermaid
flowchart TD
    REQ["Request matches matcher:<br/>/admin/:path*  /nastavnik/:path*  /portal/:path*"] --> PATH{Path prefix?}

    PATH -->|/admin| A{role === 'ADMIN'?}
    PATH -->|/nastavnik| N{role === 'TEACHER'<br/>or role === 'ADMIN'?}
    PATH -->|/portal| P{req.auth set?}

    A -->|Yes| PASS[continue]
    A -->|No| RED["NextResponse.redirect → /prijava"]
    N -->|Yes| PASS
    N -->|No| RED
    P -->|Yes| PASS
    P -->|No| RED

    style PASS fill:#d1fae5
    style RED  fill:#fee2e2
```

> Source: `src/middleware.ts`. Matcher list at the bottom of the file pins exactly which prefixes the middleware fires for; anything else passes straight to the route.

## Subsequent requests — server-side guards

```mermaid
flowchart TD
    CALL["Server Component or Server Action<br/>calls a guard helper"] --> WHICH{Which helper?}

    WHICH -->|requireAuth| A1{session.user set?}
    WHICH -->|requireAdmin| A2{role === 'ADMIN'?}
    WHICH -->|requireTeacher| A3{role === 'TEACHER'<br/>or role === 'ADMIN'?}
    WHICH -->|requireStudent| A4{role === 'STUDENT'?}

    A1 -->|No| RED[redirect → /prijava]
    A1 -->|Yes| OK[return session]
    A2 -->|No| RED
    A2 -->|Yes| OK
    A3 -->|No| RED
    A3 -->|Yes| OK
    A4 -->|No| RED
    A4 -->|Yes| OK

    style OK  fill:#d1fae5
    style RED fill:#fee2e2
```

> Source: `src/lib/auth-guard.ts`. Each helper composes on top of `requireAuth()`, so an unauthenticated request always lands on `/prijava` regardless of which role check follows.

## Defence in depth

Two layers cover slightly different concerns:

- **Middleware** runs at the edge before any React rendering, so it bounces stale URLs cheaply and never paints a flash of unauthorized content.
- **Guards** run inside Server Components and Server Actions, where role checks can be more granular (e.g. `assertTeacherOwnsGroup` builds on top of `requireTeacher` to also check `TeacherAssignment`). They also handle the case of someone calling a Server Action directly without crossing the middleware boundary.

If you change a route's role expectation, update **both** layers — and the post-login switch in `LoginForm` if the new route should be the default landing page for that role.
