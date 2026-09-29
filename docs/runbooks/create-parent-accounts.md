# Roditeljski računi — povezivanje postojeće djece

Od 2026-09-29 dijete se više ne prijavljuje samo. Portal otvara **roditeljski
račun** (jedan po e-mail adresi roditelja), a dijete se bira nakon prijave. Nova
djeca dobivaju račun automatski kad admin kreira račun iz upita ili ručno;
**djecu koja već postoje** treba jednom povezati ovom skriptom.

## Što skripta radi

- Grupira svu ne-obrisanu djecu po e-mailu roditelja (isti ključ po kojem
  e-mail kampanje spajaju braću: mala slova, bez razmaka, adresa izvučena iz
  Outlookovog `Ime <a@b>`).
- Za svaku adresu: poveže djecu s računom koji tu adresu već ima (roditeljski
  račun, ili nastavnik/admin čiji je e-mail roditelj upisao) ili kreira novi
  `PARENT` račun.
- Novi računi **nemaju upotrebljivu lozinku** — nitko se ne može prijaviti dok
  obitelj ne dobije poveznicu za postavljanje lozinke.

## Što skripta nikad ne radi

- Ne dira dijete koje **već ima** roditeljski račun — veza koju je admin
  potvrdio nije stvar batcha. Zato je ponovno pokretanje bez učinka.
- Ne pogađa: dijete bez upotrebljive adrese, ili adresa koja pripada računu
  djeteta, učionice ili obrisanom računu, samo se ispiše u izvještaju i ostaje
  bez pristupa portalu.

## Pokretanje (lokalno, s Railway varijablama)

Produkcijski image nema ni `scripts/` ni `tsx`, pa se skripta pokreće lokalno:

```bash
railway run npm run db:create-parent-accounts
```

To je **dry run** — ništa ne zapisuje. Pročitaj izvještaj:

| Sekcija | Što znači | Što napraviti |
| --- | --- | --- |
| NO USABLE E-MAIL | dijete nema ispravan e-mail roditelja | upiši e-mail na profilu učenika (Uredi) — spremanje samo poveže račun |
| REFUSED | adresa pripada računu koji ne može biti roditeljski | ispravi e-mail roditelja na profilu učenika |
| STAFF ADDRESS | dijete će se otvarati s prijave nastavnika/admina | u redu ako je to stvarno njihovo dijete |
| CHILDREN IN BOTH CITIES | jedan račun vidi djecu u oba grada | očekivano; račun nije vezan uz grad |
| ADDRESS CLEANED UP | adresa pročišćena iz zalijepljenog teksta | samo informacija |
| SIBLINGS | jedan račun, više djece | provjeri da nisu dvije obitelji na istoj (npr. školskoj) adresi |

Kad izvještaj izgleda ispravno:

```bash
railway run npm run db:create-parent-accounts -- --apply
```

Pokreni ga **nakon deploya** (migracije `parent_role` i `parent_account_link`
moraju biti primijenjene) i **prije** prve kampanje s poveznicama za lozinku —
kampanja šalje na roditeljske račune.
