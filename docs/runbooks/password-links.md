# Lozinke — poveznice, prvi deploy i zaključavanje prijave

Od 2026-09-29 aplikacija **ne stvara lozinke**. Svatko bira svoju preko
jednokratne poveznice (`/postavi-lozinku#…`): **7 dana** za postavljanje, **48
sati** za novu lozinku. Javnog "zaboravio sam lozinku" nema — obitelj ili
djelatnik se javi udruzi, a poveznicu šalje osoblje.

## Tko šalje poveznicu i odakle

| Kome | Odakle |
| --- | --- |
| Roditelj | profil djeteta → "Pristup portalu" → **Pošalji poveznicu za lozinku** (admin ili nastavnik koji vidi dijete) |
| Sve obitelji odjednom | `/admin/email` → kampanja **Postavljanje lozinke** (ponovljivo, npr. jednom godišnje) |
| Nastavnik | `/admin/nastavnici/[id]` → "Pristupni podaci" |
| Admin koji ne predaje | nema stranicu u aplikaciji — skripta ispod |

Nova poveznica poništava sve ranije. Dosadašnja lozinka radi sve dok vlasnik
ne postavi novu. S profila se istom računu mogu poslati najviše **3 poveznice
na sat**.

## Prvi deploy: poveznica svim adminima i nastavnicima

Deploy koji uvodi poveznice **sam jednom pošalje** poveznicu za postavljanje
lozinke svakom ne-obrisanom adminu i nastavniku (svakome iz ureda njegova
grada). Pokreće se pri startu servera (`src/instrumentation.ts`), odmah nakon
e-maila o novoj verziji, i to **samo u produkciji s postavljenim
`RESEND_API_KEY`** — dev server i testovi ne šalju ništa.

- "Točno jednom" drži redak `ReleaseAnnouncement` s ključem
  `password-setup-rollout`, upisan **prije** prvog maila. Restart ili drugi
  kontejner ga zateknu i ne šalju ponovno.
- Ako **nitko** nije dobio mail (npr. Resend nedostupan), redak se briše i
  sljedeći start pokuša ponovno. Ako je **dio** prošao, redak ostaje — tko je
  propušten, dobije poveznicu ručno.
- Preskaču se: tko je već sam postavio lozinku, obrisani računi i uvezeni
  nastavnici s adresom `@teacher.inovatic.local`.
- Zadane lozinke **i dalje rade**. Tko još nije postavio svoju vidi se na
  stranici nastavnika ("Vlastita lozinka").

Provjera nakon deploya, u Railway logovima:

```
Password rollout: setup link sent to N staff member(s)
```

## Poveznica jednom računu iz naredbenog retka

Za admina koji ne predaje (nema stranicu u aplikaciji), ili bilo koji
roditeljski/djelatnički račun:

```bash
railway run npm run auth:send-password-link -- ime.prezime@example.com
```

To je **dry run** — ispiše račun i vrstu poveznice (postavljanje ako vlasnik
nikad nije birao lozinku, inače nova lozinka). Slanje:

```bash
railway run npm run auth:send-password-link -- ime.prezime@example.com --send
```

Produkcijski image nema ni `scripts/` ni `tsx`, zato lokalno kroz `railway run`.

Radi tek **nakon deploya** koji uvodi poveznice (migracija `password_tokens`).
Prije toga skripta javi da baza nema potrebne stupce i ne šalje ništa. Umjesto
primjera `ime.prezime@example.com` upiši stvarni e-mail računa.

## Zaključavanje prijave

Neuspjele prijave se broje u memoriji servera, 15 minuta unatrag:

- **5 po računu** (e-mail kako je upisan) — zaključa taj račun, i za točnu
  lozinku i s bilo koje adrese.
- **30 po IP adresi**, preko svih računa — zaključa tu adresu.

Zaključani vide "Previše neuspjelih pokušaja prijave. Pričekajte 15 minuta pa
pokušajte ponovno." Uspješna prijava briše brojač tog računa. Nepostojeći
e-mail se zaključava jednako kao postojeći, pa zaključavanje ne otkriva ima li
računa.

- **Ručnog otključavanja nema** i nije potrebno: brava se sama otpusti 15
  minuta nakon zadnjeg brojanog pokušaja. Redeploy briše sve brojače.
- Netko tko zna tuđu adresu može namjerno držati taj račun zaključanim. Vlasnik
  tada čeka ili dobije novu poveznicu — postavljanje lozinke preko poveznice ne
  prolazi kroz prijavu.
- U logovima jedna linija po zaključavanju (bez e-maila, s IP adresom):
  `[auth] login throttled: …`
