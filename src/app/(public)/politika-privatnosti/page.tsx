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
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Politika privatnosti</h1>
        <p className="text-sm text-gray-400 mb-8">Datum stupanja na snagu: 8. srpnja 2026.</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-600">
          <p>
            Udruga za robotiku Inovatic (u daljnjem tekstu: „Udruga“) poštuje privatnost svojih članova,
            polaznika radionica, roditelja, partnera i svih posjetitelja web stranice te osobne podatke
            obrađuje u skladu s Uredbom (EU) 2016/679 (Opća uredba o zaštiti podataka – GDPR) i važećim
            propisima Republike Hrvatske.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Voditelj obrade</h2>
          <p>
            Udruga za robotiku Inovatic<br />
            Požeška 9<br />
            21000 Split<br />
            OIB: 83709136328<br />
            E-mail: info@udruga-inovatic.hr
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Koje podatke prikupljamo</h2>
          <p>Ovisno o svrsi, možemo prikupljati sljedeće podatke:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>ime i prezime</li>
            <li>adresu e-pošte</li>
            <li>broj telefona</li>
            <li>naziv škole ili ustanove (kada je primjenjivo)</li>
            <li>podatke potrebne za prijavu na radionice, kampove, natjecanja i druge aktivnosti</li>
            <li>sadržaj poruke poslane putem kontakt obrasca ili elektroničke pošte</li>
            <li>fotografije i videozapise nastale tijekom aktivnosti Udruge, kada za to postoji odgovarajuća pravna osnova.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Svrha obrade osobnih podataka</h2>
          <p>Osobne podatke obrađujemo radi:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>odgovaranja na upite korisnika,</li>
            <li>organizacije i provedbe radionica, kampova, natjecanja i drugih aktivnosti,</li>
            <li>komunikacije s roditeljima, članovima i partnerima,</li>
            <li>vođenja evidencija potrebnih za provedbu projekata i programa,</li>
            <li>ispunjavanja zakonskih obveza,</li>
            <li>informiranja javnosti o radu Udruge putem web stranice i društvenih mreža, kada za to postoji odgovarajuća pravna osnova.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Pravna osnova obrade</h2>
          <p>Osobni podaci obrađuju se na temelju:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>privole ispitanika, kada je ona potrebna,</li>
            <li>izvršavanja ugovornih ili sličnih obveza vezanih uz aktivnosti Udruge,</li>
            <li>legitimnog interesa Udruge za organizaciju i promicanje svojih aktivnosti,</li>
            <li>ispunjavanja zakonskih obveza.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Obrada podataka djece</h2>
          <p>
            Budući da Udruga provodi aktivnosti namijenjene djeci i mladima, posebnu pozornost posvećujemo
            zaštiti njihovih osobnih podataka.
          </p>
          <p>
            Podaci djece obrađuju se isključivo u svrhu organizacije i provedbe aktivnosti Udruge te u opsegu
            potrebnom za njihovu sigurnu i kvalitetnu provedbu.
          </p>
          <p>Fotografije i videozapisi djece objavljuju se samo kada za to postoji odgovarajuća pravna osnova.</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Dijeljenje osobnih podataka</h2>
          <p>Osobne podatke ne prodajemo niti ustupamo trećim osobama.</p>
          <p>Podaci se mogu dostaviti:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>državnim tijelima kada to nalaže zakon,</li>
            <li>partnerima uključenima u provedbu projekata kada je to nužno,</li>
            <li>pružateljima informatičkih usluga koji obrađuju podatke isključivo prema našim uputama.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Rok čuvanja podataka</h2>
          <p>
            Podaci se čuvaju onoliko dugo koliko je potrebno za ostvarenje svrhe zbog koje su prikupljeni ili
            koliko to zahtijevaju zakonski propisi.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Prava ispitanika</h2>
          <p>Svaka osoba ima pravo:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>zatražiti pristup svojim podacima,</li>
            <li>zatražiti ispravak netočnih podataka,</li>
            <li>zatražiti brisanje podataka kada su ispunjeni zakonski uvjeti,</li>
            <li>zatražiti ograničenje obrade,</li>
            <li>uložiti prigovor na obradu,</li>
            <li>povući privolu kada se obrada temelji na privoli.</li>
          </ul>
          <p>Za ostvarivanje svojih prava možete nas kontaktirati putem elektroničke pošte.</p>
          <p>
            Ako smatrate da su vaša prava povrijeđena, imate pravo podnijeti pritužbu Agenciji za zaštitu
            osobnih podataka (AZOP).
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Sigurnost podataka</h2>
          <p>
            Udruga primjenjuje odgovarajuće organizacijske i tehničke mjere radi zaštite osobnih podataka od
            neovlaštenog pristupa, gubitka, izmjene ili zlouporabe.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Izmjene politike privatnosti</h2>
          <p>
            Ova Politika privatnosti može se povremeno ažurirati radi usklađivanja sa zakonskim propisima ili
            promjenama u radu Udruge. Sve izmjene bit će objavljene na ovoj web stranici.
          </p>
        </div>
      </div>
    </section>
  )
}
