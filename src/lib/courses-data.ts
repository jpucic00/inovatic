type CourseLevel = 'SLR_1' | 'SLR_2' | 'SLR_3' | 'SLR_4'

interface CourseModule {
  title: string
  description: string
  image: string
}

interface Course {
  slug: string
  level: CourseLevel
  title: string
  subtitle: string
  description: string
  ageMin: number
  ageMax: number
  equipment: string
  priceYear: number
  priceModule: number
  hours: number
  sessionDuration: number
  sessionFrequency: string
  season: string
  groupSize: number
  coverImage: string
  modules: CourseModule[]
  color: string
  gradient: string
  highlightColor: string
}

export const courses: Course[] = [
  {
    slug: 'slr-1',
    level: 'SLR_1',
    title: 'Svijet LEGO Robotike 1',
    subtitle: 'Početni program robotike za djecu (6 – 8 godina, uključujući predškolce)',
    description:
      'Program Svijet LEGO robotike 1 prvi je stupanj našeg edukacijskog kurikuluma robotike i namijenjen je djeci koja tek ulaze u svijet tehnologije, robotike i programiranja. Program je prilagođen uzrastu od 6 do 8 godina, uključujući i predškolce koji pokazuju interes za tehniku i kreativno stvaranje.\n\n' +
      'Kroz igru, kreativne projekte i praktičan rad polaznici otkrivaju kako nastaju roboti te kako ih samostalno izgraditi i programirati.\n\n' +
      'Korištenjem LEGO WeDo 2.0 edukacijskih setova i WeDo blokovskog programskog sučelja, djeca razvijaju osnovne STEM vještine poput logičkog razmišljanja, rješavanja problema, kreativnosti i timskog rada. Vizualno programsko okruženje temeljeno na blokovima omogućuje djeci da na jednostavan i intuitivan način razumiju osnovne principe programiranja.\n\n' +
      'Svaki projekt potiče djecu na istraživanje i eksperimentiranje te im pomaže razumjeti kako tehnologija funkcionira u stvarnom svijetu.\n\n' +
      'Program se sastoji od 16 zanimljivih robotičkih projekata raspoređenih u četiri tematska modula. Kroz njih djeca uče kako izgraditi robota, kako ga programirati te kako povezati robotiku s pojavama i sustavima koji nas svakodnevno okružuju.\n\n' +
      'Radionice su osmišljene tako da djeca uče kroz praksu i zabavu, a svaki završeni projekt donosi osjećaj uspjeha i dodatnu motivaciju za daljnje istraživanje tehnologije.\n\n' +
      'Po završetku programa polaznici mogu nastaviti svoje učenje u naprednijem programu Svijet LEGO robotike 2.',
    ageMin: 6,
    ageMax: 8,
    equipment: 'LEGO WeDo 2.0 – WeDo ikone',
    priceYear: 400,
    priceModule: 110,
    hours: 56,
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 8,
    coverImage: '/images/courses/slr-1/cover.jpg',
    modules: [
      {
        title: 'Zabavni sustavi 1.0',
        description:
          'Kako nastaju tehnološke igračke i interaktivni sustavi koji nas zabavljaju?\n\n' +
          'U ovom modulu djeca kroz robotiku istražuju kako nastaju sustavi koji reagiraju na korisnika i stvaraju pokret. Uče kako kombinacijom motora i senzora mogu "oživjeti" svoje modele i pretvoriti ih u interaktivne igračke.\n\n' +
          'Izgradnjom projekata poput vrtuljka, leptira i humanoidnog robota, polaznici upoznaju osnovne principe mehanike, prijenosa gibanja i rada senzora. Poseban naglasak stavlja se na kreativnost – djeca ne samo da slijede upute, već se potiču da osmisle vlastite verzije i nadogradnje projekata.\n\n' +
          'Kroz ovaj modul razvijaju razumijevanje razlike između pasivnih i interaktivnih sustava te prvi put doživljavaju kako njihova ideja postaje funkcionalan model.',
        image: '/images/courses/slr-1/module-1.png',
      },
      {
        title: 'Prometni sustavi 1.0',
        description:
          'Promet je jedan od ključnih sustava modernog društva.\n\n' +
          'U ovom modulu djeca kroz praktične projekte upoznaju kako funkcioniraju prometni sustavi i koja je uloga tehnologije u svakodnevnom kretanju ljudi i robe.\n\n' +
          'Gradnjom i programiranjem različitih vozila, poput automobila za utrke, motocikla i vatrogasnog vozila, polaznici istražuju pojmove brzine, smjera kretanja, ravnoteže i upravljanja. Uče kako programirati robota da se kreće na određeni način te kako prilagoditi njegovo ponašanje različitim situacijama.\n\n' +
          'Osim tehničkih znanja, djeca razvijaju i svijest o važnosti sigurnosti u prometu te razumiju kako tehnologija doprinosi organizaciji i učinkovitosti prometnih sustava.',
        image: '/images/courses/slr-1/module-2.png',
      },
      {
        title: 'Industrijski sustavi 1.0',
        description:
          'U ovom modulu djeca otkrivaju kako robotika i strojevi pomažu u industriji i proizvodnji.\n\n' +
          'Kroz izgradnju funkcionalnih modela poput dizala, viličara i robotičkog manipulatora, polaznici upoznaju osnovne principe rada strojeva koji se koriste u svakodnevnom životu, od skladišta do tvornica.\n\n' +
          'Djeca uče kako podizati, prenositi i manipulirati objektima pomoću robota, te kako programirati precizne i ponovljive radnje. Time razvijaju razumijevanje automatizacije i shvaćaju kako tehnologija olakšava i ubrzava rad u industriji.\n\n' +
          'Ovaj modul posebno potiče logičko razmišljanje i rješavanje problema, jer djeca kroz pokušaje i pogreške dolaze do funkcionalnih rješenja.',
        image: '/images/courses/slr-1/module-3.png',
      },
      {
        title: 'Svemirski sustavi',
        description:
          'Svemir je jedno od najuzbudljivijih područja znanosti i tehnologije.\n\n' +
          'U ovom modulu polaznici kroz robotiku ulaze u svijet svemirskih istraživanja i otkrivaju kako tehnologija omogućuje istraživanje udaljenih planeta.\n\n' +
          'Izgradnjom i programiranjem modela poput Mars rovera, svemirske letjelice i svemirskog topa, djeca upoznaju osnovne koncepte kretanja u svemiru, istraživanja površine planeta i funkcioniranja svemirskih misija.\n\n' +
          'Kroz projekte razvijaju razumijevanje fizike, inženjerstva i logike koja stoji iza stvarnih svemirskih tehnologija, a istovremeno potiču maštu i znatiželju kroz teme koje su djeci posebno inspirativne.',
        image: '/images/courses/slr-1/module-4.png',
      },
    ],
    color: 'text-cyan-600',
    gradient: 'from-cyan-400 to-cyan-600',
    highlightColor: 'bg-cyan-50 border-cyan-200',
  },
  {
    slug: 'slr-2',
    level: 'SLR_2',
    title: 'Svijet LEGO Robotike 2',
    subtitle: 'Napredniji program robotike za djecu (9 – 10 godina)',
    description:
      'Program Svijet LEGO robotike 2 drugi je stupanj našeg edukacijskog kurikuluma robotike i namijenjen je djeci uzrasta od 9 do 10 godina (3. i 4. razred), kao i polaznicima koji su uspješno završili program Svijet LEGO robotike 1.\n\n' +
      'Kroz ovaj program djeca nadograđuju svoja postojeća znanja i ulaze u napredniji svijet robotike, programiranja i inženjerskog razmišljanja.\n\n' +
      'Korištenjem LEGO SPIKE Essential edukacijskih setova i LEGO® Education SPIKE™ programskog okruženja, polaznici razvijaju dublje razumijevanje tehnologije kroz izgradnju i programiranje sve složenijih robotičkih modela.\n\n' +
      'Nastava je prilagođena tako da početnici mogu bez poteškoća pratiti gradivo, dok polaznici s prethodnim iskustvom imaju priliku dodatno proširiti svoje znanje kroz složenije zadatke i samostalne nadogradnje projekata.\n\n' +
      'Program potiče djecu da razmišljaju poput malih inženjera – kako riješiti problem, kako unaprijediti postojeće rješenje i kako tehnologiju primijeniti u stvarnom svijetu. Kroz praktičan rad i kreativne projekte, djeca razvijaju logičko razmišljanje, samostalnost, upornost i timski rad.\n\n' +
      'Program se sastoji od 16 robotičkih projekata raspoređenih u četiri tematska modula. Svaki projekt omogućuje djeci da kroz iskustvo bolje razumiju sustave koji nas okružuju – od zabave i prometa do industrije i energije.\n\n' +
      'Radionice su i dalje temeljene na učenju kroz praksu, ali s većim naglaskom na samostalnost, razumijevanje i povezivanje znanja.\n\n' +
      'Po završetku programa polaznici mogu nastaviti svoje učenje u naprednijem programu Svijet LEGO robotike 3.',
    ageMin: 9,
    ageMax: 10,
    equipment: 'LEGO SPIKE Essential – SPIKE Essential ikone',
    priceYear: 400,
    priceModule: 110,
    hours: 56,
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 8,
    coverImage: '/images/courses/slr-2/cover.jpg',
    modules: [
      {
        title: 'Zabavni sustavi 2.0',
        description:
          'Kako nastaju napredni interaktivni sustavi koji nas zabavljaju?\n\n' +
          'U ovom modulu djeca produbljuju svoje razumijevanje zabavne tehnologije i prelaze iz uloge korisnika u ulogu kreatora. Kroz robotiku istražuju kako osmisliti sustave koji reagiraju, komuniciraju i pružaju interakciju korisniku.\n\n' +
          'Kroz projekte poput spirografa, humanoidnog robota i raznih interaktivnih modela, polaznici uče kako kombinirati mehaniku, senzore i programiranje kako bi dobili željeno ponašanje robota. Poseban naglasak stavlja se na samostalno osmišljavanje rješenja i razvoj vlastitih ideja, uključujući i projekt po slobodnom izboru.\n\n' +
          'Ovaj modul potiče kreativnost, ali i razumijevanje kako nastaju moderne digitalne i interaktivne "igračke" koje djeca svakodnevno koriste.',
        image: '/images/courses/slr-2/module-1.png',
      },
      {
        title: 'Prometni sustavi 2.0',
        description:
          'Kako tehnologija oblikuje moderan promet i povezanost svijeta?\n\n' +
          'U ovom modulu djeca istražuju naprednije oblike prometa, s posebnim naglaskom na zračni promet i njegova tehnološka rješenja.\n\n' +
          'Kroz izgradnju i programiranje modela poput aviona, dvokrilnog aviona i helikoptera, polaznici uče kako funkcionira kretanje u zraku, kako se upravlja letjelicama te kako tehnologija omogućuje brzu i sigurnu povezanost svijeta.\n\n' +
          'Djeca razvijaju razumijevanje složenijih sustava upravljanja, stabilnosti i kontrole, ali i važnosti prometa za kvalitetu života u modernim gradovima.',
        image: '/images/courses/slr-2/module-2.png',
      },
      {
        title: 'Industrijski sustavi 2.0',
        description:
          'Kako funkcionira moderna industrija i automatizacija?\n\n' +
          'U ovom modulu polaznici ulaze u svijet naprednijih industrijskih sustava i procesa koji pokreću današnje gospodarstvo.\n\n' +
          'Kroz projekte poput rudničke željeznice, dizalice i robotske ruke, djeca uče kako strojevi prenose, podižu i obrađuju materijale te kako se procesi mogu automatizirati i optimizirati.\n\n' +
          'Naglasak je na razumijevanju preciznosti, ponovljivosti i učinkovitosti ključnih elemenata moderne proizvodnje. Djeca kroz praktičan rad razvijaju sposobnost rješavanja složenijih problema i razumiju kako robotika ima stvarnu primjenu u industriji.',
        image: '/images/courses/slr-2/module-3.png',
      },
      {
        title: 'Energetski sustavi 1.0',
        description:
          'Odakle dolazi energija i kako pokreće svijet oko nas?\n\n' +
          'U ovom modulu djeca istražuju jedan od najvažnijih aspekata modernog društva – energiju i njezine izvore.\n\n' +
          'Kroz projekte poput vodene brane, naftne pumpe i vjetrenjače, polaznici upoznaju različite načine proizvodnje energije te razumiju kako se energija pretvara iz jednog oblika u drugi.\n\n' +
          'Ovaj modul razvija svijest o važnosti energije u svakodnevnom životu, ali i potiče razumijevanje održivosti i tehnoloških rješenja koja omogućuju razvoj moderne civilizacije.',
        image: '/images/courses/slr-2/module-4.png',
      },
    ],
    color: 'text-cyan-700',
    gradient: 'from-cyan-500 to-teal-600',
    highlightColor: 'bg-teal-50 border-teal-200',
  },
  {
    slug: 'slr-3',
    level: 'SLR_3',
    title: 'Svijet LEGO Robotike 3',
    subtitle: 'Napredni program robotike za djecu (11 – 12 godina)',
    description:
      'Program Svijet LEGO robotike 3 treći je stupanj našeg edukacijskog kurikuluma robotike i namijenjen je djeci uzrasta od 11 do 12 godina (5. i 6. razred), kao i polaznicima koji su prethodno pohađali program Svijet LEGO robotike 2.\n\n' +
      'U ovom programu polaznici ulaze u zahtjevniji svijet robotike, gdje kroz složenije projekte razvijaju dublje razumijevanje tehnologije i načina na koji funkcioniraju stvarni sustavi.\n\n' +
      'Korištenjem LEGO SPIKE Prime edukacijskih setova i Scratch programskog okruženja, djeca rade na naprednijim robotičkim modelima koji zahtijevaju kombinaciju tehničkog znanja, logičkog razmišljanja i kreativnog pristupa rješavanju problema.\n\n' +
      'Program je osmišljen tako da ga mogu uspješno pratiti i polaznici bez prethodnog iskustva, dok oni koji su već upoznati s osnovama robotike imaju priliku dodatno produbiti znanje kroz izazovnije zadatke i vlastite nadogradnje projekata.\n\n' +
      'Program se sastoji od 16 robotičkih projekata raspoređenih u četiri tematska modula, kroz koje djeca istražuju ključne sustave suvremenog svijeta – od interaktivne tehnologije do industrije i energije.\n\n' +
      'Kroz praktičan rad, eksperimentiranje i samostalno rješavanje zadataka, polaznici razvijaju preciznost, analitičko razmišljanje i sigurnost u radu s tehnologijom.\n\n' +
      'Po završetku programa polaznici mogu nastaviti svoje učenje u naprednijem programu Svijet LEGO robotike 4.',
    ageMin: 11,
    ageMax: 12,
    equipment: 'LEGO SPIKE Prime + Scratch',
    priceYear: 400,
    priceModule: 110,
    hours: 56,
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 8,
    coverImage: '/images/courses/slr-3/cover.jpg',
    modules: [
      {
        title: 'Zabavni sustavi 3.0',
        description:
          'Kako nastaju interaktivni sustavi koji reagiraju na korisnika?\n\n' +
          'U ovom modulu djeca istražuju kako kombinacijom mehanike i programiranja nastaju sustavi koji stvaraju pokret, zvuk i reakciju. Fokus je na razvoju interaktivnih modela koji nisu samo funkcionalni, već i zanimljivi za korištenje.\n\n' +
          'Kroz projekte poput spirografa, vrtuljka i glazbene kutije, polaznici uče precizno upravljati motorima i sinkronizirati različite radnje pomoću programa.\n\n' +
          'Poseban naglasak stavlja se na samostalnost i kreativno izražavanje kroz projekt po vlastitoj ideji, gdje djeca razvijaju rješenje od početne zamisli do gotovog modela.',
        image: '/images/courses/slr-3/module-1.png',
      },
      {
        title: 'Prometni sustavi 3.0',
        description:
          'Kako tehnologija unapređuje promet i učinkovitost kretanja?\n\n' +
          'U ovom modulu polaznici istražuju složenije aspekte prometa i funkcioniranja vozila. Kroz praktičan rad upoznaju principe koji omogućuju učinkovito i kontrolirano kretanje.\n\n' +
          'Izradom modela poput mehaničkog mjenjača, trkaćeg vozila i motocikla, djeca uče kako se prenosi snaga, kako se kontrolira brzina i na koji način različiti mehanizmi utječu na performanse vozila.\n\n' +
          'Uz tehnički dio, razvijaju i razumijevanje šire slike – kako prometni sustavi utječu na svakodnevni život i zašto je njihova optimizacija važna.',
        image: '/images/courses/slr-3/module-2.png',
      },
      {
        title: 'Industrijski sustavi 3.0',
        description:
          'Kako funkcioniraju automatizirani sustavi u industriji?\n\n' +
          'Ovaj modul uvodi polaznike u naprednije koncepte automatizacije i preciznog upravljanja strojevima. Djeca kroz projekte upoznaju način rada sustava koji se koriste u proizvodnji i obradi materijala.\n\n' +
          'Kroz izradu robotičkog manipulatora, razvrstavača boja i CNC uređaja, polaznici uče kako programirati robote da izvršavaju točne i ponovljive zadatke.\n\n' +
          'Naglasak je na razumijevanju logike rada sustava, analizi problema i pronalaženju učinkovitih rješenja – vještinama koje su ključne u suvremenoj industriji.',
        image: '/images/courses/slr-3/module-3.png',
      },
      {
        title: 'Energetski sustavi 2.0',
        description:
          'Kako se energija proizvodi i koristi u modernom svijetu?\n\n' +
          'U ovom modulu djeca istražuju različite izvore energije i načine njihove primjene. Poseban fokus stavlja se na obnovljive izvore i njihovu ulogu u budućnosti.\n\n' +
          'Kroz projekte poput vjetroturbine, vjetroelektrane i solarne lampe, polaznici uče kako dolazi do pretvorbe energije i kako se ona koristi za pokretanje sustava.\n\n' +
          'Uz tehničko znanje, razvijaju i svijest o važnosti održivosti te razumiju kako tehnologija može doprinijeti očuvanju okoliša.',
        image: '/images/courses/slr-3/module-4.png',
      },
    ],
    color: 'text-teal-700',
    gradient: 'from-teal-500 to-cyan-700',
    highlightColor: 'bg-teal-50 border-teal-200',
  },
  {
    slug: 'slr-4',
    level: 'SLR_4',
    title: 'Svijet LEGO Robotike 4',
    subtitle: 'Napredni program robotike za djecu (12 – 14 godina)',
    description:
      'Program Svijet LEGO robotike 4 predstavlja završni stupanj našeg edukacijskog kurikuluma robotike i namijenjen je djeci uzrasta od 12 do 14 godina (7. i 8. razred), kao i polaznicima koji su prethodno pohađali program Svijet LEGO robotike 3.\n\n' +
      'U ovom programu polaznici rade na najzahtjevnijim projektima unutar kurikuluma te dodatno razvijaju tehničke, logičke i inženjerske vještine kroz primjenu robotike u stvarnim situacijama.\n\n' +
      'Korištenjem naprednih LEGO edukacijskih setova i programskog okruženja, djeca izrađuju složene robotičke sustave koji zahtijevaju precizno planiranje, testiranje i optimizaciju. Naglasak je na razumijevanju kako različiti dijelovi sustava međusobno surađuju i kako se mogu unaprijediti.\n\n' +
      'Radionice su strukturirane tako da i polaznici bez prethodnog iskustva mogu postupno usvojiti gradivo, dok oni s već razvijenim znanjem dobivaju dodatne izazove kroz kompleksnije zadatke i samostalne projekte.\n\n' +
      'Program se sastoji od 16 robotičkih projekata podijeljenih u četiri tematska modula, kroz koje polaznici istražuju napredne tehnološke sustave i njihovu primjenu u svakodnevnom životu.\n\n' +
      'Kroz rad na projektima djeca razvijaju analitičko razmišljanje, preciznost, samostalnost i sposobnost rješavanja složenih problema – vještine koje su ključne za daljnje obrazovanje i buduće zanimanje u STEM području.\n\n' +
      'Po završetku programa polaznici uz preporuku predavača ostvaruju pravo nastavka svog razvoja kroz natjecateljske programe robotike (FLL, WRO i sl.).',
    ageMin: 13,
    ageMax: 14,
    equipment: 'LEGO SPIKE Prime + Scratch',
    priceYear: 400,
    priceModule: 110,
    hours: 56,
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 8,
    coverImage: '/images/courses/slr-4/cover.jpg',
    modules: [
      {
        title: 'Zabavni sustavi 4.0',
        description:
          'Kako osmisliti i razviti kompleksne interaktivne sustave?\n\n' +
          'U ovom modulu polaznici rade na razvoju naprednih interaktivnih modela koji kombiniraju više funkcionalnosti – pokret, reakciju na okolinu i korisničku interakciju.\n\n' +
          'Kroz složenije projekte djeca uče kako povezati različite senzore i motore u jedinstveni sustav te kako programiranjem postići precizno i koordinirano ponašanje robota.\n\n' +
          'Poseban fokus stavlja se na razvoj vlastitih ideja i rješenja – od planiranja do realizacije – čime polaznici prelaze iz faze učenja u fazu stvaranja vlastitih tehnoloških rješenja.',
        image: '/images/courses/slr-4/module-1.png',
      },
      {
        title: 'Prometni sustavi 4.0',
        description:
          'Kako izgleda promet budućnosti i koje izazove donosi?\n\n' +
          'U ovom modulu djeca istražuju napredne koncepte prometnih sustava, uključujući automatizaciju, optimizaciju i sigurnost.\n\n' +
          'Kroz izradu složenijih modela vozila i prometnih rješenja, polaznici uče kako različiti sustavi međusobno komuniciraju i kako se mogu programirati za učinkovitije upravljanje prometom.\n\n' +
          'Naglasak je na razumijevanju kompleksnih sustava i donošenju odluka koje utječu na njihovu učinkovitost i sigurnost.',
        image: '/images/courses/slr-4/module-2.png',
      },
      {
        title: 'Industrijski sustavi 4.0',
        description:
          'Kako funkcioniraju suvremeni automatizirani proizvodni sustavi?\n\n' +
          'Ovaj modul uvodi polaznike u napredne industrijske procese i tehnologije koje se koriste u modernim tvornicama.\n\n' +
          'Kroz izgradnju i programiranje složenih robotičkih sustava, djeca uče kako optimizirati procese, povećati učinkovitost i smanjiti pogreške u radu.\n\n' +
          'Fokus je na razumijevanju automatizacije, koordinaciji više komponenti te razvoju sustava koji mogu samostalno izvršavati zadatke.',
        image: '/images/courses/slr-4/module-3.png',
      },
      {
        title: 'Energetski sustavi 3.0',
        description:
          'Kako razvijati održiva i učinkovita energetska rješenja?\n\n' +
          'U ovom modulu polaznici istražuju naprednije koncepte proizvodnje i upravljanja energijom, s naglaskom na održivost i buduće tehnologije.\n\n' +
          'Kroz projekte djeca analiziraju kako se energija prenosi, pohranjuje i koristi u različitim sustavima te kako se mogu razviti učinkovitija i ekološki prihvatljivija rješenja.\n\n' +
          'Osim tehničkog znanja, potiče se i kritičko razmišljanje o ulozi tehnologije u očuvanju okoliša i razvoju društva.',
        image: '/images/courses/slr-4/module-4.jpg',
      },
    ],
    color: 'text-blue-700',
    gradient: 'from-cyan-600 to-blue-700',
    highlightColor: 'bg-blue-50 border-blue-200',
  },
]

export function getCourseBySlug(slug: string): Course | undefined {
  return courses.find((c) => c.slug === slug)
}
