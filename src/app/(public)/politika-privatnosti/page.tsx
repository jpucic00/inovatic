import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politika privatnosti',
  description: 'Politika privatnosti Udruge za robotiku "Inovatic" – zaštita osobnih podataka u skladu s GDPR-om.',
  openGraph: {
    title: 'Politika privatnosti – Udruga Inovatic',
    description: 'Politika privatnosti Udruge za robotiku "Inovatic" – zaštita osobnih podataka u skladu s GDPR-om.',
    url: 'https://udruga-inovatic.hr/politika-privatnosti',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – LEGO Robotika za djecu u Splitu' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/politika-privatnosti' },
}

export default function PrivacyPolicyPage() {
  return (
    <section className="py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8">Politika privatnosti</h1>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-600">
          <p>
            Udruga za robotiku &quot;Inovatic&quot; (OIB: 83709136328) posvećena je zaštiti vaših osobnih podataka
            u skladu s Općom uredbom o zaštiti podataka (GDPR) i hrvatskim Zakonom o provedbi Opće uredbe o zaštiti podataka.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Voditelj obrade</h2>
          <p>
            Udruga za robotiku &quot;Inovatic&quot;<br />
            Velebitska 32, 21000 Split<br />
            E-mail: info@udruga-inovatic.hr<br />
            Telefon: +385 99 393 6993
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Koje podatke prikupljamo</h2>
          <p>
            Putem obrasca za upit prikupljamo: ime i prezime roditelja, email, telefon, ime i dob djeteta,
            naziv škole (neobavezno), preferenciju programa i lokacije. Ovi podaci koriste se isključivo
            za obradu vašeg upita i komunikaciju vezanu uz upis djeteta.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Pravna osnova obrade</h2>
          <p>
            Vaše osobne podatke obrađujemo na temelju vaše privole koju dajete prilikom slanja obrasca za upit
            (čl. 6. st. 1. t. (a) GDPR-a). Privolu možete povući u bilo kojem trenutku kontaktiranjem
            na info@udruga-inovatic.hr.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Rok čuvanja podataka</h2>
          <p>
            Osobne podatke čuvamo samo onoliko dugo koliko je potrebno za ispunjenje svrhe prikupljanja.
            Podatke iz upita brišemo najkasnije 12 mjeseci nakon zatvaranja upita, osim ako je dijete upisano
            u program — u tom slučaju podatke čuvamo za vrijeme trajanja usluge i zakonskih obveza.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Vaša prava</h2>
          <p>
            Imate pravo na pristup, ispravak, brisanje i prenosivost vaših osobnih podataka, kao i pravo
            na ograničenje obrade i prigovor. Za ostvarivanje prava obratite se na info@udruga-inovatic.hr.
            Također imate pravo podnijeti pritužbu Agenciji za zaštitu osobnih podataka (AZOP).
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">Dijeljenje podataka</h2>
          <p>
            Vaše podatke ne dijelimo s trećim stranama, osim u mjeri u kojoj je to potrebno za pružanje
            naših usluga (npr. slanje potvrde putem email servisa). Ne prenosimo podatke izvan Europskog gospodarskog prostora.
          </p>

          <p className="text-sm text-gray-400 mt-12">
            Ova politika privatnosti na snazi je od 19. ožujka 2026. i može se povremeno ažurirati.
          </p>
        </div>
      </div>
    </section>
  )
}
