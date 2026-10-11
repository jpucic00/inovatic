type CourseLevel = 'UVOD' | 'SLR_1' | 'SLR_2' | 'SLR_3' | 'SLR_4'

interface CourseModule {
  title: string
  description: string
  image: string
}

interface HeroRobot {
  src: string
  width: number
  height: number
}

export interface Course {
  slug: string
  level: CourseLevel
  /**
   * One or two characters for the square badge on the program cards. Derived
   * from the title everywhere until the intro program arrived, whose title does
   * not end in its own number.
   *
   * Uvod's `0` is authored, not derived, and is deliberate: it places the intro
   * program before SLR 1 rather than beside it, which an initial `U` did not.
   * `/programi` pads numeric badges to two digits, so that column reads 00–04.
   * The non-numeric branch there is unused today but stays — a future badge
   * that is not a digit would come out as `0U` under a bare pad.
   */
  badge: string
  title: string
  subtitle: string
  description: string
  ageMin: number
  ageMax: number
  equipment: string
  tools: string
  priceYear: number
  priceModule: number
  hours: number
  hoursUnit?: string
  sessionDuration: number
  sessionFrequency: string
  season: string
  groupSize: number
  coverImage: string
  heroBg: string
  heroRobot: HeroRobot
  modules: CourseModule[]
  color: string
  gradient: string
  highlightColor: string
}

