# Dijagnoza pravog IP-a klijenta (Flux 3thglb6)

Svako ograničenje po IP adresi (prijava, `/stem-edukacija`, …) uzima **prvu
adresu** iz zaglavlja `X-Forwarded-For` (`ipFromForwardedFor`,
`src/lib/client-ip.ts`). Ne znamo pouzdano radi li Railway edge (i eventualno
Cloudflare ispred njega) s tim zaglavljem što treba:

- **prepiše** ga — prva adresa je pravi klijent, sve je u redu;
- **doda** se na ono što je klijent poslao — prva adresa je ono što je
  napadač upisao, pa ograničenje po IP-u ne vrijedi ništa.

Zato linija u logu koja se ispiše kad se prijava zaključa sada nosi i sirova
zaglavlja:

```
[auth] login throttled: 5 failures on one account, last from <ip> (x-forwarded-for=… x-real-ip=… cf-connecting-ip=…)
```

Vrijednost je ispisana doslovno, `-` znači da zaglavlje nije stiglo. E-mail se
nikad ne ispisuje. Postupak ispod se radi **jednom, nakon deploya** koji uvodi
tu liniju.

## 1. Je li ispred Railwaya Cloudflare proxy?

Cloudflare dashboard → `udruga-inovatic.hr` → **DNS → Records** → zapis `@`
(apex) i `www`:

- **narančasti oblak (Proxied)** — promet ide kroz Cloudflare;
- **sivi oblak (DNS only)** — promet ide ravno na Railway.

Zapiši što piše. (Cutover 2026-08-03 ih je ostavio sive; prebacivanje na
narančaste bilo je opcionalno.)

## 2. Saznaj svoju pravu javnu adresu

```bash
curl -s https://ifconfig.me; echo
```

Tu adresu očekujemo vidjeti u logu. `203.0.113.99` iz koraka 3 je izmišljena
(dokumentacijski raspon) — ako se ona pojavi kao prva, zaglavlje je lažljivo.

## 3. Zaključaj nepostojeći račun s lažnim zaglavljem

Prijava ide preko Auth.js endpointa `/api/auth/callback/credentials`, koji
poziva isti `authorize()` kao forma na `/portal` i predaje mu zaglavlja
zahtjeva. Polja su `identifier` i `password`, uz `csrfToken` iz
`/api/auth/csrf` (token mora doći s kolačićem iz iste "staklenke").

Adresa je **nepostojeća** (`@example.invalid`): nepostojeći e-mail se zaključava
jednako kao postojeći, a ničiji pravi račun se ne dira.

```bash
BASE=https://udruga-inovatic.hr
EMAIL="ip-test-$(date +%Y%m%d%H%M)@example.invalid"
JAR=$(mktemp)

CSRF=$(curl -s -c "$JAR" -b "$JAR" "$BASE/api/auth/csrf" \
  | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')

for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -c "$JAR" -b "$JAR" \
    -H 'X-Forwarded-For: 203.0.113.99' \
    --data-urlencode "csrfToken=$CSRF" \
    --data-urlencode "identifier=$EMAIL" \
    --data-urlencode "password=kriva-lozinka" \
    "$BASE/api/auth/callback/credentials"
done
rm -f "$JAR"
```

Očekivano: pet odgovora `302 …/portal?error=CredentialsSignin&code=credentials`
i šesti `302 …/portal?error=CredentialsSignin&code=too_many_attempts` — to
potvrđuje da je brava proradila i da je linija ispisana. (Isprobano lokalno na
`http://localhost:3000` 2026-10-06.)

Ako šesti odgovor **nije** `too_many_attempts`, brava se nije zaključala (npr.
zahtjevi su završili na dvije instance) — ponovi s novim `EMAIL`.

## 4. Pročitaj liniju u Railway logovima

Railway → servis → **Deployments → View logs**, traži `login throttled`.
Primjer:

```
[auth] login throttled: 5 failures on one account, last from 203.0.113.99 (x-forwarded-for=203.0.113.99, 198.51.100.4 x-real-ip=198.51.100.4 cf-connecting-ip=-)
```

`last from` je adresa koju ograničenje stvarno koristi (prva iz
`x-forwarded-for`). Usporedi s adresom iz koraka 2:

| Što piše | Zaključak |
| --- | --- |
| `last from` = **tvoja prava adresa**, `203.0.113.99` nije prvi (ili ga nema) | Edge prepisuje zaglavlje — **sadašnji kod je u redu**. Očekivano je i `x-real-ip` = ista adresa. |
| `last from 203.0.113.99` | **Zaglavlje je lažljivo** (edge dodaje). Treba prijeći na zaglavlje koje u istoj liniji pokazuje tvoju pravu adresu — `x-real-ip` (Railway ga prepisuje) ili `cf-connecting-ip`. |
| `cf-connecting-ip` ima vrijednost | Ispred je Cloudflare proxy (mora se slagati s korakom 1). Tada je `x-real-ip` vjerojatno adresa Cloudflareova čvora, a ne klijenta. |
| `cf-connecting-ip=-` | Cloudflare proxy nije u putu (sivi oblak). |

Napomena za odluku: `cf-connecting-ip` se smije vjerovati **samo** ako Railway
ne prima promet mimo Cloudflarea — domena `*.up.railway.app` je javno
dostupna i tamo to zaglavlje može poslati bilo tko.

Cijelu liniju (bez ičega drugog) kopiraj u komentar na Flux 3thglb6 — to je
podatak za odluku o promjeni koda.

## Cijena testa

- Brava se **sama otpusti nakon 15 minuta**; redeploy je briše odmah.
- Zaključana je samo izmišljena adresa, a IP brojač (30 po adresi) ovih šest
  pokušaja ne dosegne — nitko drugi ništa ne primijeti.
- Pravi računi i pravi korisnici nisu dirnuti; ne šalje se nijedan mail.
