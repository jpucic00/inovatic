# Šibenik two-city cutover — production runbook

Operational runbook for activating **Šibenik** as the second tenant city in production.
You (the owner) run prod/Neon ops yourself; this document is the checklist.

- **Epic:** Šibenik two-city separation (Flux `uk2o2h0`).
- **Plan:** `~/.claude/plans/sibenik-two-city-separation.md` §5.
- **App:** Railway (auto-deploys on push to `main`). **DB:** Neon PostgreSQL (EU Frankfurt), `DATABASE_URL` pooled / `DIRECT_URL` direct.

---

## 0. Launch gate — do NOT run this runbook until all are true

The Šibenik tenant must not exist while any ADMIN-bypass site is still unscoped —
a half-scoped deploy would leak Split data to the new admin.

- [ ] PR1 (`20260710080000_city_two_city_separation`) has been live in prod for **at least one release** before PR2's migration deploys (see §1).
- [ ] PR2 (`20260710090000_city_drop_defaults`) deployed.
- [ ] PR3 (admin scoping) + PR4 (teacher panel / planner cascade) merged and deployed.
- [ ] PR5 (public inquiry city flow) deployed.
- [ ] **PR9 isolation regression suite is green** (the cross-city matrix + E2E Šibenik journey). This is the hard precondition — no Šibenik rows before it passes.

If any box is unchecked, stop. Seeding Trokut / flipping Slavica early opens a data-leak window.

---

## 1. Release sequencing (expand/contract — already handled by the PR order)

The tenant `city` columns went in as a two-phase expand/contract so Railway's
`migrate deploy` (which runs while the previous release still serves traffic) can
never insert into a default-less NOT NULL column:

| Phase | Migration | Effect |
|---|---|---|
| 1a | `20260710080000_city_two_city_separation` (PR1) | `ADD COLUMN "city" … NOT NULL DEFAULT 'SPLIT'` on all 8 tenant tables + unique remaps + indexes + `ScheduledGroup(locationId, city)` FK. Old code keeps inserting safely (default fills city). |
| 1b | `20260710090000_city_drop_defaults` (PR2) | `ALTER COLUMN "city" DROP DEFAULT` on all 8 tables. From here a forgotten `city` is a compile error, not a silent SPLIT mis-stamp. |

**Roll-forward only after 1b.** A code rollback to a pre-PR1 release after 1b is live
would leave old code inserting into default-less NOT NULL columns → insert failures.
If you must roll back, first run the emergency down-script in §6.

The 8 tables carrying a NOT NULL `city`: `User`, `Location`, `ScheduledGroup`,
`Inquiry`, `Article`, `CourseEnrollmentWindow`, `SchoolYearHoliday`, `ModuleSchedule`.
(`Course.city` is nullable — `null` = shared SLR catalog — and has no default.)

---

## 2. Insert the Trokut venue (SIBENIK)

Trokut inkubator is a **space-only** venue (like PMF in Split): no Trokut org
contacts are published. The public Šibenik contact is **Slavica** — her number
lives on this row's `phone`.

```sql
INSERT INTO "Location" (id, name, address, phone, email, city)
VALUES (
  gen_random_uuid()::text,          -- or any cuid-shaped unique id
  'Trokut inkubator',
  'Ul. Velimira Škorpika 7/a, 22000 Šibenik',
  '+385 92 168 9987',               -- Slavica (public Šibenik contact)
  NULL,                             -- no Trokut org email
  'SIBENIK'
);
```

Verify:

```sql
SELECT id, name, city, phone FROM "Location" WHERE city = 'SIBENIK';
-- expect exactly one row: Trokut inkubator
```

> The composite FK `ScheduledGroup(locationId, city) → Location(id, city)` means any
> Šibenik group must reference this row; a Split group can never point at it.

---

## 3. Flip Slavica to the SIBENIK tenant

Slavica Jurčević already exists as an `ADMIN` (seeded / provisioned as SPLIT). She is
the **sole Šibenik admin and its only teacher** — one account, dual role. Flipping her
city re-scopes her entire admin panel to Šibenik.

```sql
UPDATE "User"
SET city = 'SIBENIK'
WHERE email = 'slavica.jurcevic@udruga-inovatic.hr';
-- expect: UPDATE 1
```

**No re-login needed.** The JWT callback re-reads role+city from the DB on a 60-second
TTL, and a token whose `city` claim differs from the DB is refreshed on the next request.
Within ~60s her live session re-scopes to Šibenik. (A token minted before the city claim
existed is treated as stale and force-refreshed immediately.)