export const courses: Course[] = [
  {
    slug: 'uvod-u-svijet-lego-robotike',
    level: 'UVOD',
    badge: '0',
    title: 'Uvod u Svijet LEGO robotike',
    subtitle: 'Početni program robotike za predškolce (5 – 6 godina)',
    description:
      'Uvod u Svijet LEGO robotike početni je stupanj našeg kurikuluma LEGO robotike i namijenjen je početnicima uzrasta od 5 do 6 godina (predškolci).\n\n' +
      'Ovaj program, koristeći LEGO WeDo 2.0 edukacijske setove i LEGO® Education ikonsko programiranje, na zabavan i kreativan način uvodi početnike u čudesan svijet robotike koji nas okružuje.\n\n' +
      'Koji su to najvažniji sustavi od kojih se sastoji naš svijet, ali i svijet iznad nas, možete saznati u ovoj živopisnoj seriji LEGO projekata — izgradnjom i programiranjem robota koji oduzimaju dah.\n\n' +
      'Program sadrži ukupno šesnaest projekata koje polaznici samostalno izrađuju unutar četiri tematska modula: Zabavni sustavi, Prometni sustavi, Industrijski sustavi i Svemirski sustavi.\n\n' +
      'Svaki projekt pruža priliku da se kroz praktično iskustvo lakše razumiju neki od najimpresivnijih znanstvenih principa koji se danas koriste. Gradite, programirajte i učite uz naše LEGO projekte!\n\n' +
      'Unutar ovog programa možete upisati sva četiri modula odjednom ili pojedini modul po želji.\n\n' +
      'Po završetku programa polaznici ostvaruju pravo upisa u sljedeći stupanj — program Svijet LEGO robotike 1.',
    ageMin: 5,
    ageMax: 6,
    equipment: 'LEGO WeDo 2.0',
    tools: 'LEGO Education ikonsko programiranje',
    priceYear: 400,
    priceModule: 110,
    hours: 28,
    sessionDuration: 60,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 12,
    coverImage: '/images/courses/uvod-u-svijet-lego-robotike/cover.webp',
    heroBg: '/images/courses/uvod-u-svijet-lego-robotike/hero-bg.webp',
    heroRobot: {
      src: '/images/courses/uvod-u-svijet-lego-robotike/hero-robot.webp',
      width: 1400,
      height: 875,
    },
    modules: [
      {
        title: 'Zabavni sustavi',
        description:
          'Na koji način koristiti robotiku i moderne tehnologije u zabavne svrhe? Što čini razliku između krajnjeg korisnika i tvorca zabavne tehnologije? Možemo li kroz svijet robotike postati izumitelji koji će samostalno izgraditi zabavne sustave i naučiti njima upravljati?\n\n' +
          'To su teme ove cjeline, koja se obrađuje kroz četiri projekta: Vrtuljak, Leptir, Humanoid i projekt po slobodnom izboru.',
        image: '/images/courses/uvod-u-svijet-lego-robotike/module-1.jpg',
      },
      {
        title: 'Prometni sustavi',
        description:
          'Promet se od davnina koristi za prijevoz robe i ljudi. Tehnologija je znatno unaprijedila kopneni i zračni promet koji se danas odvija u svijetu, a brza, kvalitetna i sigurna prometna povezanost presudna je za kvalitetu života u modernim gradovima.\n\n' +
          'Kako izgraditi prometna vozila i naučiti njima upravljati teme su ove cjeline, koja se obrađuje kroz četiri projekta: Automobilska utrka, Motocikl, Vatrogasno vozilo i projekt po slobodnom izboru.',
        image: '/images/courses/uvod-u-svijet-lego-robotike/module-2.jpg',
      },
      {
        title: 'Industrijski sustavi',
        description:
          'Razvoj industrije pospješuje rast i razvoj modernih država i gradova svijeta. Sve je veći broj industrijskih i poduzetničkih zona smještenih u blizini većih gradova, a svaka od njih za svoj rad koristi razne industrijske sustave i strojeve kojima unapređuje i ubrzava proizvodnju.\n\n' +
          'Kako izgraditi sve te tehnički besprijekorne konstrukcije i naučiti njima upravljati teme su ove cjeline, koja se obrađuje kroz četiri projekta: Dizalo, Viličar, Manipulator i projekt po slobodnom izboru.',
        image: '/images/courses/uvod-u-svijet-lego-robotike/module-3.jpg',
      },
      {
        title: 'Svemirski sustavi',
        description:
          'Krenite na putovanje ispunjeno astronomijom, inženjerstvom, fizikom i robotima. Svemirski sustavi, zahvaljujući razvoju tehnologije, čine najveće tehnološke izume čovječanstva i daju nam priliku da bolje razumijemo svemir i stvari iznad nas.\n\n' +
          'Kako izgraditi sve te konstrukcije koje oduzimaju dah i naučiti njima upravljati teme su ove cjeline, koja se obrađuje kroz četiri projekta: Svemirski top, Mars rover, Svemirska letjelica i projekt po slobodnom izboru.',
        image: '/images/courses/uvod-u-svijet-lego-robotike/module-4.jpg',
      },
    ],
    color: 'text-emerald-600',
    gradient: 'from-emerald-400 to-teal-500',
    highlightColor: 'bg-emerald-50 border-emerald-200',
  },
  {
    slug: 'slr-1',
    level: 'SLR_1',
    badge: '1',
    title: 'Svijet LEGO Robotike 1',
    subtitle: 'Početni program robotike za djecu (7 – 8 godina)',
    description:
      'Program Svijet LEGO robotike 1 prvi je stupanj našeg edukacijskog kurikuluma robotike i namijenjen je djeci koja tek ulaze u svijet tehnologije, robotike i programiranja. Program je prilagođen uzrastu od 7 do 8 godina (1. i 2. razred), kao i polaznicima koji su završili program Uvod u Svijet LEGO robotike.\n\n' +
      'Kroz igru, kreativne projekte i praktičan rad polaznici otkrivaju kako nastaju roboti te kako ih samostalno izgraditi i programirati.\n\n' +
      'Korištenjem LEGO SPIKE Essential edukacijskih setova i LEGO Education SPIKE programskog okruženja, djeca razvijaju osnovne STEM vještine poput logičkog razmišljanja, rješavanja problema, kreativnosti i timskog rada. Vizualno programsko okruženje temeljeno na blokovima omogućuje djeci da na jednostavan i intuitivan način razumiju osnovne principe programiranja.\n\n' +
      'Svaki projekt potiče djecu na istraživanje i eksperimentiranje te im pomaže razumjeti kako tehnologija funkcionira u stvarnom svijetu.\n\n' +
      'Program se sastoji od 16 zanimljivih robotičkih projekata raspoređenih u četiri tematska modula. Kroz njih djeca uče kako izgraditi robota, kako ga programirati te kako povezati robotiku s pojavama i sustavima koji nas svakodnevno okružuju.\n\n' +
      'Radionice su osmišljene tako da djeca uče kroz praksu i zabavu, a svaki završeni projekt donosi osjećaj uspjeha i dodatnu motivaciju za daljnje istraživanje tehnologije.\n\n' +
      'Po završetku programa polaznici mogu nastaviti svoje učenje u naprednijem programu Svijet LEGO robotike 2.',
    ageMin: 7,
    ageMax: 8,
    equipment: 'LEGO SPIKE Essential',
    tools: 'SPIKE Essential ikone',
    priceYear: 400,
    priceModule: 110,
    hours: 28,
    sessionDuration: 60,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 12,
    coverImage: '/images/courses/slr-1/cover.webp',
    heroBg: '/images/courses/slr-1/hero-bg.webp',
    heroRobot: { src: '/images/courses/slr-1/hero-robot.webp', width: 1100, height: 943 },
    modules: [
      {
        title: 'Zabavni sustavi 1.0',
        description:
          'Kako nastaju tehnološke igračke i interaktivni sustavi koji nas zabavljaju?\n\n' +
          'U ovom modulu djeca kroz robotiku istražuju kako nastaju sustavi koji reagiraju na korisnika i stvaraju pokret. Uče kako kombinacijom motora i senzora mogu "oživjeti" svoje modele i pretvoriti ih u interaktivne atrakcije.\n\n' +
          'Izgradnjom projekata poput vrtuljka, panoramskog kotača i štanda s grickalicama, polaznici upoznaju osnovne principe mehanike, prijenosa gibanja i rada senzora. Poseban naglasak stavlja se na kreativnost – djeca ne samo da slijede upute, već se potiču da osmisle vlastite verzije i nadogradnje projekata.\n\n' +
          'Kroz ovaj modul razvijaju razumijevanje razlike između pasivnih i interaktivnih sustava te prvi put doživljavaju kako njihova ideja postaje funkcionalan model.',
        image: '/images/courses/slr-1/module-1.jpg',
      },
      {
        title: 'Prometni sustavi 1.0',
        description:
          'Promet je jedan od ključnih sustava modernog društva.\n\n' +
          'U ovom modulu djeca kroz praktične projekte upoznaju kako funkcioniraju prometni sustavi i koja je uloga tehnologije u svakodnevnom kretanju ljudi i robe – na kopnu, na vodi i u zraku.\n\n' +
          'Gradnjom i programiranjem različitih vozila, poput riječnog trajekta, taksija i helikoptera, polaznici istražuju pojmove brzine, smjera kretanja, skretanja i upravljanja. Uče kako programirati robota da se kreće na određeni način te kako prilagoditi njegovo ponašanje različitim situacijama.\n\n' +
          'Osim tehničkih znanja, djeca razvijaju i svijest o važnosti sigurnosti u prometu te razumiju kako tehnologija doprinosi organizaciji i učinkovitosti prometnih sustava.',
        image: '/images/courses/slr-1/module-2.jpg',
      },
      {
        title: 'Sportski i igraći sustavi 1.0',
        description:
          'Kako robotika može postati dio sporta i igre?\n\n' +
          'U ovom modulu djeca kroz omiljene sportove i igre otkrivaju kako motori, senzori i jednostavni mehanizmi mogu pokretati, usmjeravati i pratiti tijek igre.\n\n' +
          'Izgradnjom projekata poput mini golfa, kuglanja i flipera, polaznici upoznaju rad udarnih poluga, rampi i pomičnih prepreka te uče kako programom podesiti brzinu i smjer gibanja. Senzorima boje i nagiba robot svjetlom ili zvukom javlja je li cilj postignut.\n\n' +
          'Kroz ovaj modul djeca uče uspoređivati različite postavke istog mehanizma i otkrivaju kako jedna promjena utječe na rezultat. Pritom razvijaju preciznost, strpljenje i naviku da svoje rješenje isprobaju, provjere i poboljšaju.',
        image: '/images/courses/slr-1/module-3.jpg',
      },
      {
        title: 'Pametni sustavi 1.0',
        description:
          'Kako roboti mogu pomagati u svakodnevnom životu?\n\n' +
          'Pametni uređaji sve su prisutniji oko nas. U ovom modulu djeca istražuju kako motori, senzori i program zajedno stvaraju pomagala koja sama reagiraju i obavljaju korisne zadatke.\n\n' +
          'Izgradnjom i programiranjem modela poput stroja za pozdravljanje, čudovišta za otpad i robota pomagača, polaznici uče programirati ponavljajuće pokrete, otvaranje i zatvaranje te kretanje po zadanoj ruti. Uče i kako senzor prepoznaje predmete i pokreće odgovarajuću reakciju.\n\n' +
          'Kao završni modul prve razine, ovaj modul potiče samostalnost. Djeca sve više programe slažu sama, uz manje pomoći trenera, i razumiju kako tehnologija može olakšati svakodnevne zadatke.',
        image: '/images/courses/slr-1/module-4.jpg',
      },
    ],
    color: 'text-cyan-600',
    gradient: 'from-cyan-400 to-cyan-600',
    highlightColor: 'bg-cyan-50 border-cyan-200',
  },
  {
    slug: 'slr-2',
    level: 'SLR_2',
    badge: '2',
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
    equipment: 'LEGO SPIKE Essential',
    tools: 'SPIKE Essential ikone',
    priceYear: 400,
    priceModule: 110,
    hours: 28,
    sessionDuration: 60,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 12,
    coverImage: '/images/courses/slr-2/cover.webp',
    heroBg: '/images/courses/slr-2/hero-bg.webp',
    heroRobot: { src: '/images/courses/slr-2/hero-robot.webp', width: 1100, height: 827 },
    modules: [
      {
        title: 'Biorobotički sustavi 1.0',
        description:
          'Kako priroda nadahnjuje robote?\n\n' +
          'Životinje se kreću, reagiraju na zvukove i prepoznaju svoju okolinu, a inženjeri te sposobnosti prenose u robote. U ovom modulu djeca kroz robotiku istražuju kako oponašati pokrete i ponašanje živih bića.\n\n' +
          'Izgradnjom projekata poput sove, konja i gnijezda s ptićima, polaznici otkrivaju kako se vrtnja motora pomoću poluga i bregova pretvara u mahanje krilima, njihanje ili podizanje. Uče programirati robota da reagira na zvuk ili boju, baš kao što životinje reagiraju na podražaje iz okoline.\n\n' +
          'Kroz ovaj modul djeca razvijaju razumijevanje mehaničkih prijenosa i senzorskog upravljanja te otkrivaju vezu između prirode, znanosti i tehnologije.',
        image: '/images/courses/slr-2/module-1.png',
      },
      {
        title: 'Prometni sustavi 2.0',
        description:
          'Kako tehnologija oblikuje moderan promet i povezanost svijeta?\n\n' +
          'U ovom modulu djeca istražuju naprednije oblike prometa i tehnološka rješenja koja omogućuju upravljanje vozilima i letjelicama.\n\n' +
          'Kroz izgradnju i programiranje modela poput simulatora letenja, simulatora utrke i robotskog miša, polaznici uče kako se letjelicom upravlja naginjanjem upravljača i kako svjetlosni signali vode start utrke. Uče i kako isplanirati i programirati rutu kojom robot samostalno prolazi.\n\n' +
          'Djeca razvijaju razumijevanje složenijih sustava upravljanja, preciznosti i kontrole, ali i važnosti prometa za kvalitetu života u modernim gradovima.',
        image: '/images/courses/slr-2/module-2.png',
      },
      {
        title: 'Industrijski sustavi 2.0',
        description:
          'Kako funkcionira moderna industrija i automatizacija?\n\n' +
          'U ovom modulu polaznici ulaze u svijet naprednijih industrijskih sustava i procesa koji pokreću današnje gospodarstvo.\n\n' +
          'Kroz projekte poput dizalice, razvrstavača boja i transportera, djeca uče kako strojevi podižu, prenose i razvrstavaju materijale. Otkrivaju kako senzor može odlučiti kamo predmet treba ići i kako sustav bilježi koliko je predmeta kroz njega prošlo.\n\n' +
          'Naglasak je na razumijevanju preciznosti, ponovljivosti i učinkovitosti – ključnih elemenata moderne proizvodnje. Djeca kroz praktičan rad razvijaju sposobnost rješavanja složenijih problema i razumiju kako robotika ima stvarnu primjenu u industriji.',
        image: '/images/courses/slr-2/module-3.png',
      },
      {
        title: 'Zabavni sustavi 2.0',
        description:
          'Kako nastaju napredni interaktivni sustavi koji nas zabavljaju?\n\n' +
          'U ovom modulu djeca produbljuju svoje razumijevanje zabavne tehnologije i prelaze iz uloge korisnika u ulogu kreatora. Kroz robotiku istražuju kako osmisliti sustave koji reagiraju, komuniciraju i pružaju interakciju korisniku.\n\n' +
          'Kroz projekte poput elektroničke kocke, letećeg vrtuljka i brojača bodova, polaznici uče kako kombinirati mehaniku, senzore i programiranje kako bi dobili željeno ponašanje robota – od nasumičnog bacanja kocke do praćenja rezultata igre. Poseban naglasak stavlja se na samostalno osmišljavanje rješenja i razvoj vlastitih ideja, uključujući i projekt po slobodnom izboru.\n\n' +
          'Ovaj modul potiče kreativnost, ali i razumijevanje kako nastaju moderne digitalne i interaktivne "igračke" koje djeca svakodnevno koriste.',
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
    badge: '3',
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
    equipment: 'LEGO SPIKE Prime',
    tools: 'Scratch',
    priceYear: 470,
    priceModule: 130,
    hours: 56,
    hoursUnit: 'školskih sati',
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 12,
    coverImage: '/images/courses/slr-3/cover.webp',
    heroBg: '/images/courses/slr-3/hero-bg.webp',
    heroRobot: { src: '/images/courses/slr-3/hero-robot.webp', width: 1100, height: 1179 },
    modules: [
      {
        title: 'Zabavni sustavi 3.0',
        description:
          'Kako nastaju interaktivni sustavi koji reagiraju na korisnika?\n\n' +
          'U ovom modulu djeca istražuju kako kombinacijom mehanike i programiranja nastaju sustavi koji stvaraju pokret, zvuk i reakciju. Fokus je na razvoju interaktivnih modela koji nisu samo funkcionalni, već i zanimljivi za korištenje.\n\n' +
          'Kroz projekte poput spirografa, panoramskog kotača i glazbene kutije, polaznici uče precizno upravljati motorima i sinkronizirati različite radnje pomoću programa.\n\n' +
          'Poseban naglasak stavlja se na samostalnost i kreativno izražavanje kroz projekt po vlastitoj ideji, gdje djeca razvijaju rješenje od početne zamisli do gotovog modela.',
        image: '/images/courses/slr-3/module-1.png',
      },
      {
        title: 'Prometni sustavi 3.0',
        description:
          'Kako tehnologija unapređuje promet i učinkovitost kretanja?\n\n' +
          'U ovom modulu polaznici istražuju složenije aspekte prometa i funkcioniranja vozila. Kroz praktičan rad upoznaju principe koji omogućuju učinkovito i kontrolirano kretanje.\n\n' +
          'Izradom modela poput mjenjačke kutije, motocikla i dragstera, djeca uče kako se prenosi snaga i kako se kontrolira brzina. Otkrivaju i na koji način različiti mehanizmi utječu na performanse vozila, a senzorima mjere okretaje i broje prijeđene krugove.\n\n' +
          'Uz tehnički dio, razvijaju i razumijevanje šire slike – kako prometni sustavi utječu na svakodnevni život i zašto je njihova optimizacija važna.',
        image: '/images/courses/slr-3/module-2.png',
      },
      {
        title: 'Industrijski sustavi 3.0',
        description:
          'Kako funkcioniraju automatizirani sustavi u industriji?\n\n' +
          'Ovaj modul uvodi polaznike u naprednije koncepte automatizacije i preciznog upravljanja strojevima. Djeca kroz projekte upoznaju način rada sustava koji se koriste u proizvodnji i obradi materijala.\n\n' +
          'Kroz izradu robotičkog manipulatora, razvrstavača boja i plotera, uređaja za precizno crtanje, polaznici uče kako programirati robote da izvršavaju točne i ponovljive zadatke.\n\n' +
          'Naglasak je na razumijevanju logike rada sustava, analizi problema i pronalaženju učinkovitih rješenja – vještinama koje su ključne u suvremenoj industriji.',
        image: '/images/courses/slr-3/module-3.png',
      },
      {
        title: 'Energetski sustavi 1.0',
        description:
          'Kako vjetar i Sunce postaju energija koju koristimo?\n\n' +
          'U ovom modulu djeca istražuju različite izvore energije i načine njihove primjene, s posebnim fokusom na obnovljive izvore i njihovu ulogu u budućnosti.\n\n' +
          'Kroz projekte poput vjetroturbine, Savoniusove turbine i solarne svjetiljke, polaznici uče mjeriti brzinu vrtnje rotora i prikazivati punjenje baterije na zaslonu Huba. Programiraju i svjetiljku koja se pali tek kada se baterija dovoljno napuni.\n\n' +
          'Uz tehničko znanje, razvijaju i svijest o važnosti održivosti i uče razlikovati stvarno mjerenje od računalne simulacije.',
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
    badge: '4',
    title: 'Svijet LEGO Robotike 4',
    subtitle: 'Napredni program robotike za djecu (13 – 14 godina)',
    description:
      'Program Svijet LEGO robotike 4 predstavlja završni stupanj našeg edukacijskog kurikuluma robotike i namijenjen je djeci uzrasta od 13 do 14 godina (7. i 8. razred), kao i polaznicima koji su prethodno pohađali program Svijet LEGO robotike 3.\n\n' +
      'U ovom programu polaznici rade na najzahtjevnijim projektima unutar kurikuluma te dodatno razvijaju tehničke, logičke i inženjerske vještine kroz primjenu robotike u stvarnim situacijama.\n\n' +
      'Korištenjem LEGO SPIKE Prime edukacijskih setova te Scratch i Python programskih okruženja, djeca izrađuju složene robotičke sustave koji zahtijevaju precizno planiranje, testiranje i optimizaciju. Naglasak je na razumijevanju kako različiti dijelovi sustava međusobno surađuju i kako se mogu unaprijediti.\n\n' +
      'Radionice su strukturirane tako da i polaznici bez prethodnog iskustva mogu postupno usvojiti gradivo, dok oni s već razvijenim znanjem dobivaju dodatne izazove kroz kompleksnije zadatke i samostalne projekte.\n\n' +
      'Program se sastoji od četiri tematska modula, kroz koje polaznici istražuju napredne tehnološke sustave i njihovu primjenu u svakodnevnom životu.\n\n' +
      'Kroz rad na projektima djeca razvijaju analitičko razmišljanje, preciznost, samostalnost i sposobnost rješavanja složenih problema – vještine koje su ključne za daljnje obrazovanje i buduće zanimanje u STEM području.\n\n' +
      'Po završetku programa polaznici uz preporuku predavača ostvaruju pravo nastavka svog razvoja kroz natjecateljske programe robotike (FLL, WRO i sl.).',
    ageMin: 13,
    ageMax: 14,
    equipment: 'LEGO SPIKE Prime',
    tools: 'Scratch i Python',
    priceYear: 470,
    priceModule: 130,
    hours: 56,
    hoursUnit: 'školskih sati',
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 12,
    coverImage: '/images/courses/slr-4/cover.webp',
    heroBg: '/images/courses/slr-4/hero-bg.webp',
    heroRobot: { src: '/images/courses/slr-4/hero-robot.webp', width: 1100, height: 801 },
    modules: [
      {
        title: 'Prometni sustavi 4.0',
        description:
          'Kako izgleda promet budućnosti i koje izazove donosi?\n\n' +
          'U ovom modulu djeca istražuju napredne koncepte prometnih sustava, uključujući automatizaciju, optimizaciju i sigurnost, s naglaskom na upravljanje vozilima na kopnu i u zraku.\n\n' +
          'Kroz izradu složenijih modela vozila, letjelica i prometnih rješenja, polaznici uče kako izgraditi i upravljati modelima te kako različiti sustavi međusobno komuniciraju i mogu se programirati za učinkovitije upravljanje prometom.\n\n' +
          'Cjelina se obrađuje kroz projekte poput polagača mosta, simulatora letenja, motocikla i projekta po slobodnom izboru, pri čemu je naglasak na razumijevanju kompleksnih sustava i donošenju odluka koje utječu na njihovu učinkovitost i sigurnost. Polaznici prve programe pišu i u programskom jeziku Python.',
        image: '/images/courses/slr-4/module-1.png',
      },
      {
        title: 'Industrijski sustavi 4.0',
        description:
          'Kako funkcioniraju suvremeni automatizirani proizvodni sustavi?\n\n' +
          'Industrija je jedan od ključnih faktora razvijenosti modernih država, a posljednjih desetljeća obilježena je sve većom automatizacijom radnih i proizvodnih procesa.\n\n' +
          'U ovom modulu polaznici upoznaju napredne industrijske procese i tehnologije te kroz izgradnju i programiranje robotičkih sustava uče kako optimizirati procese, povećati učinkovitost i smanjiti pogreške u radu.\n\n' +
          'Cjelina se obrađuje kroz projekte poput dizalice, višestrukog razvrstavača, razvrstavača programiranog u Pythonu i projekta po slobodnom izboru, pri čemu je fokus na razumijevanju automatizacije, razvrstavanju predmeta prema boji i veličini, koordinaciji više komponenti i razvoju sustava koji mogu samostalno izvršavati zadatke.',
        image: '/images/courses/slr-4/module-2.png',
      },
      {
        title: 'Zabavni sustavi 4.0',
        description:
          'Kako osmisliti i razviti kompleksne interaktivne sustave?\n\n' +
          'U ovom modulu polaznici istražuju kako se robotika može koristiti u zabavne i interaktivne svrhe te što čini razliku između korisnika tehnologije i njezina kreatora. Kroz rad na naprednim modelima koji kombiniraju pokret, reakciju na okolinu i korisničku interakciju, djeca postupno razvijaju vlastita rješenja.\n\n' +
          'Kroz projekte poput lansirnog mehanizma, glazbene kutije, interaktivnog pingvina i projekta po slobodnom izboru, polaznici uče u Pythonu povezivati senzore i motore te programiranjem postići precizno i koordinirano ponašanje robota – od lansiranja upravljanog senzorom sile do pingvina koji pozdravlja i odgovara korisniku. Poseban naglasak stavlja se na razumijevanje kako nastaju interaktivni sustavi koji reagiraju na korisnika i stvaraju jedinstveno iskustvo. Time prelaze iz faze učenja u fazu stvaranja i razvijaju se u male inovatore.',
        image: '/images/courses/slr-4/module-3.png',
      },
      {
        title: 'Interaktivne igre 1.0',
        description:
          'Kako nastaju videoigre i kontroleri kojima ih igramo?\n\n' +
          'U završnom modulu programa polaznici postaju razvijatelji igara. Grade vlastite kontrolere i u programskom jeziku Python programiraju igre koje se igraju na svjetlosnom zaslonu Huba.\n\n' +
          'Cjelina se obrađuje kroz projekte poput igre labirinta, igre Zmija, arkadnog Tetrisa i projekta po slobodnom izboru. Djeca otkrivaju kako igra prati položaj igrača, prepoznaje sudare, broji bodove i određuje kraj igre. Pritom koriste koordinate, liste, petlje i uvjete – temeljne pojmove stvarnog programiranja igara.\n\n' +
          'Kroz ovaj modul polaznici povezuju mehaniku, senzore i napredno programiranje u cjelovit sustav. Postupno testiraju i mijenjaju pravila igre, što razvija analitičko razmišljanje i sposobnost otklanjanja pogrešaka.',
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

/**
 * Badge copy for the program hero and its JSON-LD `educationalLevel`.
 *
 * The intro program sits *before* the ladder rather than on it — it is what a
 * predškolac does the year before SLR 1 — so it is deliberately not numbered.
 * Calling it "Razina 1 od 5" would renumber four programs whose names are their
 * level ("Svijet LEGO Robotike 2" is, and must stay, razina 2).
 */
export function courseLevelLabel(course: Course): string {
  if (course.level === 'UVOD') return 'Pripremna razina'
  return `Razina ${course.level.slice(-1)} od 4`
}
