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
    subtitle: 'LEGO WeDo 2.0 – WeDo ikone',
    description:
      'Tečaj SLR 1 namijenjen je početnicima od 6 do 8 godina (predškolci do 2. razreda). ' +
      'Na zabavan i kreativan način djeca se uvode u svijet robotike uz LEGO WeDo 2.0 edukacijski set i ikoničko programiranje. ' +
      'Polaznici grade i programiraju šesnaest projekata raspoređenih u četiri tematska modula te otkrivaju znanstvene principe kroz praktičan rad. ' +
      'Godišnji program obuhvaća 4 modula, ukupno 56 školskih sati (14 sati po modulu). ' +
      'Završetkom programa polaznici stječu uvjete za upis u SLR 2.',
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
        title: 'Zabavni Sustavi 1.0',
        description:
          'Kako robotika i moderne tehnologije služe zabavne svrhe? Polaznici grade Vrtuljak, Leptira, Humanoid i projekt po slobodnom izboru.',
        image: '/images/courses/slr-1/module-1.png',
      },
      {
        title: 'Prometni Sustavi 1.0',
        description:
          'Suvremeni promet i tehnološki napredak. Četiri projekta: Utrka automobila, Motocikl, Vatrogasno vozilo i projekt po slobodnom izboru.',
        image: '/images/courses/slr-1/module-2.png',
      },
      {
        title: 'Industrijski Sustavi 1.0',
        description:
          'Industrijski strojevi i ubrzavanje proizvodnje. Projekti: Lift, Viličar, Manipulator i projekt po slobodnom izboru.',
        image: '/images/courses/slr-1/module-3.png',
      },
      {
        title: 'Svemirski Sustavi',
        description:
          'Spoj astronomije, inženjerstva, fizike i robotike. Polaznici grade Svemirski top, Mars rover, Svemirski brod i samostalni projekt.',
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
    subtitle: 'LEGO SPIKE Essential – SPIKE Essential ikone',
    description:
      'Tečaj SLR 2 namijenjen je početnicima od 9 do 10 godina (3. i 4. razred) ili onima koji su završili SLR 1. ' +
      'Program se izvodi uz LEGO SPIKE Essential edukacijski set. ' +
      'Polaznici grade i programiraju šesnaest projekata u četiri tematska modula te istražuju kako tehnologija i robotika služe suvremenom društvu. ' +
      'Godišnji program obuhvaća 4 modula, ukupno 56 školskih sati (14 sati po modulu). ' +
      'Završetkom programa polaznici stječu uvjete za upis u SLR 3.',
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
        title: 'Zabavni Sustavi 2.0',
        description:
          'Robotika u zabavne svrhe i stvaranje sustava za razonodu. Projekti: Spirograf, Humanoid, Žabe i projekt po slobodnom izboru.',
        image: '/images/courses/slr-2/module-1.png',
      },
      {
        title: 'Prometni Sustavi 2.0',
        description:
          'Moderna prometna tehnologija i upravljanje naprednim letjelicama. Projekti: Avion, Dvokrilni avion, Helikopter i projekt po slobodnom izboru.',
        image: '/images/courses/slr-2/module-2.png',
      },
      {
        title: 'Industrijski Sustavi 2.0',
        description:
          'Industrijski strojevi i upravljanje proizvodnom opremom. Projekti: Rudnička željeznica, Dizalica, Robotska ruka i projekt po slobodnom izboru.',
        image: '/images/courses/slr-2/module-3.png',
      },
      {
        title: 'Energetski Sustavi 1.0',
        description:
          'Obnovljivi i tradicionalni energetski izvori te pretvorba energije. Projekti: Vodena brana, Naftna pumpa, Vjetrenjača i projekt po slobodnom izboru.',
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
    subtitle: 'LEGO SPIKE Prime – Scratch',
    description:
      'Tečaj SLR 3 namijenjen je početnicima od 11 do 12 godina (5. i 6. razred) ili onima koji su završili SLR 2. ' +
      'Uz LEGO Spike Prime edukacijski set i Scratch programsko okruženje, polaznici istražuju kako tehnologija i robotika služe suvremenom društvu. ' +
      'Program uključuje izgradnju i programiranje šesnaest projekata raspoređenih u četiri tematska modula. ' +
      'Godišnji program obuhvaća 4 modula, ukupno 56 školskih sati (14 sati po modulu). ' +
      'Završetkom programa polaznici stječu uvjete za upis u SLR 4.',
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
        title: 'Zabavni Sustavi 3.0',
        description:
          'Kako tehnologija može služiti rekreacijske svrhe? Polaznici grade Spirograf, Vrtuljak, Glazbenu kutiju i projekt po slobodnom izboru.',
        image: '/images/courses/slr-3/module-1.png',
      },
      {
        title: 'Prometni Sustavi 3.0',
        description:
          'Razvoj modernih vozila i izazovi automatizacije prometa. Projekti: Mehanički prijenos, Trkački automobil, Motocikl i projekt po slobodnom izboru.',
        image: '/images/courses/slr-3/module-2.png',
      },
      {
        title: 'Industrijski Sustavi 3.0',
        description:
          'Industrijska automatizacija u modernoj proizvodnji. Projekti: Manipulator, Razvrstavač boja, CNC uređaj i projekt po slobodnom izboru.',
        image: '/images/courses/slr-3/module-3.png',
      },
      {
        title: 'Energetski Sustavi 2.0',
        description:
          'Obnovljiva energija kao učinkovita i ekološka proizvodnja. Projekti: Vjetroturbina, Vjetroelektrana, Solarna lampa i projekt po slobodnom izboru.',
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
    subtitle: 'LEGO SPIKE Prime – Scratch',
    description:
      'Tečaj SLR 4 namijenjen je početnicima od 13 do 14 godina (7. i 8. razred) ili onima koji su završili SLR 3. ' +
      'Program se izvodi uz LEGO Spike Prime edukacijski set i Scratch programsko okruženje. ' +
      'Polaznici grade i programiraju projekte koji simuliraju stvarne industrijske, prometne i zabavne sustave. ' +
      'Godišnji program obuhvaća 4 modula, ukupno 56 školskih sati (14 sati po modulu). ' +
      'Završetkom programa polaznici stječu uvjete za sudjelovanje na naprednim robotičkim natjecanjima (FLL, WRO).',
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
        title: 'Zabavni Sustavi 4.0',
        description:
          'Kako tehnologija i robotika mogu služiti zabavne svrhe? Projekti: Sigurnosni sef, Zabavni stroj, Robotski čuvar i projekt po slobodnom izboru.',
        image: '/images/courses/slr-4/module-1.png',
      },
      {
        title: 'Prometni Sustavi 4.0',
        description:
          'Karakteristike zračnog prometa i dizajn letjelica. Projekti: Helikopter, Nagibni avion, Simulator leta i projekt po slobodnom izboru.',
        image: '/images/courses/slr-4/module-2.png',
      },
      {
        title: 'Industrijski Sustavi 4.0',
        description:
          'Industrijska automatizacija i precizni strojevi. Projekti: Lift, Transportna traka, Višenamjenski razvrstavač i projekt po slobodnom izboru.',
        image: '/images/courses/slr-4/module-3.png',
      },
      {
        title: 'Robotsko Vozilo 1.0',
        description:
          'Autonomno vozilo koje se samostalno snalazi u prostoru. Jedan sveobuhvatni projekt koji pokriva ključne komponente, motore i senzore potrebne za samostalno kretanje robota.',
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