Verify:

```sql
SELECT email, role, city FROM "User"
WHERE email = 'slavica.jurcevic@udruga-inovatic.hr';
-- expect: ADMIN / SIBENIK
```

Then, as Slavica: `/admin` lists are empty (no Šibenik operational data yet), Lokacije
shows only Trokut, the sidebar city chip reads **Šibenik**. The "Nastavnički panel"
sidebar shortcut is there from the start (every admin has it); `/nastavnik` lists her
city's groups, so it stays empty until Šibenik has any.

---

## 4. First Šibenik school-year planner checklist

Šibenik launches mid-cycle with its own dates — it does not inherit Split's planner.
As Slavica, in this order:

- [ ] **Kalendar → praznici:** mark Šibenik holidays (or run OpenHolidays import). These
      write `SchoolYearHoliday(schoolYear, SIBENIK, date)` — independent of Split's rows.
- [ ] **Kalendar → planiraj godinu ("Dovrši plan"):** set module dates. Writes
      `ModuleSchedule(moduleId, schoolYear, SIBENIK)` — the per-city one-shot guard is
      counted per city, so planning Šibenik does not touch Split's completed plan.
- [ ] **Programi → prozor za upise:** open the enrollment window(s) for the shared SLR
      course(s). Upsert on `CourseEnrollmentWindow(courseId, schoolYear, SIBENIK)` — Split's
      window for the same course is untouched.
- [ ] **Grupe:** create the Šibenik group(s) at the Trokut location (the location select
      only offers same-city venues; `group.city` is stamped from the venue). Assign
      Slavica as the group's teacher (she appears in the same-city teacher multi-select).
- [ ] Public check: `/prijava` → pick **Šibenik** → only Trokut groups appear under an open
      Šibenik window; submitting files an `Inquiry` with `city = SIBENIK`.

---

## 5. Mis-filed pre-launch inquiry fix (if any)

Any inquiry that arrived before launch was stamped `SPLIT` by default. If some belong to
Šibenik, move them one-off (confirm the ids first — this is manual, no UI affordance):

```sql
-- Inspect candidates first:
SELECT id, "childFirstName", "childLastName", city, "createdAt", status
FROM "Inquiry"
WHERE /* your identifying predicate */ ;

-- Then move the confirmed ones:
UPDATE "Inquiry" SET city = 'SIBENIK' WHERE id IN ( /* confirmed ids */ );
```

> Cross-city returning-student matching is intentionally blocked in the accept flow — a
> Šibenik inquiry matching a Split account will not auto-reuse it. If that comes up, resolve
> manually (deliberate new account, or an owner-level SQL move) rather than working around it.

---

## 6. Emergency down-script (only if rolling back code past PR2)

If you must run a release older than PR1 after 1b (DROP DEFAULT) is live, restore the DB
defaults first so old code can insert without supplying `city`:

```sql
ALTER TABLE "Article"                ALTER COLUMN "city" SET DEFAULT 'SPLIT';
ALTER TABLE "CourseEnrollmentWindow" ALTER COLUMN "city" SET DEFAULT 'SPLIT';
ALTER TABLE "Inquiry"                ALTER COLUMN "city" SET DEFAULT 'SPLIT';
ALTER TABLE "Location"               ALTER COLUMN "city" SET DEFAULT 'SPLIT';
ALTER TABLE "ModuleSchedule"         ALTER COLUMN "city" SET DEFAULT 'SPLIT';
ALTER TABLE "ScheduledGroup"         ALTER COLUMN "city" SET DEFAULT 'SPLIT';
ALTER TABLE "SchoolYearHoliday"      ALTER COLUMN "city" SET DEFAULT 'SPLIT';
ALTER TABLE "User"                   ALTER COLUMN "city" SET DEFAULT 'SPLIT';
```

This is a stopgap to unblock a rollback, not a normal step. Re-applying `20260710090000`
drops the defaults again on the next roll-forward.

---

## 7. Post-cutover verification (one-liners)

```sql
-- Tenants present:
SELECT city, count(*) FROM "User"     GROUP BY city;
SELECT city, count(*) FROM "Location" GROUP BY city;

-- No Šibenik operational leakage before Slavica plans the year:
SELECT city, count(*) FROM "ScheduledGroup" GROUP BY city;
SELECT city, count(*) FROM "Inquiry"        GROUP BY city;
```

Sign-off: Trokut present (SIBENIK), Slavica ADMIN/SIBENIK, her panel scoped, public
`/prijava` Šibenik path works end-to-end.
