export type CourseLevel = 'SLR_1' | 'SLR_2' | 'SLR_3' | 'SLR_4'

export interface CourseModule {
  title: string
  description: string
}

export interface Course {
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
    subtitle: 'Uvod u robotiku za najmlađe',
    description:
      'Tečaj SLR 1 namijenjen je djeci od 6 do 8 godina koja prvi put ulaze u svijet robotike i programiranja. ' +
      'Kroz igru i istraživanje djeca uče osnovne pojmove mehanike i programiranja koristeći LEGO WeDo 2.0 platformu. ' +
      'Svaki modul traje 14 školskih sati, a nastava se odvija jednom tjedno u trajanju od 90 minuta. ' +
      'Godišnji program obuhvaća 4 modula, ukupno 56 školskih sati.',
    ageMin: 6,
    ageMax: 8,
    equipment: 'LEGO WeDo 2.0',
    priceYear: 400,
    priceModule: 110,
    hours: 56,
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 8,
    modules: [
      {
        title: 'Modul 1 – Uvod u mehaniku',
        description: 'Osnove mehanike, zupčanici, poluge i koloture. Djeca otkrivaju kako jednostavni strojevi olakšavaju rad.',
      },
      {
        title: 'Modul 2 – Senzori i motori',
        description: 'Rad s motorima i senzorima pokreta i nagiba. Roboti koji reagiraju na okolinu.',
      },
      {
        title: 'Modul 3 – Programiranje',
        description: 'Uvod u blokovno programiranje u LEGO Education aplikaciji. Naredbe, petlje i uvjetne radnje.',
      },
      {
        title: 'Modul 4 – Projekt',
        description: 'Timski projektni rad: izrada i prezentacija robota. Razvoj suradnje i kreativnog razmišljanja.',
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
    subtitle: 'Napredna mehanika i programiranje',
    description:
      'Tečaj SLR 2 namijenjen je djeci od 9 do 10 godina koja su završila SLR 1 ili imaju osnovno znanje o robotici. ' +
      'Djeca nadograđuju znanje o mehanici i programiranju koristeći napredniju primjenu LEGO WeDo 2.0 platforme. ' +
      'Program uključuje složenije konstrukcije i uvod u algoritamsko razmišljanje.',
    ageMin: 9,
    ageMax: 10,
    equipment: 'LEGO WeDo 2.0',
    priceYear: 400,
    priceModule: 110,
    hours: 56,
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 8,
    modules: [
      {
        title: 'Modul 1 – Složene konstrukcije',
        description: 'Napredne mehaničke konstrukcije i transmisije. Polaznici grade složenije modele s više pokretnih dijelova.',
      },
      {
        title: 'Modul 2 – Napredni senzori',
        description: 'Rad s više senzora istovremeno, uvjetni iskazi. Robot koji donosi odluke na temelju podataka.',
      },
      {
        title: 'Modul 3 – Algoritmi',
        description: 'Algoritamsko razmišljanje, petlje i uvjetne grane. Rješavanje problema korak po korak.',
      },
      {
        title: 'Modul 4 – Timski projekt',
        description: 'Izrada složenijeg robota s punom programskom logikom. Prezentacija i obrana projekta.',
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
    subtitle: 'LEGO Spike Prime – pravi inženjering',
    description:
      'Tečaj SLR 3 uvodi djecu od 11 do 12 godina u naprednu robotiku pomoću LEGO Spike Prime platforme. ' +
      'Polaznici uče tekstualno programiranje i rade na kompleksnijim inženjerskim izazovima. ' +
      'LEGO Spike Prime omogućuje preciznije motore, više vrsta senzora i programiranje u Python/Scratch okruženju. ' +
      'Ovaj tečaj priprema polaznike za natjecanja poput FLL i WRO.',
    ageMin: 11,
    ageMax: 12,
    equipment: 'LEGO Spike Prime',
    priceYear: 400,
    priceModule: 110,
    hours: 56,
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 8,
    modules: [
      {
        title: 'Modul 1 – Spike Prime osnove',
        description: 'Upoznavanje s Spike Prime setom i novim mogućnostima. Precizni motori i napredni senzori.',
      },
      {
        title: 'Modul 2 – Programiranje u Scratch',
        description: 'Napredni Scratch za upravljanje robotima. Složeni algoritmi i paralelne radnje.',
      },
      {
        title: 'Modul 3 – Uvod u Python',
        description: 'Osnove Python programiranja za robotiku. Varijable, funkcije i petlje u pravom programskom jeziku.',
      },
      {
        title: 'Modul 4 – Natjecateljski robot',
        description: 'Izrada robota za natjecanje (FLL/WRO format). Strategija, preciznost i timski rad.',
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
    subtitle: 'Industrijsko doba – napredni sustavi',
    description:
      'Tečaj SLR 4 namijenjen je polaznicima od 13 do 14 godina koji su završili SLR 3 ili imaju odgovarajuće predznanje. ' +
      'Koristimo LEGO Spike Prime s Scratch programiranjem za simulaciju stvarnih industrijskih i prometnih sustava. ' +
      'Program je organiziran u 4 tematska modula koja predstavljaju različite grane industrije. ' +
      'Ovo je najviša razina programa koja priprema polaznike za napredna robotička natjecanja.',
    ageMin: 13,
    ageMax: 14,
    equipment: 'LEGO Spike Prime (Scratch)',
    priceYear: 400,
    priceModule: 110,
    hours: 56,
    sessionDuration: 90,
    sessionFrequency: 'Jednom tjedno',
    season: 'Listopad – Svibanj',
    groupSize: 8,
    modules: [
      {
        title: 'Zabavni Sustavi 4.0',
        description:
          'Sigurnosni sef, zabavni stroj, robotski čuvar – interaktivni uređaji koji simuliraju zabavne i sigurnosne sustave moderne svakodnevice.',
      },
      {
        title: 'Prometni Sustavi 4.0',
        description:
          'Helikopter, nagibni avion, simulator leta – modeli koji istražuju prometne tehnologije i mehanizme kojima se koristi suvremeni transport.',
      },
      {
        title: 'Industrijski Sustavi 4.0',
        description:
          'Lift, transportna traka, sorter – simulacija modernih industrijskih procesa koji pokretaju globalnu ekonomiju.',
      },
      {
        title: 'Robotsko Vozilo 1.0',
        description:
          'Jedan sveobuhvatni projektni zadatak: izrada i programiranje autonomnog vozila koje se samostalno snalazi u prostoru.',
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
