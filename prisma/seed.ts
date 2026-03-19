import { PrismaClient, CourseLevel, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

// ── BlockNote JSON helpers ────────────────────────────────────────────────────
// Produces PartialBlock-compatible JSON that BlockNote can load directly.

type BNInline = { type: 'text'; text: string; styles: Record<string, boolean> }
type BNBlock = { type: string; props?: Record<string, string | number | boolean | null>; content?: BNInline[]; children?: BNBlock[] }

const tx = (text: string): BNInline => ({ type: 'text', text, styles: {} })
const bx = (text: string): BNInline => ({ type: 'text', text, styles: { bold: true } })

const p     = (...c: BNInline[]): BNBlock => ({ type: 'paragraph', content: c })
const h2    = (text: string): BNBlock    => ({ type: 'heading', props: { level: 2 }, content: [tx(text)] })
const li    = (...c: BNInline[]): BNBlock => ({ type: 'bulletListItem', content: c })
const img   = (url: string, width = 512): BNBlock => ({ type: 'image', props: { url, caption: '', textAlignment: 'left', previewWidth: width } })
const video = (url: string): BNBlock    => ({ type: 'video', props: { url } })

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // ── Clear existing data (dev only, order matters for FK constraints) ────────
  await prisma.articleTag.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.article.deleteMany()
  await prisma.material.deleteMany()
  await prisma.enrollment.deleteMany()
  await prisma.inquiryGroupOption.deleteMany()
  await prisma.inquiry.deleteMany()
  await prisma.teacherAssignment.deleteMany()
  await prisma.scheduledGroup.deleteMany()
  await prisma.courseModule.deleteMany()
  await prisma.course.deleteMany()
  await prisma.location.deleteMany()
  await prisma.user.deleteMany()

  console.log('🗑️  Cleared existing data')

  // ── Admin user ───────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.create({
    data: {
      email: 'jozo@udruga-inovatic.hr',
      passwordHash: adminPassword,
      firstName: 'Jozo',
      lastName: 'Pivac',
      role: UserRole.ADMIN,
    },
  })
  console.log(`✅ Admin created: ${admin.email}`)

  // ── Dev admin (generic login) ──────────────────────────────────────────────
  const devAdmin = await prisma.user.create({
    data: {
      email: 'admin@inovatic.hr',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'Inovatic',
      role: UserRole.ADMIN,
    },
  })
  console.log(`✅ Dev admin created: ${devAdmin.email}`)

  // ── Demo teacher ─────────────────────────────────────────────────────────────
  const teacherPassword = await bcrypt.hash('teacher123', 12)
  const teacher = await prisma.user.create({
    data: {
      email: 'snjezana@udruga-inovatic.hr',
      passwordHash: teacherPassword,
      firstName: 'Snježana',
      lastName: 'Pivac',
      role: UserRole.TEACHER,
    },
  })
  console.log(`✅ Teacher created: ${teacher.email}`)

  // ── Locations ────────────────────────────────────────────────────────────────
  const velebitska = await prisma.location.create({
    data: {
      name: 'Velebitska 32',
      address: 'Velebitska 32, 21000 Split',
      lat: 43.5111,
      lng: 16.4497,
      isActive: true,
    },
  })

  const boskovica = await prisma.location.create({
    data: {
      name: 'Ruđera Boškovića 33',
      address: 'Ruđera Boškovića 33, 21000 Split',
      lat: 43.5089,
      lng: 16.4511,
      isActive: true,
    },
  })
  console.log('✅ Locations created')

  // ── Courses ──────────────────────────────────────────────────────────────────
  const slr1 = await prisma.course.create({
    data: {
      slug: 'slr-1',
      level: CourseLevel.SLR_1,
      title: 'Svijet LEGO Robotike 1',
      subtitle: 'Uvod u robotiku za najmlađe',
      description: `Tečaj SLR 1 je namijenjen djeci od 6 do 8 godina koja prvi put ulaze u svijet robotike i programiranja.
Kroz igru i istraživanje djeca uče osnovne pojmove mehanike i programiranja koristeći LEGO WeDo 2.0 platformu.

Svaki modul traje 14 školskih sati, a nastava se odvija jednom tjedno u trajanju od 90 minuta.
Godišnji program obuhvaća 4 modula, ukupno 56 školskih sati.`,
      ageMin: 6,
      ageMax: 8,
      equipment: 'LEGO WeDo 2.0',
      priceYear: 400.0,
      priceModule: 110.0,
      sortOrder: 1,
      isActive: true,
      modules: {
        create: [
          { title: 'Modul 1 – Uvod u mehaniku', sortOrder: 1, description: 'Osnove mehanike, zupčanici, poluge i koloture.' },
          { title: 'Modul 2 – Senzori i motori', sortOrder: 2, description: 'Rad s motorima i senzorima pokreta i nagiba.' },
          { title: 'Modul 3 – Programiranje', sortOrder: 3, description: 'Uvod u blokovno programiranje u LEGO Education aplikaciji.' },
          { title: 'Modul 4 – Projekt', sortOrder: 4, description: 'Timski projektni rad: izrada i prezentacija robota.' },
        ],
      },
    },
  })

  const slr2 = await prisma.course.create({
    data: {
      slug: 'slr-2',
      level: CourseLevel.SLR_2,
      title: 'Svijet LEGO Robotike 2',
      subtitle: 'Napredna mehanika i programiranje',
      description: `Tečaj SLR 2 je namijenjen djeci od 9 do 10 godina koja su završila SLR 1 ili imaju osnovno znanje o robotici.
Djeca nadograđuju znanje o mehanici i programiranju koristeći napredniju primjenu LEGO WeDo 2.0 platforme.

Program uključuje složenije konstrukcije i uvod u algoritamsko razmišljanje.`,
      ageMin: 9,
      ageMax: 10,
      equipment: 'LEGO WeDo 2.0',
      priceYear: 400.0,
      priceModule: 110.0,
      sortOrder: 2,
      isActive: true,
      modules: {
        create: [
          { title: 'Modul 1 – Složene konstrukcije', sortOrder: 1, description: 'Napredne mehaničke konstrukcije i transmisije.' },
          { title: 'Modul 2 – Napredni senzori', sortOrder: 2, description: 'Rad s više senzora istovremeno, uvjetni iskazi.' },
          { title: 'Modul 3 – Algoritmi', sortOrder: 3, description: 'Algoritmičko razmišljanje, petlje i uvjetne grane.' },
          { title: 'Modul 4 – Timski projekt', sortOrder: 4, description: 'Izrada složenijeg robota s punom programskom logikom.' },
        ],
      },
    },
  })

  const slr3 = await prisma.course.create({
    data: {
      slug: 'slr-3',
      level: CourseLevel.SLR_3,
      title: 'Svijet LEGO Robotike 3',
      subtitle: 'LEGO Spike Prime – pravi inženjering',
      description: `Tečaj SLR 3 uvodi djecu od 11 do 12 godina u naprednu robotiku pomoću LEGO Spike Prime platforme.
Polaznici uče tekstualno programiranje i rade na kompleksnijim inženjerskim izazovima.

LEGO Spike Prime omogućuje preciznije motore, više vrsta senzora i programiranje u Python/Scratch okruženju.`,
      ageMin: 11,
      ageMax: 12,
      equipment: 'LEGO Spike Prime',
      priceYear: 400.0,
      priceModule: 110.0,
      sortOrder: 3,
      isActive: true,
      modules: {
        create: [
          { title: 'Modul 1 – Spike Prime osnove', sortOrder: 1, description: 'Upoznavanje s Spike Prime setom i novim mogućnostima.' },
          { title: 'Modul 2 – Programiranje u Scratch', sortOrder: 2, description: 'Napredni Scratch za upravljanje robotima.' },
          { title: 'Modul 3 – Uvod u Python', sortOrder: 3, description: 'Osnove Python programiranja za robotiku.' },
          { title: 'Modul 4 – Natjecateljski robot', sortOrder: 4, description: 'Izrada robota za natjecanje (FLL/WRO format).' },
        ],
      },
    },
  })

  const slr4 = await prisma.course.create({
    data: {
      slug: 'slr-4',
      level: CourseLevel.SLR_4,
      title: 'Svijet LEGO Robotike 4',
      subtitle: 'Industrijsko doba – napredni sustavi',
      description: `Tečaj SLR 4 je namijenjen polaznicima od 13 do 14 godina koji su završili SLR 3 ili imaju odgovarajuće predznanje.
Koristimo LEGO Spike Prime s Scratch programiranjem za simulaciju stvarnih industrijskih i prometnih sustava.

Program je organiziran u 4 tematska modula koji predstavljaju različite grane industrije.`,
      ageMin: 13,
      ageMax: 14,
      equipment: 'LEGO Spike Prime (Scratch)',
      priceYear: 400.0,
      priceModule: 110.0,
      sortOrder: 4,
      isActive: true,
      modules: {
        create: [
          {
            title: 'Zabavni Sustavi 4.0',
            sortOrder: 1,
            description: 'Sigurnosni sef, zabavni stroj, robotski čuvar – interaktivni uređaji koji simuliraju zabavne i sigurnosne sustave.',
          },
          {
            title: 'Prometni Sustavi 4.0',
            sortOrder: 2,
            description: 'Helikopter, nagibni avion, simulator leta – modeli koji istražuju prometne tehnologije.',
          },
          {
            title: 'Industrijski Sustavi 4.0',
            sortOrder: 3,
            description: 'Lift, transportna traka, sorter – simulacija modernih industrijskih procesa.',
          },
          {
            title: 'Robotsko Vozilo 1.0',
            sortOrder: 4,
            description: 'Jedan sveobuhvatni projektni zadatak: izrada i programiranje autonomnog vozila.',
          },
        ],
      },
    },
  })

  console.log('✅ Courses and modules created')

  // ── Demo scheduled groups ────────────────────────────────────────────────────
  const group1 = await prisma.scheduledGroup.create({
    data: {
      courseId: slr1.id,
      locationId: velebitska.id,
      name: 'Grupa 1',
      dayOfWeek: 1, // Monday
      startTime: '19:00',
      endTime: '20:30',
      schoolYear: '2025/2026',
      maxCapacity: 8,
      isActive: true,
    },
  })

  const group2 = await prisma.scheduledGroup.create({
    data: {
      courseId: slr1.id,
      locationId: boskovica.id,
      name: 'Grupa 2',
      dayOfWeek: 3, // Wednesday
      startTime: '18:30',
      endTime: '20:00',
      schoolYear: '2025/2026',
      maxCapacity: 8,
      isActive: true,
    },
  })

  const group3 = await prisma.scheduledGroup.create({
    data: {
      courseId: slr4.id,
      locationId: velebitska.id,
      name: 'Grupa 1',
      dayOfWeek: 2, // Tuesday
      startTime: '18:00',
      endTime: '19:30',
      schoolYear: '2025/2026',
      maxCapacity: 8,
      isActive: true,
    },
  })

  // Assign teacher to groups
  await prisma.teacherAssignment.createMany({
    data: [
      { userId: teacher.id, scheduledGroupId: group1.id },
      { userId: teacher.id, scheduledGroupId: group2.id },
      { userId: teacher.id, scheduledGroupId: group3.id },
    ],
  })

  console.log('✅ Scheduled groups and teacher assignments created')

  // ── Demo student ─────────────────────────────────────────────────────────────
  const studentPassword = await bcrypt.hash('student123', 12)
  const student = await prisma.user.create({
    data: {
      email: 'ucenik@udruga-inovatic.hr',
      passwordHash: studentPassword,
      firstName: 'Marko',
      lastName: 'Primjer',
      role: UserRole.STUDENT,
    },
  })

  await prisma.enrollment.create({
    data: {
      userId: student.id,
      scheduledGroupId: group1.id,
      schoolYear: '2025/2026',
    },
  })

  console.log(`✅ Demo student created: ${student.email}`)

  // ── Tags ─────────────────────────────────────────────────────────────────────
  const [tagNatjecanja, tagRadionice, tagRezultati, tagObavijesti, tagEuProjekt] =
    await Promise.all([
      prisma.tag.create({ data: { name: 'Natjecanja', slug: 'natjecanja' } }),
      prisma.tag.create({ data: { name: 'Radionice', slug: 'radionice' } }),
      prisma.tag.create({ data: { name: 'Rezultati', slug: 'rezultati' } }),
      prisma.tag.create({ data: { name: 'Obavijesti', slug: 'obavijesti' } }),
      prisma.tag.create({ data: { name: 'EU Projekt', slug: 'eu-projekt' } }),
    ])

  console.log('✅ Tags created')


  // Content is stored as BlockNote JSON (PartialBlock[]).
  // Cover images set separately via: npm run db:seed-images

  // [1/69] regionalno-fll-2026
  const a1 = await prisma.article.create({
    data: {
      slug: 'regionalno-fll-2026',
      title: `Sjajni rezultati sa regionalnog FLL natjecanja – Pula 2026.`,
      excerpt: `Udruga za robotiku „Inovatic“ sudjelovala je na regionalnom polufinalnom turniru FIRST LEGO League Hrvatska, koji se održao 7. veljače u OŠ Šijana, Pula. Natjecanje je okupilo 18 polufinalnih ekipa, a samo 8 najboljih ostvarilo je plasman na finale državnog natjecanja u Zagrebu (7. ožujka).`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Udruga za robotiku „Inovatic“`, styles: {'bold': true} },
            { type: 'text', text: ` sudjelovala je na regionalnom polufinalnom turniru `, styles: {} },
            { type: 'text', text: `FIRST LEGO League Hrvatska`, styles: {'bold': true} },
            { type: 'text', text: `, koji se održao `, styles: {} },
            { type: 'text', text: `7. veljače`, styles: {'bold': true} },
            { type: 'text', text: ` u `, styles: {} },
            { type: 'text', text: `OŠ Šijana, Pula`, styles: {'bold': true} },
            { type: 'text', text: `. Natjecanje je okupilo 18 polufinalnih ekipa, a samo 8 najboljih ostvarilo je plasman na finale državnog natjecanja u Zagrebu (7. ožujka).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `S ponosom objavljujemo da su obje ekipe naše udruge izborile plasman na finale državnog natjecanja te ovim putem čestitamo članovima naših ekipa „`, styles: {} },
            { type: 'text', text: `Inovatic Conquerors`, styles: {'bold': true} },
            { type: 'text', text: `“ i „`, styles: {} },
            { type: 'text', text: `Plus i minus`, styles: {'bold': true} },
            { type: 'text', text: `“, kao i njihovim mentorima: `, styles: {} },
            { type: 'text', text: `Josipu Stepincu, Bruni Bešliću, Ivanu Stepincu i Viti Drnjeviću.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Podsjetimo, FIRST LEGO League je međunarodno STEM natjecanje u robotici, inovaciji i timskom radu namijenjeno djeci i mladima u dobi od 9 do 16 godina, a održava se u više od 110 zemalja diljem svijeta. Natjecatelji grade i programiraju robote, istražuju zadanu temu te svoja rješenja prezentiraju stručnim sucima.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Tema ove sezone, `, styles: {} },
            { type: 'text', text: `UNEARTHED`, styles: {'bold': true} },
            { type: 'text', text: `, vodi natjecatelje u istraživanje, otkrivanje i povezivanje prošlosti s tehnologijama budućnosti.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na samome natjecanju ekipe prolaze kroz četiri jednako važna i zahtjevna elementa:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Dizajn robota`, styles: {'bold': true} },
            { type: 'text', text: ` – ocjenjuje kvalitetu, konstrukciju i inovativnost robota`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Robotska igra`, styles: {'bold': true} },
            { type: 'text', text: ` – mjeri uspješnost robota na natjecateljskoj stazi`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Projektni zadatak`, styles: {'bold': true} },
            { type: 'text', text: ` – vezan uz temu sezone UNEARTHED, kroz istraživanje i inovativna rješenja`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Temeljne vrijednosti`, styles: {'bold': true} },
            { type: 'text', text: ` – timski rad, suradnja, poštovanje i fair play`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Posebno smo ponosni jer na FLL natjecanjima sudjelujemo od samog početka provedbe u RH, od 2017. godine, te kao udruga kontinuirano napredujemo – svaka nova generacija donosi sve snažnije ekipe, više znanja i bolje rezultate. Posebno nas raduje činjenica da su naši bivši polaznici, nekadašnji natjecatelji, danas prerasli u mentore poput našega Josipa, Ivana i Vite.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sada slijedi nastavak pripremanja na odjelu Politehnike, splitskog Pmf-a, gdje naša udruga aktivno djeluje u pripremama za natjecanja. U sklopu narednih priprema najprije slijedi faza detaljne analize sudačkih ocjena te unapređenje robota i projektnog zadatka. S iščekivanjem očekujemo sudjelovanje na finalnom državnom natjecanju te se nadamo prolasku na svjetski nastup u Houstonu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Organizator FIRST LEGO League natjecanja u Hrvatskoj je Hrvatski robotički savez, a natjecanje se provodi u suradnji s partnerima iz Slovenije Zavod Super Glavce, koji su nositelji licence za našu regiju.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2026-02-10'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a1.id, tagId: tagNatjecanja.id },
    ],
  })

  // [2/69] science-comes-to-town
  const a2 = await prisma.article.create({
    data: {
      slug: 'science-comes-to-town',
      title: `Udruga Inovatic partner u europskom projektu “Science Comes to Town”`,
      excerpt: `Udruga za robotiku Inovatic s ponosom sudjeluje kao pridruženi partner Gradu Splitu u međunarodnom, EU-financiranom projektu Science Comes to Town, koji je službeno otvoren 20. siječnja 2026. godine u Hrvatskom domu u Splitu.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Udruga za robotiku `, styles: {} },
            { type: 'text', text: `Inovatic`, styles: {'bold': true} },
            { type: 'text', text: ` s ponosom sudjeluje kao pridruženi partner `, styles: {} },
            { type: 'text', text: `Gradu Splitu`, styles: {'bold': true} },
            { type: 'text', text: ` u međunarodnom, EU-financiranom projektu `, styles: {} },
            { type: 'text', text: `Science Comes to Town`, styles: {'bold': true} },
            { type: 'text', text: `, koji je `, styles: {} },
            { type: 'text', text: `s`, styles: {'bold': true} },
            { type: 'text', text: `lužbeno otvoren `, styles: {} },
            { type: 'text', text: `20. siječnja 2026.`, styles: {'bold': true} },
            { type: 'text', text: ` godine u Hrvatskom domu u Splitu. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekt ima za cilj približiti znanost građanima svih generacija kroz javna događanja, obrazovne programe i interaktivne sadržaje, pretvarajući gradove u otvorene prostore znanja, inovacija i dijaloga.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekt `, styles: {} },
            { type: 'text', text: `Science Comes to Town`, styles: {'italic': true} },
            { type: 'text', text: ` povezuje gradove i regije `, styles: {} },
            { type: 'text', text: `Split, Kiel i Brest`, styles: {'bold': true} },
            { type: 'text', text: `, kao i mrežu od više od `, styles: {} },
            { type: 'text', text: `70 europskih institucija`, styles: {'bold': true} },
            { type: 'text', text: `, čime se jača uloga gradova kao ključnih mjesta za razmjenu znanja, poticanje inovacija i aktivno sudjelovanje građana u znanstvenim i društvenim procesima. Tijekom trajanja projekta planirana je organizacija čak `, styles: {} },
            { type: 'text', text: `1.000 znanstvenih i edukativnih događanja`, styles: {'bold': true} },
            { type: 'text', text: `, dostupnih široj javnosti.`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Svečano otvorenje i interaktivna izložba u srcu Splita`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Svečano otvorenje projekta održano je`, styles: {} },
            { type: 'text', text: ` 20. siječnja u Hrvatskom domu, nakon čega se program nastavio otvorenjem interaktivne izložbe u Dioklecijanovim podrumima. `, styles: {'bold': true} },
            { type: 'text', text: `Izložba je bila otvorena za građane od `, styles: {} },
            { type: 'text', text: `20. do 24. siječnja 2026.`, styles: {'bold': true} },
            { type: 'text', text: `, a privukla je velik broj posjetitelja svih uzrasta, nudeći jedinstvenu priliku za izravan susret sa znanošću kroz izložbene i interaktivne sadržaje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Udruga Inovatic je, zajedno s ostalim partnerima projekta, aktivno sudjelovala tijekom svih dana trajanja izložbe, gdje smo na vlastitom štandu prezentirali različite robotske modele i tehnologije. Posjetitelji su imali priliku upoznati se s osnovama robotike, vidjeti robote u radu te razgovarati s članovima Udruge o primjeni robotike u obrazovanju i svakodnevnom životu.`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Značaj projekta za Split i lokalnu zajednicu`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Split je ovim projektom potvrđen kao jedan od `, styles: {} },
            { type: 'text', text: `europskih gradova znanosti i inovacija`, styles: {'bold': true} },
            { type: 'text', text: `, s posebnim naglaskom na teme mora, vode, kulturne i prirodne baštine, ali i budućnosti znanosti kroz uključivanje djece i mladih. Projekt snažno promiče `, styles: {} },
            { type: 'text', text: `znanstvenu pismenost, kritičko razmišljanje i borbu protiv dezinformacija`, styles: {'bold': true} },
            { type: 'text', text: `, približavajući znanost svakodnevnom životu građana.`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Uloga Udruge Inovatic u projektu`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kao partner u projektu, Udruga za robotiku Inovatic aktivno doprinosi ostvarivanju ciljeva projekta kroz razvoj i provedbu znanstveno-edukativnih aktivnosti iz područja robotike, tehnologije i STEM-a, s posebnim fokusom na djecu i mlade.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U okviru projekta `, styles: {} },
            { type: 'text', text: `Science Comes to Town`, styles: {'italic': true} },
            { type: 'text', text: `, Udruga Inovatic će organizirati:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `izvanškolske radionice robotike za predškolce i osnovnoškolce`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `radionice robotike u sklopu Festivala znanosti i drugih javnih događanja`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `radionice i edukativne kampove tijekom školskih praznika`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `interaktivne aktivnosti kojima se potiču kreativnost, logičko razmišljanje i interes za znanost i tehnologiju`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cilj ovih aktivnosti je omogućiti djeci i mladima `, styles: {} },
            { type: 'text', text: `rani i pozitivan susret s robotikom i znanošću`, styles: {'bold': true} },
            { type: 'text', text: `, razvijati njihove vještine i pokazati da su znanost i tehnologija dostupne, razumljive i zabavne.`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Pogled u budućnost`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Provedba projekta `, styles: {} },
            { type: 'text', text: `Science Comes to Town`, styles: {'italic': true} },
            { type: 'text', text: ` traje godinu dana, uz ukupni proračun od šest milijuna eura, a očekuje se da će ostaviti dugoročan pozitivan utjecaj na lokalnu zajednicu, obrazovni sustav i povezivanje znanstvene zajednice s građanima.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Udruga Inovatic veseli se nastavku aktivnosti u sklopu projekta te poziva djecu, roditelje, odgojno-obrazovne djelatnike i sve zainteresirane građane da prate naše mrežne stranice i društvene mreže, gdje ćemo redovito objavljivati informacije o nadolazećim radionicama i događanjima.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Zajedno gradimo Split kao grad u kojem znanost i robotika dolaze među ljude.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Više o projektu možete vidjeti na mrežnim stranicama projekta: `, styles: {} },
            { type: 'link', href: `https://sciencecomestotown.eu/hr`, content: [{ type: 'text', text: `Science comes to town`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija sa otvaranja:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2026-01-27'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a2.id, tagId: tagEuProjekt.id },
    ],
  })

  // [3/69] odrzane-zimske-radionice-robotike-2026
  const a3 = await prisma.article.create({
    data: {
      slug: 'odrzane-zimske-radionice-robotike-2026',
      title: `Održane Zimske radionice robotike 2026.`,
      excerpt: `Uspješno smo proveli Zimske radionice LEGO robotike u razdoblju 7. – 9. siječnja 2026. Na radionicama je sudjelovalo ukupno dvadeset polaznika uzrasta 6 – 14 godina.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Uspješno smo proveli Zimske radionice LEGO robotike u razdoblju 7. – 9. siječnja 2026. Na radionicama je sudjelovalo ukupno dvadeset polaznika uzrasta 6 – 14 godina. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Tijekom tri dana naši polaznici su radeći u paru zajedno izgradili i programirali `, styles: {} },
            { type: 'text', text: `saonice Djeda Mraza`, styles: {'bold': true} },
            { type: 'text', text: ` za`, styles: {} },
            { type: 'text', text: ` samostalno `, styles: {'bold': true} },
            { type: 'text', text: `gibanje po zadanoj stazi.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na kraju radionica svi polaznici su dobili `, styles: {} },
            { type: 'text', text: `diplomu`, styles: {'bold': true} },
            { type: 'text', text: `, a sa sobom ponijeli nova znanja, iskustva i puno zimskih uspomena.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Treneri na zimskim radionica bili su: Bruno Bešlić, Vito Drnjević i Ivano Tabak.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2026-01-13'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656871/articles/covers/odrzane-zimske-radionice-robotike-2026.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a3.id, tagId: tagRadionice.id },
      { articleId: a3.id, tagId: tagRezultati.id },
    ],
  })

  // [4/69] splitska-udruga-inovatic-osvojila-srebro-na-svjetskom-finalu-robotike-u-singapuru
  const a4 = await prisma.article.create({
    data: {
      slug: 'splitska-udruga-inovatic-osvojila-srebro-na-svjetskom-finalu-robotike-u-singapuru',
      title: `Udruga Inovatic osvojila srebro na svjetskom finalu robotike u Singapuru!`,
      excerpt: `Sa ponosom objavljujemo da je naš CroSpec tim osvojio srebrnu medalju na World Robot Olympiad™ INTERNATIONAL FINAL 2025, najvećem svjetskom natjecanju u robotici, održanom od 26. do 28. studenoga 2025. u Marina Bay Sands, Singapur.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sa ponosom objavljujemo da je naš `, styles: {} },
            { type: 'text', text: `CroSpec tim`, styles: {'bold': true} },
            { type: 'text', text: ` osvojio `, styles: {} },
            { type: 'text', text: `srebrnu medalju`, styles: {'bold': true} },
            { type: 'text', text: ` na `, styles: {} },
            { type: 'text', text: `World Robot Olympiad™ INTERNATIONAL FINAL 2025`, styles: {'bold': true} },
            { type: 'text', text: `, najvećem svjetskom natjecanju u robotici, održanom od `, styles: {} },
            { type: 'text', text: `26. do 28. studenoga 2025.`, styles: {'bold': true} },
            { type: 'text', text: ` u `, styles: {} },
            { type: 'text', text: `Marina Bay Sands, Singapur.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naš CroSpec tim su činili natjecatelji `, styles: {} },
            { type: 'text', text: `Ivano Tabak`, styles: {'bold': true} },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'text', text: `Mihovil Letina`, styles: {'bold': true} },
            { type: 'text', text: `, uz mentorstvo profesora `, styles: {} },
            { type: 'text', text: `Joze Pivca`, styles: {'bold': true} },
            { type: 'text', text: `, koji su u iznimno zahtjevnoj kategoriji `, styles: {} },
            { type: 'text', text: `Robo Mission (seniori)`, styles: {'bold': true} },
            { type: 'text', text: ` ostvarili srebrno mjesto `, styles: {} },
            { type: 'text', text: `među 95 svjetskih ekipa u svojoj kategoriji`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovogodišnje izdanje WRO-a, pod temom `, styles: {} },
            { type: 'text', text: `“The Future of Robots”,`, styles: {'bold': true} },
            { type: 'text', text: ` okupilo je više od `, styles: {} },
            { type: 'text', text: `600 timova`, styles: {'bold': true} },
            { type: 'text', text: ` unutar svih kategorija, čime je još jednom potvrđen status WRO-a kao `, styles: {} },
            { type: 'text', text: `najvećeg i najmasovnijeg globalnog natjecanja u robotici i STEM edukaciji.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naš tim se natjecao u `, styles: {} },
            { type: 'text', text: `WRO RoboMission kategoriji u seniorskoj dobnoj skupine (15-19 g.)`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
            { type: 'text', text: `U sklopu ove kategorije timovi imaju zadatak dizajnirati i programirati robota koji se samostalno giba na stazi i rješava za to predviđene zadatke. Staza je zapravo poligon sa različitim bazama koje robot treba u zadanom vremenu izvršiti i na takav način skuplja potrebne bodove. Baze su sačinjene od složenih konstrukcijskih elemenata koje zahtijevaju od robota specifične mehaničke radnje kako bi ih uspješno savladao. Roboti su u potpunosti autonomni te imaju zadatak u što kraćem vremenu na stazi što više baza osvojiti.`, styles: {} },
            { type: 'text', text: `Za svaku dobnu skupinu natjecatelja svake godine je nova robotska staza koja bude poznata natjecateljima prva dva dana natjecanja, dok treći dan natjecanja bude potpuno nepoznata staza i koje je pravilo iznenađenja čime se natjecanju dodaje jedan novi element. Dodatni izazov služi kako test kreativnosti i sposobnosti brzog razmišljanja timova koji sudjeluju na nacionalnim i međunarodnim natjecanjima.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sudjelovanje na ovako prestižnom natjecanju i postizanje srebrne medalje ne bi bili mogući bez podrške naših partnera i institucija koje prepoznaju važnost STEM obrazovanja. `, styles: {} },
            { type: 'text', text: `Zahvaljujemo `, styles: {} },
            { type: 'text', text: `Splitsko-dalmatinskoj županiji`, styles: {'bold': true} },
            { type: 'text', text: ` i kompaniji `, styles: {} },
            { type: 'text', text: `Pevex d.o.o.`, styles: {'bold': true} },
            { type: 'text', text: `, čija je potpora bila ključna u omogućavanju puta i priprema našeg tima, kao i svima ostalima koji su poduprli rad Udruge Inovatic.`, styles: {} },
            { type: 'text', text: `Posebno cijenimo i suradnju s našim partnerskim organizacijama: `, styles: {} },
            { type: 'text', text: `Prirodoslovno-matematičkim fakultetom u Splitu (PMF-Split)`, styles: {'bold': true} },
            { type: 'text', text: `, s kojim njegujemo sporazumnu suradnju na edukacijskim i STEM projektima, `, styles: {} },
            { type: 'text', text: `Zajednicom tehničke kulture grada Splita (ZTK-Split)`, styles: {'bold': true} },
            { type: 'text', text: `, unutar koje djelujemo kao članica i kroz koju provodimo dio naših aktivnosti, te `, styles: {} },
            { type: 'text', text: `Hrvatskim robotičkim savezom (HROBOS)`, styles: {'bold': true} },
            { type: 'text', text: `, s kojim surađujemo u okviru brojnih natjecanja i programa sufinanciranja. Njihova dugoročna i sadržajna podrška značajno doprinosi razvoju naših inicijativa i uspjesima mladih inovatora.`, styles: {} },
            { type: 'text', text: `Također zahvaljujemo `, styles: {} },
            { type: 'text', text: `medijima koji su pratili naš rad i redovito izvještavali o postignućima CroSpec tima`, styles: {'bold': true} },
            { type: 'text', text: `, čime značajno doprinose vidljivosti STEM aktivnosti u Hrvatskoj.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovaj uspjeh snažan je poticaj razvoju hrvatske robotike i potvrda da naši mladi stručnjaci mogu konkurirati samom svjetskom vrhu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Vjerujemo da je naša priča inspiracija i za mlade koji razmišljaju o karijeri u STEM području, i za institucije, partnere i sponzore koji žele podržati napredak i obrazovanje mladih u tehnološkim disciplinama. Budući razvoj CroSpec tima i Udruga Inovatic planiramo proširiti kroz daljnje projekte i natjecanja te ovim putem upućujemo poziv za medijsku, institucionalnu i poslovnu suradnju i podršku.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2026-01-13'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a4.id, tagId: tagNatjecanja.id },
      { articleId: a4.id, tagId: tagRezultati.id },
    ],
  })

  // [5/69] zimske-radionice-2026
  const a5 = await prisma.article.create({
    data: {
      slug: 'zimske-radionice-2026',
      title: `Zimske radionice LEGO robotike: Saonice Djeda Mraza`,
      excerpt: `Prijavite djecu na zimske robotičke radionice od 7. do 9. siječnja 2026. Cijena 60 € za trodnevni ciklus. Lokacija: Velebitska 32, Split.`,
      content: [
        p(tx('Pripremite se za pravu zimsku LEGO avanturu! Tijekom tri dana naši mali robotičari uronit će u čarobni svijet LEGO robotike i zajedno izgraditi '), bx('saonice Djeda Mraza'), tx(' koje se naravno mogu '), bx('programirati i samostalno kretati'), tx('.')),
        h2('Kada?'),
        li(bx('1. termin:'), tx(' 07.01. – 09.01. 09:00 – 11:00')),
        li(bx('2. termin:'), tx(' 07.01. – 09.01. 17:00 – 19:00')),
        h2('Gdje?'),
        p(tx('Velebitska 32, Split')),
        p(tx('Djeca u dobi od 6 do 14 godina, podijeljeni u grupe mlađih i starijih.')),
        h2('Cijena?'),
        p(tx('Kotizacija za ciklus od tri radionice iznosi '), bx('60 EUR'), tx('. Popust od 10% ostvaruje se na drugo dijete iz iste obitelji. Popust od 10% ostvaruje se ukoliko dijete pohađa naše cjelogodišnje programe.')),
        h2('Što nas očekuje po danima?'),
        li(bx('1. dan'), tx(' – upoznajemo projektni zadatak i započinjemo slaganje saonica Djeda Mraza. Djeca će razvijati kreativnost, timski rad i prve konstrukcijske vještine.')),
        li(bx('2. dan'), tx(' – dovršavamo i nadograđujemo saonice te učimo '), bx('osnove programiranja'), tx(' kako bi saonice mogle izvršavati jednostavne naredbe.')),
        li(bx('3. dan'), tx(' – vrijeme je za pravi izazov! Programiramo saonice za '), bx('samostalno kretanje po snježnoj stazi'), tx(' i testiramo što smo naučili.')),
        video('https://res.cloudinary.com/dgc2tp4f8/video/upload/v1773657887/articles/inline/zimske-radionice-2026/saonice-2026.mp4'),
        p(tx('Radionice su prilagođene '), bx('početnicima'), tx(', a naši iskusni robo treneri vode polaznike korak po korak kroz konstrukciju, mehaniku i programiranje. Djeca rade u '), bx('paru'), tx(', koristeći LEGO edukacijske setove i laptope, u poticajnom i zabavnom okruženju.')),
        p(tx('Na kraju radionica svi polaznici dobivaju '), bx('diplomu'), tx(', a sa sobom nose nova znanja, iskustva i puno zimskih uspomena.')),
        p(tx('Ne propustite priliku da zimske praznike pretvorite u spoj igre, učenja i tehnologije! Broj mjesta je ograničen – '), bx('prijavite se na vrijeme'), tx(' i osigurajte svoje mjesto u LEGO zimskom svijetu!')),
        h2('Prijava'),
        p(tx('Za prijavu posjetite našu '), bx('stranicu za upise'), tx(' ili nas kontaktirajte na info@udruga-inovatic.hr / 0993936993.')),
        h2('Napomena'),
        p(tx('Prilikom prijave potrebno je uplatiti cjelokupan iznos kotizacije. Uplata: UDRUGA ZA ROBOTIKU "INOVATIC", IBAN: '), bx('HR7223400091110811408'), tx(', Iznos: 60 EUR, Model: 00, Poziv na broj: datum uplate (DDMMGGG), Opis: Kotizacija za zimske radionice na ime i prezime djeteta.')),
        p(tx('*u slučaju ne izvršenja uplate prijava se automatski '), bx('BRIŠE'), tx('. **u slučaju odustajanja ne vraćamo uplatu.')),
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2025-12-18'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656913/articles/covers/zimske-radionice-2026.png',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a5.id, tagId: tagRadionice.id },
      { articleId: a5.id, tagId: tagObavijesti.id },
    ],
  })

  // [6/69] donacija-singapur
  const a6 = await prisma.article.create({
    data: {
      slug: 'donacija-singapur',
      title: `Podržite naš CroSpec tim na svjetskom natjecanju u Singapuru!`,
      excerpt: `Tim CroSpec izborili su plasman na WRO finale 2025. u Singapuru (26.–28. studenog). Pozivamo sve koji žele podržati naše mlade robotičare na putu prema svjetskom zlatu.`,
      content: [
        p(tx('Ovim putem pozivamo sve ljubitelje robotike, tehnologije i rada Udruge Inovatic da podrže naš tim '), bx('CroSpec'), tx(' i pomognu im da dostojno predstavljaju Hrvatsku na svjetskoj pozornici robotičkog natjecanja World robot olympiad (WRO), koje se održava '), bx('26.-28. studenog 2025. u Singapuru'), tx('. Više o natjecanju možete pogledati na službenim stranicama organizatora natjecanja.')),
        img('https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657862/articles/inline/donacija-singapur/QR-singapur.jpg', 280),
        p(tx('Put do Singapura ovisi o financijskoj podršci svih vas koji vjerujete u mlade inovatore. Svaka donacija, bez obzira na iznos, pomaže da CroSpec tim predstavlja Hrvatsku u najboljem svjetlu. Donirati možete skeniranjem koda ili uplatom na račun Udruge Inovatic: '), bx('HR7223400091110811408'), tx(' (opis plaćanja: Za put u Singapur).')),
        h2('Upoznajte naš CroSpec tim!'),
        img('https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657862/articles/inline/donacija-singapur/Ivano-Tabak.jpg', 300),
        p(tx('Ivano Tabak, maturant Elektrotehničke škole Split, jedan je od članova ekipe CroSpec, koja je postala prvak Hrvatske u robotici i osigurala plasman na svjetsko WRO finale u Singapuru! Ivano je već deset godina u udruzi Inovatic i od malena strastveno spaja matematiku, informatiku i programiranje. Sudjelovao je na brojnim natjecanjima – od FLL-a i Robokupa do MAT lige i Ideje godine – a ovo mu je dosad najveći uspjeh. Osim robotike i natjecanja koja ga pokreću, Ivano voli košarku i matematička natjecanja. Budućnost vidi u programiranju ili matematici – možda na FER-u, FESB-u ili PMF-u. Njegova poruka mladima koje zanima robotika: „Pokušajte – nemate što izgubiti, a samo možete napredovati!"')),
        img('https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657862/articles/inline/donacija-singapur/Mihovil-Letina.jpg', 300),
        p(tx('Mihovil Letina, učenik 2. razreda Tehničke škole za strojarstvo i mehatroniku Split, zajedno s Ivanom čini ekipu CroSpec – prvake Hrvatske i finaliste svjetskog WRO natjecanja u Singapuru! U robotici je već devet godina, a natjecanja su ono što ga najviše veseli jer ga stalno potiču da bude inovativan. Dvaput je osvajao drugo mjesto na državnoj razini Robokupa, sudjelovao u FLL-u i WRO-u, a plasman na svjetsko finale najveći mu je trenutak do sada. Vjeruje da će mu robotika otvoriti vrata budućnosti jer svijet ide prema automatizaciji – a on je spreman biti dio toga. Njegova poruka mladima: „Ako vas zanima robotika – probajte, a ako se pronađete u tome – ustrajte!"')),
        img('https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657862/articles/inline/donacija-singapur/jozo-pivac.jpg', 300),
        p(tx('Jozo Pivac, mentor i voditelj aktivnosti u Udruzi za robotiku "Inovatic" te ujedno i predsjednik udruge. Kao mentor sudjelovao na brojnim županijskim, državnim i međunarodnim natjecanjima te osvojio niz priznanja i nagrada. Dobitnik je Godišnje nagrade Hrvatske zajednice tehničke kulture (HZTK) za 2024. g., za ostvarene iznimne rezultate u radu s djecom i mladima u izvanškolskim aktivnostima. Aktivno sudjeluje u znanstvenim istraživanjima na poslijediplomskom znanstvenom studiju Istraživanje u edukaciji u području prirodnih i tehničkih znanosti na Prirodoslovno-matematičkom fakultetu Sveučilišta u Splitu, s nizom objavljenih stručnih i znanstvenih radova. Kao tajnik splitskog Društva pedagoga tehničke kulture te aktivnim članstvom u upravnim odborima Zajednice za tehničku kulturu grada Splita (ZTK Split) i Hrvatskog robotičkog saveza (HROBOS), doprinosi razvoju tehničke kulture i STEM edukacije u Hrvatskoj. Vodio je projekt Bilo kuda STEM svuda sufinanciran iz europskog socijalnog fonda i razvio inovativne projekte poput Robotičko simulacijske lige – ROSIL. Njegova posvećenost i stručnost čine ga jednim od vodećih stručnjaka u ovom području.')),
        p(tx('Hvala vam što podržavate naš rad i vjerujete u znanje naših mladih!')),
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2025-10-17'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a6.id, tagId: tagNatjecanja.id },
      { articleId: a6.id, tagId: tagObavijesti.id },
    ],
  })

  // [7/69] zavrsetak-cjelogodisnje-aktivnosti-2024-2025
  const a7 = await prisma.article.create({
    data: {
      slug: 'zavrsetak-cjelogodisnje-aktivnosti-2024-2025',
      title: `Završetak cjelogodišnje aktivnosti “Svijet LEGO robotike” u 2024./2025.`,
      excerpt: `Naši mladi polaznici su uspješno završili cjelogodišnju aktivnost “Svijet LEGO robotike”, koju već petu godinu provodimo na našoj lokaciji Velebitska 32, Split. Na oduševljenje svih naših polaznika, naš kurikulum “Svijet LEGO robotike” pružio je našim polaznicima bogatstvo sadržaja i kreativnim L...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naši mladi polaznici su uspješno završili cjelogodišnju aktivnost  “Svijet LEGO robotike”, koju već petu godinu provodimo na našoj lokaciji `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+izdvojena+jedinica/@43.5117989,16.453936,14.46z/data=!4m9!1m2!2m1!1svelebitska+32+udruga+inovatic!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32, Split`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na oduševljenje svih naših polaznika, naš kurikulum “Svijet LEGO robotike” pružio je našim polaznicima bogatstvo sadržaja i kreativnim LEGO projekata, gdje polaznici na zabavan način prakticiraju korisna znanja i vještina u području prirodnih i tehničkih znanosti.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Veliko nam je zadovoljstvo da smo i ove godine imali veliki broj polaznika koji su uspješno završili program te na kraju zasluženo dobili svoje diplomice.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Čestitamo svim našim polaznicima koji su vrijedno i marljivo radili ovu godinu te se veselimo novoj školskoj godini za koju se već sad možete predbilježiti za `, styles: {} },
            { type: 'link', href: `https://udruga-inovatic.hr/prijave/`, content: [{ type: 'text', text: `ogledne radionice`, styles: {} }] },
            { type: 'text', text: ` u rujnu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Također, veliko hvala svim našim vrijednim robo trenerima na posvećenom i predanom radu u ovoj školskoj godini: Bruno Bešlić, Josip Stepinac, Ivan Stepinac, Duje Topić i Vito Drnjević.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2025-06-05'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656903/articles/covers/zavrsetak-cjelogodisnje-aktivnosti-2024-2025.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a7.id, tagId: tagRezultati.id },
    ],
  })

  // [8/69] ljetne-radionice-2025
  const a8 = await prisma.article.create({
    data: {
      slug: 'ljetne-radionice-2025',
      title: `Ljetni kamp LEGO robotike 2025.`,
      excerpt: `Pozivamo vas na naše ljetne kampove LEGO robotike!I ovo ljeto smo za vas pripremili aktivnosti sa puno zabave i edukacije. Ako volite stjecati nova znanja učeći kroz igru i zabavu onda su naši ljetni kampovi pravo mjesto za vas.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pozivamo vas na naše ljetne kampove LEGO robotike!`, styles: {} },
            { type: 'text', text: `I ovo ljeto smo za vas pripremili aktivnosti sa puno zabave i edukacije. Ako volite stjecati nova znanja učeći kroz igru i zabavu onda su naši ljetni kampovi pravo mjesto za vas. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kada:`, styles: {'bold': true} },
            { type: 'text', text: `1. ciklus`, styles: {'bold': true} },
            { type: 'text', text: `: 30.6.-3.7., 09:00 – 13:00.`, styles: {} },
            { type: 'text', text: `2. ciklus`, styles: {'bold': true} },
            { type: 'text', text: `: 7.7.-10.7., 09:00 – 13:00.`, styles: {} },
            { type: 'text', text: `3. ciklus`, styles: {'bold': true} },
            { type: 'text', text: `: 11.8.-14.8., 09:00 – 13:00.`, styles: {} },
            { type: 'text', text: `4. ciklus`, styles: {'bold': true} },
            { type: 'text', text: `: 18.8.-21.8., 09:00 – 13:00.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Gdje`, styles: {'bold': true} },
            { type: 'text', text: `:  `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+izdvojena+jedinica/@43.5117989,16.453936,14.46z/data=!4m9!1m2!2m1!1svelebitska+32+udruga+inovatic!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32`, styles: {} }] },
            { type: 'text', text: `, Split.`, styles: {} },
            { type: 'text', text: `Tko`, styles: {'bold': true} },
            { type: 'text', text: `: Djeca u dobi od 6 do 14 godina, podijeljeni u grupe mlađih i starijih.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cijena za svaki ciklus radionica iznosi `, styles: {} },
            { type: 'text', text: `120 EUR`, styles: {'bold': true} },
            { type: 'text', text: `. Popust od 10% ostvaruje se na drugo dijete iz iste obitelji. Popust od 15% ostvaruje se ukoliko dijete pohađa naše cjelogodišnje programe.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Raspored aktivnosti po danima:`, styles: {'bold': true} },
            { type: 'text', text: `9:00-9:15, uvodni dio u projektni zadatak.`, styles: {} },
            { type: 'text', text: `9:15-10:30, slaganje projekta i nadogradnja inovacijama.`, styles: {} },
            { type: 'text', text: `10:30-11:00, pauza za užinu.`, styles: {} },
            { type: 'text', text: `11:00-12:30, programiranje projekta, testiranje i zabava (natjecanje).`, styles: {} },
            { type: 'text', text: `12:30-13:00, rastavljanje projekata, pospremanje i odlazak. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Polaznici naših kampova ne trebaju imati određeno predznanje jer će ih iskusni robo treneri voditi kroz svijet LEGO robotike. LEGO projekti koji će se koristit na radionicama obuhvaćaju osnovno i napredno znanje iz konstrukcije, mehanike i programiranja. Unutar svakog ciklusa kampova planirano je pet projekata prilagođenih različitom uzrastu polaznika. Projekti su jednaki unutar svih ciklusa. Na radionicama polaznici rade zajedno u paru koristeći laptope i LEGO edukacijske setove: Lego WeDo 2.0 i Lego Spike Prime.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sve polaznike osiguravamo diplome te svakodnevno užinu i osvježavajuće napitke.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ne propustite ovu odličnu priliku da vaše ljeto učinite zabavnim! Broj polaznika je ograničen po grupi, stoga se prijavite već danas!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kontaktirajte nas: info@udruga-inovatic.hr / 0993936993`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijava:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `NAPOMENA:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kako bi potvrdili svoju prijavu u roku od 3 dana molimo da uplatite akontaciju u iznosu od 30,00 eura po djetetu za odabrani ciklus.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Uplatu izvršiti na sljedeći način:`, styles: {} },
            { type: 'text', text: `Primatelj:`, styles: {} },
            { type: 'text', text: `UDRUGA ZA ROBOTIKU “INOVATIC”`, styles: {} },
            { type: 'text', text: `IBAN: HR7223400091110811408`, styles: {} },
            { type: 'text', text: `Model: 00`, styles: {} },
            { type: 'text', text: `Poziv na broj: datum uplate (DDMMGGG)`, styles: {} },
            { type: 'text', text: `Opis plaćanja: Rezervacija za Ljetni kamp na ime i prezime djeteta.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `*u slučaju ne izvršenja uplate akontacije u roku 3 radna dana prijava se automatski`, styles: {} },
            { type: 'text', text: ` BRIŠE`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
            { type: 'text', text: `*`, styles: {'bold': true} },
            { type: 'text', text: `u slučaju odustajanja ne vraćamo uplaćenu akontaciju.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekti 1. i 2. ciklusa 2025:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Najava projekata 3. i 4. ciklusa 2025:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'video',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/video/upload/v1773657927/articles/inline/ljetne-radionice-2025/Video-projekata_Ljetne-2025.mp4`,
          },
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija 1. ciklusa 2025.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija 2. ciklusa 2025.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija 3. ciklusa 2025.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija 4. ciklusa 2025.`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2025-05-04'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a8.id, tagId: tagRadionice.id },
    ],
  })

  // [9/69] zavrsetak-slr-2023-2024
  const a9 = await prisma.article.create({
    data: {
      slug: 'zavrsetak-slr-2023-2024',
      title: `Završetak programa Svijet lego robotike u 2023./2024.`,
      excerpt: `Sa datumom 1. lipnja 2024. završili smo uspješno cjelogodišnji program Svijet lego robotike, kojeg već drugu godinu provodimo na našoj lokaciji Velebitska 32, Split.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sa datumom 1. lipnja 2024.  završili smo uspješno cjelogodišnji program Svijet lego robotike, kojeg već drugu godinu provodimo na našoj lokaciji `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+izdvojena+jedinica/@43.5117989,16.453936,14.46z/data=!4m9!1m2!2m1!1svelebitska+32+udruga+inovatic!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32, Split`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Veliko nam je zadovoljstvo da smo i ove godine imali veliki broj polaznika koji su uspješno završili program te na kraju zasluženo dobili svoje diplomice.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naš kurikulum Svijet lego robotike razrađen kroz četiri stupnja vodi naše polaznike kroz pravu lego pustolovinu, bogatu raznovrsnim cjelinama unutar kojih se nalaze različiti lego projekti od kojih zastaje dah. `, styles: {} },
            { type: 'text', text: `Na zabavan način polaznici našeg lego kurikuluma usvajaju i razvijaju različita znanja i vještina posebno u području prirodnih i tehničkih znanosti.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Čestitamo svim našim polaznicima koji su vrijedno i marljivo radili ovu godinu te se veselimo novoj školskoj godini za koju se već sad možete predbilježiti za `, styles: {} },
            { type: 'link', href: `https://udruga-inovatic.hr/prijave/`, content: [{ type: 'text', text: `ogledne radionice`, styles: {} }] },
            { type: 'text', text: ` u rujnu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Hvala svim našim vrijednim robo trenerima na posvećenom i predanom radu u ovoj školskoj godini: Bruno Bešlić, Marta Vukić, Duje Topić, Ivan Stepinac, Vito Drnjević i Jozo Pivac.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija:`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2024-06-04'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656909/articles/covers/zavrsetak-slr-2023-2024.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a9.id, tagId: tagRezultati.id },
    ],
  })

  // [10/69] zimska-skola-2024
  const a10 = await prisma.article.create({
    data: {
      slug: 'zimska-skola-2024',
      title: `Zimska škola robotike 2024.`,
      excerpt: `Za vrijeme zimskih praznika provodimo zimske radionice robotike za sve zainteresirane uzrasta 6-14 godina.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za vrijeme zimskih praznika provodimo zimske radionice robotike za sve zainteresirane uzrasta 6-14 godina.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Zimska škola uključuje pet dana radionica u razdoblju: 19. – 23. veljače 2024.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Program radionica je podijeljen u dvije dobne skupine:`, styles: {} },
            { type: 'text', text: `– mlađi uzrast djece: 6-9 godina, termin grupe 9:00-12:00`, styles: {} },
            { type: 'text', text: `– stariji uzrast djece: 10-15 godina, termin grupe 9:00-12:00`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na zimskim radionicama polaznici će samostalno izrađivati lego projekte koji će predstavljati određene pametne sustave iz područja zabave, industrije i prometa. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sudjelovanje na radionicama nije potrebno predznanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cijena kotizacije za radionice iznosi 130,00 EUR po djetetu. Drugo dijete (brat ili sestra) ostvaruje popust u iznosu od 20 EUR.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice će se održavati na adresi `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+izdvojena+jedinica/@43.5117989,16.453936,14.46z/data=!4m9!1m2!2m1!1svelebitska+32+udruga+inovatic!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32`, styles: {} }] },
            { type: 'text', text: `, Split (Plokite).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Broj mjesta je ograničen unutar grupa stoga se požurite.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sva pitanja stojimo na raspolaganju putem e-pošte: `, styles: {} },
            { type: 'link', href: `mailto:prijave@udruga-inovatic.hr`, content: [{ type: 'text', text: `prijave@udruga-inovatic.hr`, styles: {} }] },
            { type: 'text', text: ` ili kontakt telefona: 0993936993.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Program radionica:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu podnosi isključivo roditelj/skrbnik maloljetnog polaznika:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2024-02-11'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656910/articles/covers/zimska-skola-2024.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a10.id, tagId: tagRadionice.id },
    ],
  })

  // [11/69] upisi-2023-24
  const a11 = await prisma.article.create({
    data: {
      slug: 'upisi-2023-24',
      title: `Otvoreni su upisi za cjelogodišnje programe za 2023./2024.`,
      excerpt: `Otvorili smo upise u cjelogodišnje programe za polaznike uzrasta 6-14 godina za školsku godinu 2023./2024.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Otvorili smo upise u cjelogodišnje programe za polaznike uzrasta 6-14 godina za školsku godinu 2023./2024.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovo nam je sa ponosom  već deveta godina da provodimo ovakve aktivnosti koje za cilj imaju popularizirati robotiku među mladima te ih uvesti u svijet modernih tehnologija gdje robotika zauzima vodeće mjesto.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `S ponosom vam predstavljamo naš jedinstveni kurikulum iz Lego robotike koji smo razvili u suradnji sa Inovatic Edukom, a obuhvaća sljedeće programe: `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/svijet-lego-robotike-1/`, content: [{ type: 'text', text: `SVIJET LEGO ROBOTIKE 1`, styles: {} }] },
            { type: 'text', text: `, `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/svijet-lego-robotike-2/`, content: [{ type: 'text', text: `SVIJET LEGO ROBOTIKE 2`, styles: {} }] },
            { type: 'text', text: `, `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/svijet-lego-robotike-3/`, content: [{ type: 'text', text: `SVIJET LEGO ROBOTIKE 3`, styles: {} }] },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/svijet-lego-robotike-4/`, content: [{ type: 'text', text: `SVIJET LEGO ROBOTIKE 4`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Svi dostupni programi se međusobno nadopunjuju te su prepuni živopisnih LEGO projekata kako biste potpunije razumjeli svijet oko sebe izgradnjom i programiranjem robota.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Također osim kreativnih i zabavnih projekata naši edukacijski programi i metode rada su uvijek usmjerene našim polaznicima, te im pružamo inovativan pristup u načinu rješavanju problema sa sljedećim podržanim značajkama:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `mnoštvo novih kreativnih projekata i digitalnih materijala,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `mogućnost pristupa određenim materijalima od kuće,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `povezivanje robotičkih sadržaja sa ostalim STEAM vještinama i prirodoslovnim znanjem,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `po završetku svake cjeline testiranje kvizovima znanja,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `slanje završnog godišnje izvješća o uspjehu polaznika uključujući sljedeće elemente iz praktičnih i timskih vještina: slaganje, programiranje, inovacije, suradnja, komunikacija i zabava.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Mogućnost svake godine kontinuiranog napredovanja u više programe: Svijet lego robotike 1, Svijet lego robotike 2, Svijet lego robotike 3, Svijet lego robotike 4 te natjecateljske programe`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Više o dostupnim programima možete pogledati u web izborniku `, styles: {} },
            { type: 'text', text: `“`, styles: {'bold': true} },
            { type: 'text', text: `Programi”.`, styles: {} },
            { type: 'text', text: `Za upis u pojedini program potrebno je da polaznik odgovara uzrastu i/ili potrebnom iskustvu za pojedini program. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Planiramo početi sa cjelogodišnjim programima za ovu školsku godinu u listopadu 2023.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pozivamo sve zainteresirane da se ovim putem predbilježe za naše ogledne radionice koje planiramo održati u krajem rujna 2023.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dostupni termini (birate jedan termin):`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Svijet lego robotike 1 (6-8 g.): PON (18:30-20:00), SRI (18:30-20:00), PET (18:30-20:00) ili SUB (11:00-12:30)`, styles: {} },
            { type: 'text', text: `Svijet lego robotike 2 (9-10 g.): PON (19:00 – 20:30), UTO (19:00-20:30) ili SUB (9:00-10:30)`, styles: {} },
            { type: 'text', text: `Svijet lego robotike 3 (11-12 g.): SRI (19:30-21:00), PET (19:30-21:00) ili SUB (11:00-12:30)`, styles: {} },
            { type: 'text', text: `Svijet lego robotike 4 (13-14 g.): Svi termini popunjeni`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `*Molimo da nam u poruci predbilježbe navedete koji termin vam odgovara.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Predbilježbu djeteta za radionice izvršava roditelj/skrbnik preko ispod navedene forme.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Predbilježba`, styles: {'bold': true} },
            { type: 'text', text: `;`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Još malo o našim programima:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na našim radionicama koristimo raznovrsne programe i edukacijske robote koje prilagođavamo učenicima zavisno o dobi, predznanju i interesu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Roboti koji prednjače u našim edukacijama su za mlađi uzrast (6-10 g.): `, styles: {} },
            { type: 'text', text: `Lego WeDo 2.0, `, styles: {'bold': true} },
            { type: 'text', text: `a za stariji uzrast (11-16 g.) koristimo robote:`, styles: {} },
            { type: 'link', href: `https://education.lego.com/en-us/products/lego-education-spike-prime-set/45678/`, content: [{ type: 'text', text: ` Lego Spike Prime`, styles: {} }] },
            { type: 'text', text: ` i`, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/lego-mindstorms-projekti/`, content: [{ type: 'text', text: `Lego Mindstorms Ev3`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naši programi i metode rada prate moderne tehnologije i pristupe u STEM obrazovanju te smo sudjelovanjem na raznima natjecanjima i smotrama postali prepoznatljiva udruga u Hrvatskoj.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naši polaznici na radionicama rade u malim grupama (do osam polaznika), pod stručnim vodstvom predavača i asistenata u nastavi (studenti PMF-a i profesori informatike i tehničke kulture), u moderno opremljenim učionicama sa svim potrebnim uvjetima za kvalitetan rad.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Tijekom cijele godine kontinuirano pratimo i vrednujemo uspjeh i napredak naših polaznika te ih usmjeravamo u naprednije programe zavisno o njihovom području interesa.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Osim cjelogodišnjih radionica gdje djeca svoju maštu i kreativnost pretvaraju u razna tehnička djela orijentirani smo dosta i na pripremu polaznika za sudjelovanje na raznim domaćim i stranim natjecanjima iz robotike. Tako motivirane uspješne polaznike koji su završili program Svijet lego robotike 3 i/ili Svijet lego robotike 4 pripremamo i vodimo na razna natjecanja iz robotike poput; `, styles: {} },
            { type: 'text', text: `Robokup, First Lego League (FLL), World Robot Olympiad i Natjecanje mladih tehničara (NMT).`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovim putem pozivamo sve zainteresirane kojima izazov predstavlja izrađivati i programirati razne projekte u robotici da se prijave putem gornjeg prijavnog obrasca te se predbilježe za mjesto malog robo inženjera u našoj udruzi!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Provedbu ove aktivnosti podržava i sufinancira Hrvatski robotički savez i Grad Split.`, styles: {'italic': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sva dodatna pitanja pišite nam na mail adresu:`, styles: {} },
            { type: 'text', text: ` prijave@udruga-inovatic.hr`, styles: {'bold': true} },
            { type: 'text', text: `  ili nas kontaktirajte na `, styles: {} },
            { type: 'text', text: `099 393 6993`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2023-09-18'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a11.id, tagId: tagObavijesti.id },
    ],
  })

  // [12/69] besplatne-ljetne-radionice-2023-bilo-kuda-stem-svuda
  const a12 = await prisma.article.create({
    data: {
      slug: 'besplatne-ljetne-radionice-2023-bilo-kuda-stem-svuda',
      title: `Besplatne Ljetne radionice 2023. “Bilo kuda STEM svuda”.`,
      excerpt: `U razdoblju 26.6. – 1.7. 2023. provodimo besplatne Ljetne radionice u sklopu EU projekta “Bilo kuda STEM svuda”.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 26.6. – 1.7. 2023. provodimo besplatne Ljetne radionice u sklopu EU projekta “Bilo kuda STEM svuda”.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su namijenjene polaznicima uzrasta 8 – 14 g. koji nisu aktivni članovi naše udruge ili do sada nisu sudjelovali na besplatnim radionicama u sklopu projekta “Bilo kuda STEM svuda”.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice će trajati ukupno dva dana unutar tri ciklusa:`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `ciklus: 26.6. – 27.6. `, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `ciklus: 28.6. – 29.6.`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `ciklus: 30.6. – 1.7.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Termini radionica su kroz jutro (10:00 – 12:00) ili popodne (18:00 – 20:00) – birate jedan od dva ponuđena termina.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Lokacija provedbe radionica su naše učionice na adresi: `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)/@43.5117989,16.453936,14z/data=!4m13!1m6!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!2sUdruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)!8m2!3d43.5164371!4d16.4561446!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32, Split`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U dva dana trajanja radionica polaznici će samostalno složiti i programirati robotsko vozilo za njegov autonoman rad na robotskoj stazi koristeći `, styles: {} },
            { type: 'link', href: `https://www.lego.com/en-us/product/lego-education-spike-prime-set-45678`, content: [{ type: 'text', text: `Lego Spike Prime`, styles: {} }] },
            { type: 'text', text: ` konstrukcijske setove.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Rad je planiran u parovima te je broj mjesta u grupama ograničen na osam polaznika, stoga se požurite prijaviti putem ispod navedene prijavne forme.`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `CIKLUS – grupa jutro: `, styles: {} },
            { type: 'text', text: `popunjeno`, styles: {'bold': true} },
            { type: 'text', text: `             – grupa popodne: `, styles: {} },
            { type: 'text', text: `popunjeno`, styles: {'bold': true} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `CIKLUS – grupa jutro: `, styles: {} },
            { type: 'text', text: `popunjeno`, styles: {'bold': true} },
            { type: 'text', text: `            – grupa popodne: `, styles: {} },
            { type: 'text', text: `popunjeno`, styles: {'bold': true} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `CIKLUS – grupa jutro: `, styles: {} },
            { type: 'text', text: `popunjeno`, styles: {'bold': true} },
            { type: 'text', text: `            – grupa popodne: `, styles: {} },
            { type: 'text', text: `popunjeno`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijave su zatvorene zbog popunjenosti svih grupa.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2023-06-18'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a12.id, tagId: tagRadionice.id },
      { articleId: a12.id, tagId: tagEuProjekt.id },
    ],
  })

  // [13/69] zavrsetak-cjelogodisnjih-radionica-2022-2023
  const a13 = await prisma.article.create({
    data: {
      slug: 'zavrsetak-cjelogodisnjih-radionica-2022-2023',
      title: `Završetak cjelogodišnjih radionica u 2022./2023.`,
      excerpt: `Sa datumom 9. lipnja 2023. smo uspješno završili osmu po redu školsku godinu od kada provedimo cjelogodišnje radionice robotike za učenike 6-18 g.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sa datumom 9. lipnja 2023. smo uspješno završili osmu po redu školsku godinu od kada provedimo cjelogodišnje radionice robotike za učenike 6-18 g. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Veliko nam je zadovoljstvo da iz godine u godinu postajemo sve aktivniji te upisujemo sve više zainteresirane djece u naše cjelogodišnje programe. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Koristeći moderne edukacijske alate i pristup u poučavanju ovu školsku godinu smo proveli uz mnoštvo raznovrsnih programa namijenjenih polaznicima od predškolske pa sve do srednjoškolske dobi. Upravo zbog toga veliki broj naših polaznika godinama zaredom pohađaju naše programe jer im ovakvim pristupom pružamo kontinuirani  rad, te osiguravamo sve potrebne uvjete za napredovanje. Želimo također istaknuti i pohvaliti naše iskusnije polaznike koji već godinama pokazuju izvrsne rezultate na državnim i međunarodnim natjecanjima kao plod dugotrajnog rada. Također nam je veliko zadovoljstvo što su i ove godine neki od naših bivših polaznika bili u ulozi asistenata i mentora u programima što nam je izuzetno zadovoljstvo jer na takav način potičemo stručnu i pedagošku orijentaciju naših istaknutih članova .`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Čestitamo svim našim polaznicima koji su vrijedno i marljivo radili ovu godinu te se veselimo novoj školskoj godini u kojoj ćemo kao i u svakoj do sada pripremiti nova iznenađenja, projekte i natjecanja.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Hvala svim našim vrijednim predavačima, asistentima i volonterima što su posvećeno i predano radili ovu školsku godinu: Slavica Jurčević, Bruno Bešlić, Marta Vukić, Duje Topić, Josip Stepinac, Jozo Pivac, Ivan Stepinac, Mijo Ljubić, Roko Kljaković Gašpić i Vito Drnjević.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Hvala `, styles: {} },
            { type: 'link', href: `https://www.split.hr/`, content: [{ type: 'text', text: `Gradu Splitu`, styles: {} }] },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'link', href: `http://hrobos.hr`, content: [{ type: 'text', text: `HROBOS-u`, styles: {} }] },
            { type: 'text', text: ` koji nas podržavaju i sufinanciraju u dijelu provedbe naših cjelogodišnjih programa.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2023-06-18'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656904/articles/covers/zavrsetak-cjelogodisnjih-radionica-2022-2023.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a13.id, tagId: tagRadionice.id },
      { articleId: a13.id, tagId: tagRezultati.id },
    ],
  })

  // [14/69] robosim
  const a14 = await prisma.article.create({
    data: {
      slug: 'robosim',
      title: `RoboSim liga – “Bilo kuda STEM svuda”`,
      excerpt: `U sklopu projekta „Bilo kuda STEM svuda“, financiranog iz europskog socijalnog fonda, organiziramo online robotičku ligu u simulatoru.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U sklopu projekta „Bilo kuda STEM svuda“, financiranog iz europskog socijalnog fonda, organiziramo online robotičku ligu u simulatoru.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sudjelovati mogu djeca uzrasta `, styles: {} },
            { type: 'text', text: `9-14 godina`, styles: {'bold': true} },
            { type: 'text', text: ` sa prostora Republike Hrvatske, koja nisu aktivni članovi naše udruge te do sada nisu sudjelovali u aktivnostima na projektu „Bilo kuda STEM svuda“`, styles: {} },
            { type: 'text', text: `.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Liga sadrži ukupno`, styles: {} },
            { type: 'text', text: `tri online kola:`, styles: {} },
            { type: 'text', text: `1. kolo: 19.6. – 25.6.`, styles: {} },
            { type: 'text', text: `2. kolo: 26.6. – 2.7.`, styles: {} },
            { type: 'text', text: `3. kolo: 3.7. – 9.7.`, styles: {} },
            { type: 'text', text: `Svi prijavljeni natjecatelji će dobiti pristupne podatke za `, styles: {} },
            { type: 'link', href: `https://www.miranda.software/`, content: [{ type: 'text', text: `Miranda simulator`, styles: {} }] },
            { type: 'text', text: `, te će na takav način moći od doma vježbati i sudjelovati na online natjecateljskim kolima.`, styles: {} },
            { type: 'text', text: `Natjecatelji će unutar kola lige imati razne izazove programiranja robotskog vozila u simulatoru poput: praćenja linije, prepoznavanje određenih boja, zaobilaženje prepreka i sl.`, styles: {} },
            { type: 'text', text: `Programski jezik koji će se koristiti u simulatoru je `, styles: {} },
            { type: 'link', href: `https://scratch.mit.edu/`, content: [{ type: 'text', text: `Scratch`, styles: {} }] },
            { type: 'text', text: `, a koje će se poznatom robotsko vozilo programirati uskoro otkrivamo.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za najuspješnije natjecatelje pripremili smo vrijedne nagrade koje uključuju LEGO i FISCHERTECHNIK atraktivne robotske setove:`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `mjesto: `, styles: {} },
            { type: 'link', href: `https://education.lego.com/en-us/products/lego-education-spike-prime-set/45678`, content: [{ type: 'text', text: `LEGO Education SPIKE Prime set – 45678`, styles: {} }] },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `mjesto: `, styles: {} },
            { type: 'link', href: `https://education.lego.com/en-us/products/lego-mindstorms-education-ev3-core-set/5003400`, content: [{ type: 'text', text: `LEGO Education MINDSTORMS EV3 Core Set`, styles: {} }] },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `mjesto: `, styles: {} },
            { type: 'link', href: `http://www.didacta.hr/index.php?umet=14&amp;jezik=1`, content: [{ type: 'text', text: `ROBOTIC SET micro:bit (micro:bit + board IO F5) `, styles: {} }] },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `mjesto: `, styles: {} },
            { type: 'link', href: `https://www.fischertechnik.de/en/products/toys/advanced/548885-universal-4`, content: [{ type: 'text', text: `Fischer set – 548885 – UNIVERSAL 4`, styles: {} }] },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `mjesto: `, styles: {} },
            { type: 'link', href: `https://www.fischertechnik.de/en/products/toys/advanced/548885-universal-4`, content: [{ type: 'text', text: `Fischer set – 548885 – UNIVERSAL 4`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Robotički simulatori:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Robotički simulatori mogu poslužiti u edukaciji kao digitalni alati koji na realan način oponašaju rad određenog robota ili nekog autonomnog uređaja. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kod izbora simulatora preporučljivo je da simulator na konzistentan i realističan način prikazuje i oponaša rad robota, kako bi učenici mogli primijeniti stečene kompetencije unutar simulatora u stvarnoj praksi. Unutar predmetnih područja informatike, računalstva i tehničke kulture, posebice u temama vezanim za učenje programiranja i robotike, robotski simulatori mogu pozitivno utjecati na motivaciju prilikom učenja jer razne studije ukazuju na to da pomoću robota učenici na brži i zabavniji način uviđaju određenu primjenu programiranja, a samim time pokazuju i uspješnije rezultate. Simulatori također mogu biti od koristi učenicima  unutar predmeta tehničke kulture, posebice u temama gdje se poučava područje robotike, elektrotehnike i elektronike te često u nedostatku potrebnih materijala za provedbu određenih praktičnih vježbi simulatori pružaju učenicima veći izbor sadržaja i dostupnije znanje. Još neke dodatne prednosti učenja na simulatoru su; smanjena potreba za nabavom veće količine robotičke opreme, potrošnih dijelova i skladištenja baterija, zatim pružanje učenicima učenje na daljinu te dostupnost digitalnih alata i znanja 24/7.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Miranda simulator:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Miranda`, styles: {'bold': true} },
            { type: 'text', text: ` je software zamišljen kao simulator za edukacijske potrebe učenika iz robotike. Omogućuje programiranje pomoću programskih jezika `, styles: {} },
            { type: 'text', text: `Scratch`, styles: {'bold': true} },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'text', text: `Python`, styles: {'bold': true} },
            { type: 'text', text: `. Koristi popularne i prepoznatljive modele robota za edukaciju, a `, styles: {} },
            { type: 'text', text: `Premium`, styles: {'italic': true} },
            { type: 'text', text: ` verzija Mirande sadrži mogućnost dodavanja i dijeljenja raznih vježbi i robota među učenicima ili grupama učenika. Sve vaše simulacije i modeli pohranjeni su u „oblaku“. Miranda je dostupna u četiri verzije: `, styles: {} },
            { type: 'text', text: `Personal Edition, One Robot Edition, Standard Edition`, styles: {'italic': true} },
            { type: 'text', text: ` te`, styles: {} },
            { type: 'text', text: ` Premium Edition`, styles: {'italic': true} },
            { type: 'text', text: ` koja pruža mogućnost simuliranja svih modela robota, neograničen broj simulacija, kreiranje vlastitih robota te dijeljenje simulacija.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Udruga Inovatic je sa ponosom službeni partner ovog edukacijskog simulatora te pridonosimo njegovom razvoju. Također razvijamo potrebne edukacijske materijale za potrebe škola i udruga kako bi se lakše snalazili i koristili mogućnosti Mirande.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Više o samom simulatoru, cijeni i karakteristikama pojedinih licenci možete pogledati na službenim stranicama proizvođača:  `, styles: {} },
            { type: 'link', href: `http://www.miranda.software`, content: [{ type: 'text', text: `www.miranda.software`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Neke od značajnih karakteristika Premium verzije ovog simulatora su;`, styles: {'bold': true} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Velik izbor ugrađenih robota (mBot, Lego EV3, Lego Spike, Lego WeDo, Maqueen, Arduino, Codey, Dash, Edison, Thymio, i dr.) te mogućnost dodavanja bilo kojeg 3D modela robota ili stvaranja vlastitog modela robota.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Podržano programiranje u Scrath i Python programskim jezicima.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Veliki izbor ugrađenih staza te mogućnost izrade vlastitih staza po želji.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Neograničeni broj korisničkih računa i administracije istih .`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Administracija i delegiranje računa na razini Učitelj – Učenik.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Pohranjivanje neograničenog broja vježbi u zajednički oblak te mogućnost dijeljenja vježbi.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Stvaranje virtualnih grupa ili razreda.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Pristup simulatoru preko web preglednika ili instalirane aplikacije na računalu ili tabletu.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Pogodnost alata za korištenje u razne svrhe poput pregledavanja i vrednovanja postignuća učenika te razna natjecanja.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Dostupnost alata 24/7.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ako vas zanimaju neke dodatne mogućnosti programiranja robota u Mirandi, pogledajte neke naše edukacijske materijale i videa `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/edison/`, content: [{ type: 'text', text: `OVDJE`, styles: {} }] },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekt sufinanciraju Europska unija iz Europskog socijalnog fonda i Ured za udruge Vlade Republike Hrvatske.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2023-05-15'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a14.id, tagId: tagEuProjekt.id },
    ],
  })

  // [15/69] besplatne-proljetne-radionice-2023
  const a15 = await prisma.article.create({
    data: {
      slug: 'besplatne-proljetne-radionice-2023',
      title: `Besplatne Proljetne radionice 2023. “Bilo kuda STEM svuda”.`,
      excerpt: `U razdoblju 11.4. – 14.4. 2023. provodimo besplatne Proljetne radionice u sklopu esf projekta “Bilo kuda STEM svuda”.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 11.4. – 14.4. 2023. provodimo besplatne Proljetne radionice u sklopu esf projekta “Bilo kuda STEM svuda”.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su namijenjene polaznicima uzrasta 10 – 14 g. koji nisu aktivni članovi naše udruge ili do sada nisu sudjelovali na besplatnim radionicama u sklopu projekta “Bilo kuda STEM svuda”.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice će trajati ukupno dva dana unutar dva ciklusa:`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `ciklus: 11. – 12.4. `, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `ciklus: 13. – 14.4.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Termini radionica su kroz jutro (9:00 – 11:00) ili popodne (17:00 – 19:00) – birate jedan od dva ponuđena termina.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Lokacija provedbe radionica su naše učionice na adresi: `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)/@43.5117989,16.453936,14z/data=!4m13!1m6!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!2sUdruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)!8m2!3d43.5164371!4d16.4561446!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32, Split`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U dva dana trajanja radionica polaznici će samostalno složiti i programirati robotsko vozilo za njegov autonoman rad na robotskoj stazi koristeći `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/lego-mindstorms-projekti/`, content: [{ type: 'text', text: `Lego Mindstorms Ev3`, styles: {} }] },
            { type: 'text', text: ` konstrukcijske setove.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Rad je planiran u parovima te je broj mjesta u grupama ograničen na osam polaznika, stoga se požurite prijaviti putem ispod navedene prijavne forme.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Grupa jutro, 9:00 – 11:00 (1. ciklus) je trenutno popunjena.`, styles: {'bold': true} },
            { type: 'text', text: `U ostalim grupama ima još slobodnih mjesta.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2023-03-08'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656838/articles/covers/besplatne-proljetne-radionice-2023.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a15.id, tagId: tagRadionice.id },
    ],
  })

  // [16/69] prijave-elementarna-robotika
  const a16 = await prisma.article.create({
    data: {
      slug: 'prijave-elementarna-robotika',
      title: `Prijave na ciklus besplatnih višednevne radionice elementarne robotike “Bilo kuda STEM svuda”`,
      excerpt: `Otvorene su prijave za novi besplatan ciklus višednevnih radionica elementarne robotike.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Otvorene su prijave za novi besplatan ciklus višednevnih radionica elementarne robotike. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pravo prijave i sudjelovanja u ovom ciklusu imaju polaznici uzrasta 10 – 14 g. koji nisu aktivni članovi naše udruge i do sada nisu sudjelovali u besplatnim aktivnostima na EU projektu “Bilo kuda STEM svuda”.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Planirano trajanje ciklusa višednevnih radionica je dvanaest sati raspoređenih u šest tjedana. Radionice se održavaju subotama u popodnevnim terminima: 15:45 – 17:45 ili 18:00 – 20:00.`, styles: {} },
            { type: 'text', text: `Polaznici ciklusa će koristiti edukacijske setove `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/fischertechnik-microbit/`, content: [{ type: 'text', text: `Fischertechnik robotske setove`, styles: {} }] },
            { type: 'text', text: ` te samostalno izrađivati i programirati razne modele strujnih krugova, rasvjetne modele i semafore, parking rampe te ostale autonomne modele sličnih namjena.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cilj ovakvih radionica je upoznati polaznike sa osnovama iz elementarne robotike te ih pri tome zainteresirati da se i u budućnosti nastave baviti sličnim sadržajima. Projekti koji će se izrađivati na radionicama objedinjuju različita znanja i vještine iz područja elektronike, elektrotehnike, mehanike i programiranja. Svi projekti i modeli koji će se izrađivati oponašaju stvarne tehničke sustave koji nas okružuju. Ovakvim pristupom polaznici bolje razumijevaju načine rada tehničkih sustava, te potiču vlastitu kreativnost i motivaciju za stvaranje pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
            { type: 'text', text: `Od polaznika se ne zahtijeva prethodno poznavanje sličnih sadržaja iz robotike.`, styles: {} },
            { type: 'text', text: `Na radionicama su polaznici raspoređeni u parove te svaki par imati osiguran po jedan laptop i robotski set.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Broj mjesta na radionicama je ograničen.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su u potpunosti besplatne te su sufinancirane sredstvima Europske unije iz Europskog socijalnog fonda.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Mjesto održavanja:`, styles: {'bold': true} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+izdvojena+jedinica/@43.5117989,16.453936,14.46z/data=!4m9!1m2!2m1!1svelebitska+32+udruga+inovatic!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Udruga Inovatic, Lokacija 2 – Velebitska 32, Split`, styles: {} }] },
            { type: 'text', text: `Dob polaznika:`, styles: {'bold': true} },
            { type: 'text', text: ` 10 – 14 godina`, styles: {} },
            { type: 'text', text: `Kontakt e-mail:`, styles: {'bold': true} },
            { type: 'link', href: `mailto:info@zvjezdano-selo.hr`, content: [{ type: 'text', text: `info@udruga-inovatic.hr`, styles: {} }] },
            { type: 'text', text: `Kontakt telefon:`, styles: {'bold': true} },
            { type: 'text', text: ` 0993936993`, styles: {} },
            { type: 'text', text: `Kontakt osoba:`, styles: {'bold': true} },
            { type: 'text', text: ` Jozo Pivac, predsjednik`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Raspored održavanja radionica po grupama:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Grupe: | 1. radionica | 2. radionica | 3. radionica | 4. radionica | 5. radionica | 6. radionica`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `1. Grupa:15:45 – 17:45 | 25.3. 2023. | 1.4. 2023. | 15.4. 2023. | 22.4. 2023. | 29.4. 2023. | 6.5. 2023.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `2. Grupa:18:00 – 20:00 | 25.3. 2023. | 1.4. 2023. | 15.4. 2023. | 22.4. 2023. | 29.4. 2023. | 6.5. 2023.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavna forma:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2023-03-07'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a16.id, tagId: tagObavijesti.id },
    ],
  })

  // [17/69] prijave-festival-znanosti-2023
  const a17 = await prisma.article.create({
    data: {
      slug: 'prijave-festival-znanosti-2023',
      title: `Prijave za sudjelovanje na radionici Festivala znanosti 2023.`,
      excerpt: `I ove godine naša udruga u suradnji sa partnerom Prirodoslovno-matematičkim fakultetom u Splitu organizira besplatnu dvodnevnu radionicu povodom nadolazećeg Festivala znanosti 2023. i projekta “Bilo kuda STEM svuda”, čiji je korisnik naša udruga, a projekt je sufinanciran sredstvima iz europskog ...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `I ove godine naša udruga u suradnji sa partnerom Prirodoslovno-matematičkim fakultetom u Splitu organizira besplatnu dvodnevnu radionicu povodom nadolazećeg Festivala znanosti 2023. i projekta “Bilo kuda STEM svuda”, čiji je korisnik naša udruga, a projekt je sufinanciran sredstvima iz europskog socijalnog fonda.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Tema ovogodišnjeg Festivala znanosti je `, styles: {} },
            { type: 'text', text: `“Priroda i društvo`, styles: {'bold': true} },
            { type: 'text', text: `” te će polaznici radionice imati priliku ovu važnu temu obraditi u kontekstu tehnike i tehnologije gdje robotika zauzima vodeće mjesto.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naziv radionice`, styles: {'bold': true} },
            { type: 'text', text: `: Priroda + društvo = tehnika?`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Polaznici`, styles: {'bold': true} },
            { type: 'text', text: `: učenici 5. i 6. razreda koji do sada nisu sudjelovali u besplatnim aktivnostima EU projekta “Bilo kuda STEM svuda”`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Trajanje radionice`, styles: {'bold': true} },
            { type: 'text', text: `: dva dana po 90 min.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Broj mjesta`, styles: {'bold': true} },
            { type: 'text', text: `: do 16 polaznika`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelji radionice`, styles: {'bold': true} },
            { type: 'text', text: `: doc. dr. sc. Stjepan Kovačević, doc. dr. sc. Ivan Peko i Jozo Pivac, prof.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Mjesto i adresa održavanja radionic`, styles: {'bold': true} },
            { type: 'text', text: `e:  Pmf Split, Odjel Politehnike, učionica B1-07, Ruđera Boškovića 33`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Datum održavanja radionica`, styles: {'bold': true} },
            { type: 'text', text: `: 24. i 25. travnja u terminu 12:30 – 14:00`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Opis aktivnosti:`, styles: {'bold': true} },
            { type: 'text', text: `Vjetar je jedan od osnovnih izvora obnovljive energije, odnosno energije koja ne dolazi iz osiromašenih izvora kao što su ugljen, plin ili nafta. Obnovljiva energija ekološki je prihvatljiva i oslanja se na prirodne pojave, a ne na smanjenje rezervi fosilnih goriva. Ljudi (društvo) su od pamtivijeka koristili energiju vjetra za pokretanje brodova, vodenih pumpi, prijevoza vode, navodnjavanje polja, proizvodnju brašna i sl.  Uvođenjem parnih i električnih motora za pumpanje vode i proizvodnju brašna, vjetrenjače su pretrpjele pad. Međutim, otkako su ljudi shvatili da mogu proizvoditi električnu energiju iz vjetra, vjetrenjače uživaju u renesansi. Prva vjetrenjača koja proizvodi električnu energiju izgrađena je 1890. godine u Danskoj. Od 1990-ih vjetroturbine su postale veće i učinkovitije, pouzdanije. Prve turbine snage 600 kW zamijenjene su strojevima od 800 kW. Trenutno su najpopularniji modeli od 2 i 3 MW. Proizvodnja energije vjetra dosegla je industrijske razmjere. Možemo zaključiti kako je vjetar jedan od osnovnih obnovljivih izvora energije koji čovječanstvo koristi već tisućljećima. Na našoj radionici polaznici će imati priliku spoznati kako društvo danas zapravo koristi energiju vjetra na robotskom modelu vjetroturbine. Prva radionica će biti predviđena za uvodni dio i slaganje modela `, styles: {} },
            { type: 'link', href: `https://education.lego.com/en-us/products/lego-education-spike-prime-set/45678#spike%E2%84%A2-prime`, content: [{ type: 'text', text: `Lego Spike Prime`, styles: {} }] },
            { type: 'text', text: ` vjetroturbine. Na drugoj radionici će polaznici samostalno izraditi program za upravljanje i automatizaciju modela vjetroturbine.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijave su zbog popunjenosti grupe zatvorene.`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2023-02-24'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a17.id, tagId: tagObavijesti.id },
    ],
  })

  // [18/69] besplatne-zimske-radionice-2023
  const a18 = await prisma.article.create({
    data: {
      slug: 'besplatne-zimske-radionice-2023',
      title: `Besplatne Zimske radionice 2023. “Bilo kuda STEM svuda”`,
      excerpt: `U razdoblju 22.2. – 25.2. 2023. provodimo besplatne Zimske radionice u sklopu esf projekta “Bilo kuda STEM svuda”.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 22.2. – 25.2. 2023. provodimo besplatne Zimske radionice u sklopu esf projekta “Bilo kuda STEM svuda”.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su namijenjene polaznicima uzrasta 10 – 14 g. koji nisu aktivni članovi naše udruge ili do sada nisu sudjelovali na besplatnim radionicama u sklopu projekta “Bilo kuda STEM svuda”.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice će trajati ukupno dva dana unutar dva ciklusa:`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `ciklus: 22. – 23.2. `, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `ciklus: 24. – 25.2.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Termini radionica su kroz jutro (10:00 – 12:00) ili popodne (17:00 – 19:00) – birate jedan od dva ponuđena termina.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Lokacija provedbe radionica su naše učionice na adresi: `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)/@43.5117989,16.453936,14z/data=!4m13!1m6!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!2sUdruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)!8m2!3d43.5164371!4d16.4561446!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32, Split`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U dva dana trajanja radionica polaznici će samostalno složiti i programirati robotsko vozilo za njegov autonoman rad na robotskoj stazi koristeći `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/lego-mindstorms-projekti/`, content: [{ type: 'text', text: `Lego Mindstorms Ev3`, styles: {} }] },
            { type: 'text', text: ` konstrukcijske setove.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Rad je planiran u parovima te je broj mjesta u grupama ograničen na osam polaznika, stoga se požurite prijaviti putem ispod navedene prijavne forme.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657862/articles/inline/besplatne-zimske-radionice-2023/EU-vidljivost-lenta-1024x177.png`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekt sufinanciraju Europska unija iz Europskog socijalnog fonda i Ured za udruge Vlade Republike Hrvatske.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2023-02-16'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a18.id, tagId: tagRadionice.id },
    ],
  })

  // [19/69] male-bistre-glavice
  const a19 = await prisma.article.create({
    data: {
      slug: 'male-bistre-glavice',
      title: `Besplatne radionice: STEAM u Splitu – Male biSTre glavice!`,
      excerpt: `U sklopu organizacije Split Tech City projektnih aktivnosti: Male biSTre glavice, Udruga Inovatic organizira besplatne radionice za djecu od 10-14 godina na adresi Velebitska 32, Split:`,
      content: [
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657874/articles/inline/male-bistre-glavice/steam-u-splitu-male-bistre-glavice1-1024x1024.png`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U sklopu organizacije `, styles: {} },
            { type: 'link', href: `https://split-techcity.com/steam-u-splitu-male-bistre-glavice`, content: [{ type: 'text', text: `Split Tech City`, styles: {} }] },
            { type: 'text', text: ` projektnih aktivnosti: `, styles: {} },
            { type: 'text', text: `Male biSTre glavice`, styles: {'bold': true} },
            { type: 'text', text: `, Udruga Inovatic organizira besplatne radionice za djecu od 10-14 godina na adresi `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+izdvojena+jedinica/@43.5117989,16.453936,14.46z/data=!4m9!1m2!2m1!1svelebitska+32+udruga+inovatic!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32, Split`, styles: {} }] },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Autonomno upravljanje robotskim vozilom`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `12. i 13.9. (dvije grupe)`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `18.30 – 20.00 h`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Edukacijski alat koji će se koristiti na radionicama je Lego Mindstorms EV3 set za LEGO robotiku, a voditelji će biti Slavica Jurčević i Jozo Pivac.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sva pitanja stojimo na raspolaganju putem e-pošte: `, styles: {} },
            { type: 'link', href: `mailto:prijave@udruga-inovatic.hr`, content: [{ type: 'text', text: `prijave@udruga-inovatic.hr`, styles: {} }] },
            { type: 'text', text: ` ili kontakt telefona: 0993936993.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu podnosi isključivo roditelj/skrbnik maloljetnog polaznika`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-09-08'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656858/articles/covers/male-bistre-glavice.png',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a19.id, tagId: tagRadionice.id },
    ],
  })

  // [20/69] odrzana-treca-ljetna-skola-robotike-za-djecu-10-14-godina
  const a20 = await prisma.article.create({
    data: {
      slug: 'odrzana-treca-ljetna-skola-robotike-za-djecu-10-14-godina',
      title: `Održana treća Ljetna škola robotike za djecu 10 – 14 godina.`,
      excerpt: `U razdoblju 22. 8. – 26. 8. 2022. je održana treća Ljetna škola robotike za polaznike uzrasta 10 – 14 godina.Ukupno je sudjelovalo 8 polaznika raspoređenih u jednoj jutarnjoj grupi.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 22. 8. – 26. 8. 2022. je održana treća Ljetna škola robotike za polaznike uzrasta 10 – 14 godina.`, styles: {} },
            { type: 'text', text: `Ukupno je sudjelovalo 8 polaznika raspoređenih u jednoj jutarnjoj grupi.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na ovoj Ljetnoj školi robotike pod nazivom `, styles: {} },
            { type: 'text', text: `„Energija, robotika i život“`, styles: {'bold': true} },
            { type: 'text', text: `, polaznici radionica su usvojili osnovna znanja o obnovljivim i neobnovljivim izvorima energije, tehničkim sustavima koji se koriste u dobivanju i pretvorbi različitih oblika energije, te automatskim uređajima koji koriste električnu energiju u svakodnevnom životu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Svaki dan Ljetne škole bio je ispunjen raznolikim sadržajima i projektima. Na početku svake radionice polaznici bi se najprije upoznali sa osnovnim znanjem i pojmovima iz energije i robotike, a potom bi slijedio praktičan dio gdje su polaznici radom u paru slagali robotske modele te zatim programirali modele da automatski obavljaju određene radne zadatke.`, styles: {} },
            { type: 'text', text: `Na posljetku svakog dana radionica polaznici su sudjelovali u Kahoot kvizu znanja gdje su testirali svoja postignuća iz znanja o Energiji, robotici i njenom utjecaju na ljudske živote.`, styles: {} },
            { type: 'text', text: `Posljednji dan radionice je održan završni kviz kako bi polaznici vidjeli svoj napredak u znanju te kako bi proglasili pobjednika u kvizu znanja unutar svake grupe.  `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pobjednik (1. mjesto) kviza u svojoj grupi je pobjedom ostvario pravo `, styles: {} },
            { type: 'text', text: `besplatnog sudjelovanja na jednoj od naših narednih škola robotike`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
            { type: 'text', text: `1. mjesto: Ivan Vidoš  `, styles: {'bold': true} },
            { type: 'text', text: `2. mjesto: Karlo Kovačević`, styles: {} },
            { type: 'text', text: `3. mjesto: Karlo Tomaš`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovakvim cjelovitim pristupom u razvoju znanja, vještina i suradničkog učenja, na radionicama pružamo našim polaznicima osim dobre zabave što bolje razumijevanje načina rada robotskih sustava, poticanje vlastite kreativnosti i motivacije za poduzetništvom i kreiranjem vlastitih pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelj radionice je bio Jozo Pivac, predsjednik Udruge za robotiku Inovatic, predavači su bili Marta Vukić i asistent Duje Topić.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Program je sufinanciran sredstvima Grada Splita iz Javnog poziva za prijavu programa namijenjenih zadovoljavanju javnih potreba u tehničkoj kulturi Grada Splita za 2022.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-09-04'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a20.id, tagId: tagRadionice.id },
      { articleId: a20.id, tagId: tagRezultati.id },
    ],
  })

  // [21/69] odrzane-tri-ljetne-skole-robotike-na-bracu-u-sklopu-eu-projekta-bilo-kuda-stem-svuda
  const a21 = await prisma.article.create({
    data: {
      slug: 'odrzane-tri-ljetne-skole-robotike-na-bracu-u-sklopu-eu-projekta-bilo-kuda-stem-svuda',
      title: `Održane tri Ljetne škole robotike na Braču u sklopu EU projekta “Bilo kuda STEM svuda”.`,
      excerpt: `U razdoblju od 14. 7. do 14. 8. 2022., Udruga „RoboBrač“ je održala ukupno tri besplatne Ljetne škole robotike namijenjene osnovnoškolcima sa područja otoka Brača.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju od 14. 7. do 14. 8. 2022., Udruga „RoboBrač“ je održala ukupno tri besplatne Ljetne škole robotike namijenjene osnovnoškolcima sa područja otoka Brača.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U radu Ljetnih škola je sudjelovalo oko pedeset polaznika tj. djece, a radionice su se provodile u Bolu, Pučišćima i Selcima na Braču.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetne škole su dio EU projekta „Bilo kuda STEM svuda“  kojeg je organizirala i provela partnerska udruga na projektu, Udruga RoboBrač. Voditeljice Ljetnih škola su predsjednica Udruge „RoboBrač“, profesorica Lucija Špacal i dopredsjednica udruge, profesorica Ana Bodlović .`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za vrijeme trajanja Ljetnih škola robotike polaznici su kroz praktične primjere usvajali elementarno znanje i vještine iz robotike, posebno u domenama elektronike, mehanike i programiranja. Izrađivani su različiti projekti poput jednostavnih i složenijih strujnih krugova, modela semafora za vozila i pješake, automatskog sušila za ruke, automatske parking rampe, te ostali projekti.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cilj tih aktivnosti je bio kroz praktične primjere upoznati polaznike s mogućnostima Fischertechnik edukacijskih alata iz robotike, te ih pri tome zainteresirati da se i u budućnosti nastave baviti sličnim sadržajima. Projekti koji su izrađivani u radionicama su bili interdisciplinarni, te su objedinjavali različita znanja i vještine koje je trebalo primijeniti na konkretnim modelima. Svi projekti i modeli koji su izrađivani su oponašali stvarne tehničke sustave koji nas okružuju. Ovakvim pristupom polaznici bolje razumijevaju načine rada tehničkih sustava te potiču vlastitu kreativnost i motivaciju za stvaranje pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Oprema koja je korištena na radionicama robotike je nabavljena u sklopu projekta „Bilo kuda STEM svuda“, a sa svrhom jačanja kapaciteta partnerske Udruge „RoboBrač“. Riječ je o deset prijenosnih računala, dvanaest Fischertechnik robotic setova i dvanaest Fischertechnik Universal 4 setova s dodatnim baterijama.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetne škole robotike su dio projekta „Bilo kuda STEM svuda“ koji je financiran iz Europskog socijalnog fonda i Ureda za udruge Vlade RH, a namijenjen je jačanju kapaciteta OCD-a (organizacija civilnog društva) te popularizaciji STEM – a među mladima. Vrijednost projekta je 1.980.693,34 kn, a trajanje projekta je 24 mjeseca (od 13.07.2021. do 13.07.2023.). Nositelj projekta je Udruga za robotiku „Inovatic“, a jedan od partnera na projektu je Udruga „RoboBrač“, koja je ujedno domaćin i organizator Ljetnih škola robotike na Braču.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `1. Ljetna škola – Pučišća`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `2. Ljetna škola – Bol`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `3. Ljetna škola – Selca`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-08-17'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a21.id, tagId: tagRadionice.id },
      { articleId: a21.id, tagId: tagRezultati.id },
      { articleId: a21.id, tagId: tagEuProjekt.id },
    ],
  })

  // [22/69] odrzana-druga-ljetna-skola-robotike-za-djecu-6-9-godina
  const a22 = await prisma.article.create({
    data: {
      slug: 'odrzana-druga-ljetna-skola-robotike-za-djecu-6-9-godina',
      title: `Održana druga Ljetna škola robotike za djecu 6 – 9 godina`,
      excerpt: `U razdoblju 8. 8. – 12. 8. 2022. je održana druga Ljetna škola robotike za polaznike uzrasta 6 – 9 godina.Ukupno je sudjelovalo 14 polaznika raspoređenih kroz jutarnju i popodnevnu grupu.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 8. 8. – 12. 8. 2022. je održana druga Ljetna škola robotike za polaznike uzrasta 6 – 9 godina.`, styles: {} },
            { type: 'text', text: `Ukupno je sudjelovalo 14 polaznika raspoređenih kroz jutarnju i popodnevnu grupu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na ovoj Ljetnoj školi robotike pod nazivom `, styles: {} },
            { type: 'text', text: `„Energija, robotika i život“`, styles: {'bold': true} },
            { type: 'text', text: `, polaznici radionica su usvojili osnovna znanja o obnovljivim i neobnovljivim izvorima energije, tehničkim sustavima koji se koriste u dobivanju i pretvorbi različitih oblika energije, te automatskim uređajima koji koriste električnu energiju u svakodnevnom životu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Svaki dan Ljetne škole bio je ispunjen raznolikim sadržajima i projektima. Na početku svake radionice polaznici bi se najprije upoznali sa osnovnim znanjem i pojmovima iz energije i robotike, a potom bi slijedio praktičan dio gdje su polaznici radom u paru slagali robotske modele te zatim programirali modele da automatski obavljaju određene radne zadatke.`, styles: {} },
            { type: 'text', text: `Na posljetku svakog dana radionica polaznici su sudjelovali u Kahoot kvizu znanja gdje su testirali svoja postignuća iz znanja o Energiji, robotici i njenom utjecaju na ljudske živote.`, styles: {} },
            { type: 'text', text: `Posljednji dan radionice je održan završni kviz kako bi polaznici vidjeli svoj napredak u znanju te kako bi proglasili pobjednika u kvizu znanja unutar svake grupe.  `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pobjednici (1. mjesto) kviza svake grupe su svojom pobjedom ostvarili pravo `, styles: {} },
            { type: 'text', text: `besplatnog sudjelovanje na jednoj od naših narednih škola robotike`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
            { type: 'text', text: `Grupa ujutro:`, styles: {} },
            { type: 'text', text: `1. mjesto: Tonko Mladina  `, styles: {'bold': true} },
            { type: 'text', text: `2. mjesto: Duje Simovic`, styles: {} },
            { type: 'text', text: `3. mjesto: Antonio Medić`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Grupa popodne:`, styles: {} },
            { type: 'text', text: `1. mjesto: Marko Vukelić`, styles: {'bold': true} },
            { type: 'text', text: `2. mjesto: Bruno Malčić`, styles: {} },
            { type: 'text', text: `3. mjesto: Lily Vranković`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovakvim cjelovitim pristupom u razvoju znanja, vještina i suradničkog učenja, na radionicama pružamo našim polaznicima osim dobre zabave što bolje razumijevanje načina rada robotskih sustava, poticanje vlastite kreativnosti i motivacije za poduzetništvom i kreiranjem vlastitih pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelj radionice je bio Jozo Pivac, predsjednik Udruge za robotiku Inovatic, predavači su bili Marta Vukić i Bruno Bešlić te asistent Duje Topić.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Program je sufinanciran sredstvima Grada Splita iz Javnog poziva za prijavu programa namijenjenih zadovoljavanju javnih potreba u tehničkoj kulturi Grada Splita za 2022.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-08-17'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a22.id, tagId: tagRadionice.id },
      { articleId: a22.id, tagId: tagRezultati.id },
    ],
  })

  // [23/69] prijave-za-ljetnu-2022-stariji-uzrast
  const a23 = await prisma.article.create({
    data: {
      slug: 'prijave-za-ljetnu-2022-stariji-uzrast',
      title: `Prijave za Ljetnu školu robotike 2022. uzrasta 10 – 14 godina.`,
      excerpt: `Otvorili smo prijave za Ljetnu školu robotike na temu: Energija, robotika i život.Radionice su namijenjene polaznicima uzrasta 10 – 14 godina, a održavati će se u razdoblju 22. 8. – 26 .8. 2022. u terminu kroz jutro 9:00 – 12:00.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Otvorili smo prijave za Ljetnu školu robotike na temu: `, styles: {} },
            { type: 'text', text: `Energija, robotika i život.`, styles: {'bold': true} },
            { type: 'text', text: `Radionice su namijenjene polaznicima uzrasta `, styles: {} },
            { type: 'text', text: `10 – 14 godina`, styles: {'bold': true} },
            { type: 'text', text: `, a održavati će se u razdoblju `, styles: {} },
            { type: 'text', text: `22. 8. – 26 .8. 2022. `, styles: {'bold': true} },
            { type: 'text', text: `u terminu kroz jutro `, styles: {} },
            { type: 'text', text: `9:00 – 12:00.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice će se održati na našoj lokaciji `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)/@43.5117989,16.453936,14z/data=!4m13!1m6!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!2sUdruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)!8m2!3d43.5164371!4d16.4561446!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32, Split.`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cijena ciklusa je `, styles: {} },
            { type: 'text', text: `1.000,00 kn`, styles: {'bold': true} },
            { type: 'text', text: ` po djetetu. Brat ili sestra ostvaruju popust u iznosu 100 kn.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kao i uvijek potrudili smo se pripremiti zanimljive i raznolike projekte u cilju da polaznici steknu nova korisna znanja i vještine, radom na edukacijskim setovima za robotiku`, styles: {} },
            { type: 'text', text: `: `, styles: {'bold': true} },
            { type: 'text', text: `LEGO WeDo 2.0., LEGO Spike Prime i Fischetechnik.`, styles: {'italic': true} },
            { type: 'text', text: `Tema ovogodišnje Ljetne škole je `, styles: {} },
            { type: 'text', text: `Energija, robotika i život`, styles: {'bold': true} },
            { type: 'text', text: `, te će polaznici izrađivati sljedeće projekte na tu važnu globalnu problematiku:`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Automatska vodena brana – Lego WeDo 2.0. set`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Pumpa za dobivanje nafte – Lego WeDo 2.0. set`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Robotsko vozilo na struju – Lego Spike Prime set`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Robotsko vozilo na struju sa dodacima – Lego Spike Prime set`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Vjetrenjača – Fischertechnik ROBOTIC set `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kroz navedene projekte polaznici će usvojiti osnovna znanja o obnovljivim i neobnovljivim izvorima energije, tehničkim sustavima koji se koriste za dobivanje i pretvorbu različitih oblika energije, te automatskim uređajima koji koriste električnu energiju u svakodnevnom životu.`, styles: {} },
            { type: 'text', text: `Kroz zabavne praktične primjere i projekte polaznici će radom u paru energetske sustave najprije konstruirati te zatim programirati da automatski rade na zadanim vrijednostima.`, styles: {} },
            { type: 'text', text: `Ovakvim cjelovitim pristupom u razvoju znanja, vještina i suradničkog učenja, na radionicama pružamo našim polaznicima osim dobre zabave što bolje razumijevanje načina rada robotskih sustava, poticanje vlastite kreativnosti i motivacije za poduzetništvom i kreiranjem vlastitih pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
            { type: 'text', text: `Osim zanimljivih projekata i sadržaja na radionicama ćemo provoditi svakodnevno i razne kvizove, raznolikog i zabavnog sadržaja kako bi polaznici lakše usvajali nove pojmove i kontinuirano napredovali u radu.`, styles: {} },
            { type: 'text', text: `Za `, styles: {} },
            { type: 'text', text: `najuspješnijeg polaznika`, styles: {'bold': true} },
            { type: 'text', text: ` unutar svake grupe smo pripremili vrijednu nagradu: `, styles: {} },
            { type: 'text', text: `besplatno sudjelovanje u jednoj od sljedećih naših škola robotike.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu na Ljetnu školu robotike možete izvršiti putem navedene prijavne forme. Broj mjesta je ograničen na osam učenika po grupi stoga se požurite.`, styles: {} },
            { type: 'text', text: `Uz poslanu prijavu potrebno je rezervirati sudjelovanje na radionicama uplatom u iznosu od 500,00 kn.`, styles: {} },
            { type: 'text', text: `Podaci za uplatu rezervacije će Vam stići na e-poštu nakon što pošaljete prijavu (provjerite neželjenu poštu).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sva pitanja stojimo na raspolaganju putem e-pošte: `, styles: {} },
            { type: 'link', href: `mailto:prijave@udruga-inovatic.hr`, content: [{ type: 'text', text: `prijave@udruga-inovatic.hr`, styles: {} }] },
            { type: 'text', text: ` ili kontakt telefona: 0993936993.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu podnosi isključivo roditelj/skrbnik maloljetnog polaznika:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-08-14'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a23.id, tagId: tagObavijesti.id },
    ],
  })

  // [24/69] odrzan-drugi-ljetni-kamp-robotike-zsm
  const a24 = await prisma.article.create({
    data: {
      slug: 'odrzan-drugi-ljetni-kamp-robotike-zsm',
      title: `Održan drugi Ljetni kamp robotike na Zvjezdanom selu Mosor u sklopu EU projekta “Bilo kuda STEM svuda”.`,
      excerpt: `U razdoblju od 30. 7. do 3. 8. 2022., u zvjezdarnici Zvjezdanog sela Mosor u Gornjem Sitnom je održan drugi besplatni Ljetni kamp robotike namijenjen djeci s područja Sisačko-moslavačke županije zahvaćenog nedavnim potresom.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju od 30. 7. do 3. 8. 2022., u zvjezdarnici Zvjezdanog sela Mosor u Gornjem Sitnom je održan drugi besplatni Ljetni kamp robotike namijenjen djeci s područja Sisačko-moslavačke županije zahvaćenog nedavnim potresom. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U radu kampa je sudjelovalo petnaest učenika osnovnih škola iz Kutine, Gline, Novske i Popovače, u pratnji dviju nastavnica, Zrinke Jakubek Šimićić iz Novske, te Vedrane Miljuš iz Gline. Kamp je dio EU projekta „Bilo kuda STEM svuda“  kojeg je organizirala i provela Udruga za robotiku „Inovatic“, u suradnji s partnerskom udrugom Zvjezdano selo Mosor, ZTK Sisačko-moslavačke županije, te osnovnim školama iz Sisačko-moslavačke županije. Voditelj kampa je bio Tomislav Nikolić, tajnik Zvjezdanog sela Mosor, a voditelj radionica i cijelog projekta Jozo Pivac, predsjednik udruge „Inovatic“.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za vrijeme trajanja kampa, djeca su u jutarnjim satima pohađala radionice robotike koje je profesor Pivac vodio uz pomoć volonterke Ane Đerek. U radionicama robotike su kroz praktične primjere usvajani elementarno znanje i vještine iz robotike, posebno u domenama elektronike, mehanike i programiranja. Izrađivani su različiti projekti poput jednostavnih i složenijih strujnih krugova, modela semafora za vozila i pješake, automatskog sušila za ruke, automatske parking rampe, te se posljednjeg dana kampa koristio Miranda simulator za robotiku. Također posljednjeg dana sudionici kampa su imali priliku okušati se u završnom kvizu znanja gdje su prva mjesta osvojila vrijedne nagrade, trajne licence za programiranje i upravljanje raznim robotski modelima unutar Miranda softvera za simulaciju robota.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cilj tih aktivnosti je bio kroz praktične primjere upoznati polaznike s mogućnostima edukacijskih alata iz robotike, te ih pri tome zainteresirati da se i u budućnosti nastave baviti sličnim sadržajima. Projekti koji su izrađivani u radionicama su bili multidisciplinarni, te su objedinjavali različita znanja i vještine koje je trebalo primijeniti na konkretne modele. Svi projekti i modeli koji su izrađivani su oponašali stvarne tehničke sustave koji nas okružuju. Ovakvim pristupom polaznici bolje razumijevaju načine rada tehničkih sustava, te potiču vlastitu kreativnost i motivaciju za stvaranje pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Oprema koja je korištena na radionicama robotike je nabavljena u sklopu projekta „Bilo kuda STEM svuda“, a sa svrhom jačanja kapaciteta partnerske udruge Zvjezdano selo Mosor. Riječ je o deset prijenosnih računala, dvanaest Fischertechnik robotic setova i dvanaest Fischertechnik Universal 4 setova s dodatnim baterijama.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `I nakon jutarnjih radionica robotike, djeca su dane provodila sadržajno i zabavno; u popodnevnim satima razgledavajući prirodu i kulturne znamenitosti, te odlaskom na kupanje, a tijekom večernjih sati na predavanjima iz astronomije i promatranjima noćnog neba s terase zvjezdarnice. Osim što su djeca upoznata s najsjajnijim ljetnim zvijezdama, teleskopom su promatrani mladi Mjesec, planet Saturn i galaktika Andromeda. Taj večernji program je vodio Zoran Knez, astronom-animator Zvjezdanog sela Mosor.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sudionici kampa su u ponedjeljak popodne obišli crkvicu Sv. Jure na Gradcu, te s vidilice pokraj spomenika Mili Gojsalića dobili priliku baciti pogled na donji tok Cetine i njeno ušće u Omišu. U utorak popodne su, pak, posjetili postaju DVD-a Žrnovnica gdje su im vatrogasci Karlo Repac i Ivan Sinovčić održali kratko edukativno predavanje o funkcioniranju te vatrogasne postrojbe, namjeni vozila i opremi koju koriste na različitim intervencijama – od tehničkih do šumskih. Usto im je prije kupanja na splitskoj plaži Žnjan, u tamošnjem objektu Crvenog križa član spasilačke službe Split Jure Vranić objasnio što rade spasioci na vodi, te ih ukratko upoznao s djelatnostima Gradskog društva Crvenog križa Split.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetni kampovi robotike su dio projekta „Bilo kuda STEM svuda“ koji je financiran iz Europskog socijalnog fonda i Ureda za udruge Vlade RH, a namijenjen je jačanju kapaciteta OCD-a (organizacija civilnog društva) te popularizaciji STEM – a među mladima. Vrijednost projekta je 1.980.693,34 kn, a trajanje projekta je 24 mjeseca (od 13.07.2021. do 13.07.2023.). Nositelj projekta je Udruga za robotiku „Inovatic“, a jedan od partnera na projektu je Zvjezdano selo Mosor, koja je ujedno i domaćin ovog Ljetnog kampa.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekt sufinanciraju Europska unija iz Europskog socijalnog fonda i Ured za udruge Vlade Republike Hrvatske.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-08-14'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a24.id, tagId: tagRadionice.id },
      { articleId: a24.id, tagId: tagRezultati.id },
    ],
  })

  // [25/69] odrzan-prvi-splitski-kamp-robotike
  const a25 = await prisma.article.create({
    data: {
      slug: 'odrzan-prvi-splitski-kamp-robotike',
      title: `Održan prvi splitski kamp robotike u sklopu EU projekta “Bilo kuda STEM svuda”.`,
      excerpt: `U razdoblju 25. 7. – 1. 8. 2022. u Udruzi Inovatic, u Splitu je održan prvi besplatni Ljetni kamp robotike u sklopu EU projekta „Bilo kuda STEM svuda“.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 25. 7. – 1. 8. 2022. u Udruzi Inovatic, u Splitu je održan prvi besplatni Ljetni kamp robotike u sklopu EU projekta „Bilo kuda STEM svuda“. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na prvom splitskom kampu je sudjelovalo petnaest djece liječenih od malignih bolesti koji su korisnici Udruge Sanus, u pratnji njihovih voditeljica, Boženka Anić i Ivana Klarić te volonterki, Tea Vučković i Petra Baković`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za vrijeme trajanja kampa sudionici su pohađali radionice robotike koje je vodio profesor Jozo Pivac uz pomoć volontera: Slavice Jurčević, Josipa Stepinca i Ivana Stepinca.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na radionicama robotike se kroz praktične primjere usvajalo elementarno znanje i vještine iz robotike kroz izradu zabavnih projekata poput izrade robotske ruke, robo plesača, robotske dizalice te ostale po želji robotske kreacije i izumi koje su sudionici samostalno osmislili te izradili.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Oprema koja se koristila na radionicama robotike je nabavljena u sklopu projekta „Bilo kuda STEM svuda“, sa svrhom jačanja kapaciteta Udruge Inovatic poput: prijenosnih računala, interaktivnih ploča, projektora, te Lego Spike Prime i Lego Mindstorms EV3 robotskih setova.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Osim  radionica robotike polaznici kampa su provodili ostatak vremena također sadržajno i zabavno; sudjelovali su na raznim edukativnim radionicama iz STEM područja koje su držale volonterke Tea Vučković i Petra Baković, te su također odlazili na izlete razgledavajući prirodne i kulturne znamenitosti naše lijepe Dalmatinske zagore.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelj kampa je bio Jozo Pivac, predsjednik Udruge Inovatic te ujedno voditelj projekta „Bilo kuda STEM svuda“.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetni kampovi robotike su dio projekta „Bilo kuda STEM svuda“ koji je financiran iz Europskog socijalnog fonda i Ureda za udruge Vlade RH, a namijenjen je jačanju kapaciteta OCD-a (organizacija civilnog društva) te popularizaciji STEM – a među mladima. Vrijednost projekta je 1.980.693,34 kn, a trajanje projekta je 24 mjeseca (od 13.07.2021. do 13.07.2023.). Nositelj projekta je Udruga za robotiku „Inovatic“.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekt sufinanciraju Europska unija iz Europskog socijalnog fonda i Ured za udruge Vlade Republike Hrvatske.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-08-13'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656863/articles/covers/odrzan-prvi-splitski-kamp-robotike.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a25.id, tagId: tagRadionice.id },
      { articleId: a25.id, tagId: tagRezultati.id },
    ],
  })

  // [26/69] odrzana-prva-ljetna-skola-robotike-za-djecu-6-9-godina
  const a26 = await prisma.article.create({
    data: {
      slug: 'odrzana-prva-ljetna-skola-robotike-za-djecu-6-9-godina',
      title: `Održana prva Ljetna škola robotike za djecu 6 – 9 godina`,
      excerpt: `U razdoblju 11. 7. – 15. 7. 2022. je održana prva Ljetna škola robotike za polaznike uzrasta 6 – 9 godina.Ukupno je sudjelovalo 16 polaznika raspoređenih kroz jutarnju i popodnevnu grupu.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 11. 7. – 15. 7. 2022. je održana prva Ljetna škola robotike za polaznike uzrasta 6 – 9 godina.`, styles: {} },
            { type: 'text', text: `Ukupno je sudjelovalo 16 polaznika raspoređenih kroz jutarnju i popodnevnu grupu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na ovoj Ljetnoj školi robotike pod nazivom `, styles: {} },
            { type: 'text', text: `„Energija, robotika i život“`, styles: {'bold': true} },
            { type: 'text', text: `, polaznici radionica su usvojili osnovna znanja o obnovljivim i neobnovljivim izvorima energije, tehničkim sustavima koji se koriste u dobivanju i pretvorbi različitih oblika energije, te automatskim uređajima koji koriste električnu energiju u svakodnevnom životu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Svaki dan Ljetne škole bio je ispunjen raznolikim sadržajima i projektima. Na početku svake radionice polaznici bi se najprije upoznali sa osnovnim znanjem i pojmovima iz energije i robotike, a potom bi slijedio praktičan dio gdje su polaznici radom u paru slagali robotske modele te zatim programirali modele da automatski obavljaju određene radne zadatke.`, styles: {} },
            { type: 'text', text: `Na posljetku svakog dana radionica polaznici su sudjelovali u Kahoot kvizu znanja gdje su testirali svoja postignuća iz znanja o Energiji, robotici i njenom utjecaju na ljudske živote.`, styles: {} },
            { type: 'text', text: `Posljednji dan radionice je održan završni kviz kako bi polaznici vidjeli svoj napredak u znanju te kako bi proglasili pobjednika u kvizu znanja unutar svake grupe.  `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pobjednici (1. mjesto) kviza svake grupe su svojom pobjedom ostvarili pravo `, styles: {} },
            { type: 'text', text: `besplatnog sudjelovanje na jednoj od naših narednih škola robotike`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
            { type: 'text', text: `Grupa ujutro: `, styles: {} },
            { type: 'text', text: `1. mjesto: Bartol Luketin`, styles: {'bold': true} },
            { type: 'text', text: `2. mjesto: Luka Matijević`, styles: {} },
            { type: 'text', text: `3. mjesto: Toni Milišić`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Grupa popodne:`, styles: {} },
            { type: 'text', text: `1. mjesto: Marin Laerte Malvicini`, styles: {'bold': true} },
            { type: 'text', text: `2. mjesto: Josipa Barać`, styles: {} },
            { type: 'text', text: `3. mjesto: Frane Bočina`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovakvim cjelovitim pristupom u razvoju znanja, vještina i suradničkog učenja, na radionicama pružamo našim polaznicima osim dobre zabave što bolje razumijevanje načina rada robotskih sustava, poticanje vlastite kreativnosti i motivacije za poduzetništvom i kreiranjem vlastitih pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelj radionice je bio Jozo Pivac, predsjednik Udruge za robotiku Inovatic, predavači su bili Marta Vukić i Bruno Bešlić te asistenti Klara Mandić i Duje Topić.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Veselimo se nadolazećoj `, styles: {} },
            { type: 'text', text: `drugoj školi Ljetne robotike`, styles: {'bold': true} },
            { type: 'text', text: ` koja se održava u razdoblju: `, styles: {} },
            { type: 'text', text: `8.8. – 12.8.2022. `, styles: {'bold': true} },
            { type: 'text', text: `Slobodnih mjesta ima još malo, a prijavu možete izvršiti putem `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/ljetna-skola-2022/`, content: [{ type: 'text', text: `POVEZNICE`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Program je sufinanciran sredstvima Grada Splita iz Javnog poziva za prijavu programa namijenjenih zadovoljavanju javnih potreba u tehničkoj kulturi Grada Splita za 2022.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-07-19'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a26.id, tagId: tagRadionice.id },
      { articleId: a26.id, tagId: tagRezultati.id },
    ],
  })

  // [27/69] zavrsen-prvi-ljetni-kamp-zsm
  const a27 = await prisma.article.create({
    data: {
      slug: 'zavrsen-prvi-ljetni-kamp-zsm',
      title: `Održan prvi Ljetni kamp robotike na Zvjezdanom selu Mosor u sklopu EU projekta “Bilo kuda STEM svuda”.`,
      excerpt: `U razdoblju 4. 7. – 9. 7. 2022. na Zvjezdanom selu Mosor je održan prvi besplatni Ljetni kamp robotike namijenjen djeci sa područja zahvaćenih potresom Sisačko-moslovačke županije.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 4. 7. – 9. 7. 2022. na Zvjezdanom selu Mosor je održan prvi besplatni Ljetni kamp robotike namijenjen djeci sa područja zahvaćenih potresom Sisačko-moslovačke županije. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na kampu je sudjelovalo petnaest učenika viših razreda OŠ Braća Bobetko iz Siska u pratnji njihovih mentorica, Jasminke Gerin i Vesne Majdandžić.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za vrijeme trajanja kampa djeca su u jutarnjim satima pohađali radionice robotike koje je vodio profesor Jozo Pivac uz pomoć volontera, Josipa Stepinca i Ivana Stepinca.`, styles: {} },
            { type: 'text', text: `Na radionicama robotike se kroz praktične primjere usvajalo elementarno znanje i vještine iz robotike, posebno u domenama elektronike, mehanike i programiranja.`, styles: {} },
            { type: 'text', text: `Izrađivali su se razni projekti poput izrade jednostavnih i složenih strujnih krugova, modela semafora za vozila i pješake, automatsko sušilo za ruke, automatska parking rampa i zadnji dan radionica po želji vlastito osmišljeni projekt.`, styles: {} },
            { type: 'text', text: `Cilj ovakvih radionica je polaznike kroz praktične primjere upoznati sa mogućnostima edukacijskih alata iz robotike, te ih pri tome zainteresirati da se nastave baviti sa sličnim sadržajima u budućnosti. Projekti koji su se izrađivali na radionicama su multidisciplinarni te objedinjuju različita znanja i vještine koje je potrebno primijeniti na konkretnim modelima. Svi projekti i modeli koji su se izrađivali oponašaju stvarne tehničke sustave koji nas okružuju. Ovakvim pristupom polaznici bolje razumijevaju načine rada tehničkih sustava te potiču vlastitu kreativnost i motivaciju za kreiranjem vlastitih pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Oprema koja se koristila na radionicama robotike je nabavljena u sklopu projekta „Bilo kuda STEM svuda“, sa svrhom jačanja kapaciteta partnerske udruge Zvjezdano selo Mosor: deset prijenosnih računala, dvanaest Fischertechnik robotic setova i dvanaest Fischertechnik Universal 4 setova sa dodatnim baterijama.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Osim jutarnjih radionica robotike ostatak dana su polaznici kampa provodili također sadržajno i zabavno; u popodnevnim satima razgledavajući prirodu i kulturne znamenitosti te odlaskom na kupanje, a tijekom večernjih sati su održavana predavanja iz astronomije te su prisustvovali i promatranju noćnog neba teleskopom. Dio noćnog programa je vodio astronom-animator Zvjezdanog sela Mosor, Zoran Knez.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Veliko nam je zadovoljstvo što smo u šest dana besplatnog ljetnog kampa uspjeli doprijeti do glavica i srca sisačke djece kojima je to zaista potrebno, te na ovakav način uljepšali njihove ljetne praznike.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelj kampa je bio Tomislav Nikolić, tajnik Zvjezdanog sela Mosor, a voditelj radionica i projekta je Jozo Pivac, predsjednik Udruge Inovatic.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetni kampovi robotike su dio projekta „Bilo kuda STEM svuda“ koji je financiran iz Europskog socijalnog fonda i Ureda za udruge Vlade RH, a namijenjen je jačanju kapaciteta OCD-a (organizacija civilnog društva) te popularizaciji STEM – a među mladima. Vrijednost projekta je 1.980.693,34 kn, a trajanje projekta je 24 mjeseca (od 13.07.2021. do 13.07.2023.). Nositelj projekta je Udruga za robotiku „Inovatic“, a jedan od partnera na projektu je Zvjezdano selo Mosor, koja je ujedno i domaćin Ljetnih kampova.  `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Veselimo se sljedećem ljetnom kampu robotike na Zvjezdanom selu Mosor koji će se održati u periodu 30.7. – 4.8.2022.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija fotografija:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-07-08'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a27.id, tagId: tagRadionice.id },
      { articleId: a27.id, tagId: tagRezultati.id },
    ],
  })

  // [28/69] zavrsetak-cjelogodisnje-2022
  const a28 = await prisma.article.create({
    data: {
      slug: 'zavrsetak-cjelogodisnje-2022',
      title: `Završetak cjelogodišnjih radionica u škol. god. 2021./2022.`,
      excerpt: `Sa datumom 22. lipnja 2022. smo uspješno završili sedmu po redu školsku godinu od kada provedimo cjelogodišnje radionice robotike. Veliko nam je zadovoljstvo da iz godine u godinu postajemo sve aktivniji te upisujemo sve više zainteresirane djece u naše cjelogodišnje programe.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sa datumom 22. lipnja 2022. smo uspješno završili sedmu po redu školsku godinu od kada provedimo cjelogodišnje radionice robotike. Veliko nam je zadovoljstvo da iz godine u godinu postajemo sve aktivniji te upisujemo sve više zainteresirane djece u naše cjelogodišnje programe. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Zahvaljujući modernim edukacijskim alatima i našim stručnim pristupom u poučavanju robotskih sadržaja, primjenjujemo u radu raznovrsne programe namijenjene polaznicima od predškolske pa sve do srednjoškolske dobi. Upravo zbog toga veliki broj naših polaznika godinama zaredom pohađa naše programe jer im na ovakav sistematičan način pružamo kontinuirano praćenje te kvalitetne uvjete za napredovanje. Tako naši najistaknutiji polaznici već godinama pokazuju izvrsne rezultate na državnim i međunarodnim natjecanjima što je plod dugotrajnog  truda i rada. Također nam je veliko zadovoljstvo što su od ove godine neki od naših polaznika prešli u ulogu asistenata i mentora u nastavi što nam je potvrda da pozitivno utječemo na profesionalnu orijentaciju naših polaznika.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Čestitamo svim našim polaznicima koji su vrijedno i marljivo radili ovu godinu te se veselimo novoj školskoj godini u kojoj ćemo kao i u svakoj do sada pripremiti nova iznenađenja, projekte i natjecanja.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Hvala svim našim vrijednim predavačima, asistentima i volonterima što su posvećeno i predano radili ovu školsku godinu: Slavica Jurčević, Bruno Bešlić, Marta Vukić, Nina Ćurković, Milana Dodig, Jozo Pivac,  Drago Grljušić, Tina Vicković, Karmela Vujina, Klara Mandić, Duje Topić, Ines Radonić, Josip Stepinac, Ivan Stepinac, Mijo Ljubić i Roko Kljaković Gašpić.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Hvala `, styles: {} },
            { type: 'link', href: `https://www.split.hr/`, content: [{ type: 'text', text: `Gradu Splitu`, styles: {} }] },
            { type: 'text', text: ` i koji nas podržavaju i sufinanciraju u dijelu provedbe naših cjelogodišnjih programa.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-07-01'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656902/articles/covers/zavrsetak-cjelogodisnje-2022.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a28.id, tagId: tagRezultati.id },
    ],
  })

  // [29/69] ljetna-skola-2022
  const a29 = await prisma.article.create({
    data: {
      slug: 'ljetna-skola-2022',
      title: `Prijave za ljetna školu robotike 2022. za polaznike 6 – 9 godina.`,
      excerpt: `Za najmlađe robotičare/ke ovo ljeto smo pripremili dva ciklusa Ljetnih škola robotike na temu: Energija, robotika i život.Radionice su namijenjene polaznicima uzrasta 6 – 9 godina, a svaki ciklus radionica će trajati dvadeset školskih sati raspoređenih u pet dana škole.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za najmlađe robotičare/ke ovo ljeto smo pripremili dva ciklusa Ljetnih škola robotike na temu: `, styles: {} },
            { type: 'text', text: `Energija, robotika i život.`, styles: {'bold': true} },
            { type: 'text', text: `Radionice su namijenjene polaznicima uzrasta `, styles: {} },
            { type: 'text', text: `6 – 9 godina`, styles: {'bold': true} },
            { type: 'text', text: `, a svaki ciklus radionica će trajati `, styles: {} },
            { type: 'text', text: `dvadeset školskih sati `, styles: {'bold': true} },
            { type: 'text', text: `raspoređenih u pet dana škole.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prvi ciklus radionica je u periodu: `, styles: {} },
            { type: 'text', text: `11. – 15. srpnja 2022.`, styles: {'bold': true} },
            { type: 'text', text: `, a drugi ciklus `, styles: {} },
            { type: 'text', text: `8. – 12. kolovoza 2022.`, styles: {'bold': true} },
            { type: 'text', text: `Termin radionica možete odabrati ujutro: 9:00 – 12:00 ili popodne: 17:00 – 20:00.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sve radionice će se održati na našoj lokaciji `, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)/@43.5117989,16.453936,14z/data=!4m13!1m6!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!2sUdruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada)!8m2!3d43.5164371!4d16.4561446!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Velebitska 32, Split.`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cijena ciklusa je `, styles: {} },
            { type: 'text', text: `1.000,00 kn`, styles: {'bold': true} },
            { type: 'text', text: ` po djetetu. Brat ili sestra ostvaruju popust u iznosu 100 kn.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kao i uvijek potrudili smo se pripremiti zanimljive i raznolike projekte u cilju da polaznici steknu nova korisna znanja i vještine, radom na edukacijskim setovima za robotiku`, styles: {} },
            { type: 'text', text: `: `, styles: {'bold': true} },
            { type: 'text', text: `LEGO WeDo 2.0., LEGO Spike Prime i Fischetechnik.`, styles: {'italic': true} },
            { type: 'text', text: `Tema ovogodišnje Ljetne škole je `, styles: {} },
            { type: 'text', text: `Energija, robotika i život`, styles: {'bold': true} },
            { type: 'text', text: `, te će polaznici izrađivati sljedeće projekte na tu važnu globalnu problematiku:`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Automatska vodena brana – Lego WeDo 2.0. set`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Pumpa za dobivanje nafte – Lego WeDo 2.0. set`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Robotsko vozilo na struju – Lego Spike Prime set`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Robotsko vozilo na struju sa dodacima – Lego Spike Prime set`, styles: {} },
          ],
        },
        {
          type: 'numberedListItem',
          content: [
            { type: 'text', text: `Dan: Vjetrenjača – Fischertechnik ROBOTIC set `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kroz navedene projekte polaznici će usvojiti osnovna znanja o obnovljivim i neobnovljivim izvorima energije, tehničkim sustavima koji se koriste za dobivanje i pretvorbu različitih oblika energije, te tehničkim napravama i uređajima koji koriste električnu energiju u svakodnevnom životu.`, styles: {} },
            { type: 'text', text: `Kroz zabavne praktične primjere i projekte polaznici će radom u paru energetske sustave najprije konstruirati te zatim programirati da automatski rade na zadanim vrijednostima.`, styles: {} },
            { type: 'text', text: `Ovakvim pristupom polaznici osim što bolje razumijevaju načine rada energetskih sustava, potiču vlastitu kreativnost i motivaciju za poduzetništvom i kreiranjem vlastitih pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Osim zanimljivih projekata i sadržaja na radionicama ćemo provoditi svakodnevno i razne kvizove, raznolikog i zabavnog sadržaja kako bi polaznici lakše usvajali nove pojmove i kontinuirano napredovali u radu.`, styles: {} },
            { type: 'text', text: `Za `, styles: {} },
            { type: 'text', text: `najuspješnijeg polaznika`, styles: {'bold': true} },
            { type: 'text', text: ` unutar svake grupe smo pripremili vrijednu nagradu: `, styles: {} },
            { type: 'text', text: `besplatno sudjelovanje u jednoj od sljedećih naših škola robotike.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu na Ljetnu školu robotike možete izvršiti putem navedene prijavne forme. Broj mjesta je ograničen na osam učenika po grupi stoga se požurite.`, styles: {} },
            { type: 'text', text: `Uz poslanu prijavu potrebno je za rezervirati sudjelovanje na radionicama izvršiti uplatu u iznosu od 500,00 kn.`, styles: {'bold': true} },
            { type: 'text', text: `Podaci za uplatu rezervacije će Vam stići na e-poštu nakon što pošaljete prijavu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sva pitanja stojimo na raspolaganju putem e-pošte: `, styles: {} },
            { type: 'link', href: `mailto:prijave@udruga-inovatic.hr`, content: [{ type: 'text', text: `prijave@udruga-inovatic.hr`, styles: {} }] },
            { type: 'text', text: ` ili kontakt telefona: 0993936993.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu podnosi isključivo roditelj/skrbnik maloljetnog polaznika:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-06-16'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a29.id, tagId: tagRadionice.id },
    ],
  })

  // [30/69] poziv-ljetni-kamp
  const a30 = await prisma.article.create({
    data: {
      slug: 'poziv-ljetni-kamp',
      title: `Poziv udrugama za prijavu na Ljetne kampove robotike.`,
      excerpt: `Pozivamo sve zainteresirane udruge koje se bave osjetljivom skupinom djece na njihovu suradnju i sudjelovanje na besplatnim Ljetnim kampovima robotike koje organiziramo ovo ljeto na splitskom kampusu.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pozivamo sve zainteresirane udruge koje se bave osjetljivom skupinom djece na njihovu suradnju i sudjelovanje na `, styles: {} },
            { type: 'text', text: `besplatnim Ljetnim kampovima robotike`, styles: {'bold': true} },
            { type: 'text', text: ` koje organiziramo ovo ljeto na splitskom kampusu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetni kampovi robotike`, styles: {'bold': true} },
            { type: 'text', text: ` su dio projekta `, styles: {} },
            { type: 'text', text: `„Bilo kuda STEM svuda“`, styles: {'bold': true} },
            { type: 'text', text: ` koji je financiran iz Europskog socijalnog fonda i Ureda za udruge Vlade RH, a namijenjen je jačanju kapaciteta OCD-a (organizacija civilnog društva) te popularizaciji STEM – a među mladima. Vrijednost projekta je 1.980.693,34 kn, a trajanje projekta je 24 mjeseca (od 13.07.2021. do 13.07.2023.).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Nositelj projekta je naša udruga koja ima dugogodišnje iskustvo u radu sa djecom i provedbom raznih dječjih radionica i škola robotike. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Intencija je ovakvim aktivnostima kroz ljetne kampove robotike popularizirati robotiku i slične sadržaje među mladima, posebice onim osjetljivim skupinama djece kojima je to najpotrebitije, te im na sadržajan, edukativan i zabavan način uljepšati ljetne praznike.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetne kampove planiramo realizirati u suradnji sa udrugama i njihovim stručnim djelatnicima i/ili volonterima koji aktivno rade sa svojim krajnjim korisnicima tj. djecom koja spadaju u jednu od sljedećih skupina:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `djeca lošijeg socijalnog statusa,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `djeca iz manje razvijenih područja RH kojima slične aktivnosti nisu dostupne,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `djeca sa posebnim potrebama,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `djeca koja spadaju u ostale osjetljive ili ranjive skupine.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetni kampovi su osmišljene kao sedmodnevno okupljanje djece iz raznih krajeva Hrvatske te njihovo aktivno, svakodnevno sudjelovanje na radionicama robotike. Uz radionice djeca će imati slobodno vrijeme za dodatne sadržaje po želji, poput izleta, odlazaka u prirodu (Zvjezdano selo Mosor), posjetu muzeja, sportske i morske aktivnosti, a sve uz pratnju i nadzor njihovim stručnih djelatnika iz udruge koja djecu prijavi na ljetni kamp.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Planirani broj polaznika po kampu je do 20 djece iz cijele RH. Predviđena dob djece je osnovnoškolski uzrast s preporukom da prijavljena djeca budu viših razreda osnovne škole (5. – 8. r.) radi lakšeg praćenja sadržaja planiranih radionica.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prvi kamp se održava u periodu: `, styles: {} },
            { type: 'text', text: `22.7. – 29.7.2022.`, styles: {'bold': true} },
            { type: 'text', text: `, a drugi kamp u periodu `, styles: {} },
            { type: 'text', text: `21.8. – 28.8.2022.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetni kampovi su `, styles: {} },
            { type: 'text', text: `potpuno besplatni `, styles: {'bold': true} },
            { type: 'text', text: `za sve sudionike (djeca i stručna pratnja) te će smještaj i hrana (doručak, ručak i večera) biti osigurana u Studentskom centru Split – `, styles: {} },
            { type: 'link', href: `https://www.scst.unist.hr/smjestaj/studentski-domovi/dom-kampus-dr-franjo-tudman`, content: [{ type: 'text', text: `Dom Kampus Dr. Franjo Tuđman`, styles: {} }] },
            { type: 'text', text: `. `, styles: {} },
            { type: 'text', text: `Radionice robotike će se provoditi na lokacijama naše udruge koje se nalaze u blizini smještaja na kampusu:`, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22/@43.5119965,16.4663051,17z/data=!3m1!4b1!4m5!3m4!1s0x13355facae60fb29:0x7ce060fa644c4a53!8m2!3d43.5119671!4d16.4686055`, content: [{ type: 'text', text: `LOKACIJA 1`, styles: {} }] },
            { type: 'text', text: `: Prirodoslovno – matematički fakultet  Split, Ulica Ruđera Boškovića 33, Split`, styles: {} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+izdvojena+jedinica/@43.5117989,16.453936,14.46z/data=!4m9!1m2!2m1!1svelebitska+32+udruga+inovatic!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `LOKACIJA 2`, styles: {} }] },
            { type: 'text', text: `: Anića zgrada, Velebitska 32 – Split`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na radionicama robotike će naši predavači koristiti sljedeće edukacijske setove: LEGO Mindstorms, LEGO Spike Prime i Ficshertechnik ROBOTIC SET micro:bit.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ako ste zainteresirana udruga koja radi sa jednom od navedenih skupina djece molimo Vas da prijavite Vaše stručne djelatnike i/ili volontere te Vaše krajnje korisnike (djecu) na jedan od dva ljetna kampa robotike popunjavajući ispod navedenu `, styles: {} },
            { type: 'text', text: `online prijavnu formu`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Krajnji rok za prijavu na prvi Ljetni kamp je do `, styles: {} },
            { type: 'text', text: `11. srpnja 2022.`, styles: {'bold': true} },
            { type: 'text', text: `, a krajnji rok za prijavu na drugi Ljetni kamp je do `, styles: {} },
            { type: 'text', text: `1. kolovoza 2022.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Po završetku online prijava ćemo na osnovu svih Vaših pristiglih informacija iz prijave odabrati udrugu koja najviše udovoljava sljedećim kriterijima za sudjelovanje na Ljetnim kampovima:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `udovoljava li prijavljena udruga svojim ciljevima i djelatnostima objavljenom pozivu,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `u kojoj su mjeri krajnji korisnici prijavljene udruge (djeca) samostalni i sposobni za sudjelovanje na radionicama i aktivnostima kampa,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `dob krajnjih korisnika (djeca) prijavljene udruge,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `broj prijavljenih krajnjih korisnika (djeca) udruge za sudjelovanje,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `broj prijavljenih stručnih djelatnika i/ili volontera udruge za sudjelovanje,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `dosadašnja iskustva prijavljene udruge u sudjelovanju na projektima sličnog ili istog karaktera,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `vlastita organizacija prijevoza prijavljene udruge do kampa i nazad.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu ispunjava isključivo odgovorna osoba iz Vaše udruge:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657876/articles/inline/poziv-ljetni-kamp/2-1.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657876/articles/inline/poziv-ljetni-kamp/4.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657877/articles/inline/poziv-ljetni-kamp/Inovatic-2-e1648653149640.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657876/articles/inline/poziv-ljetni-kamp/4.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657878/articles/inline/poziv-ljetni-kamp/Inovatic-3.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-06-15'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a30.id, tagId: tagRadionice.id },
      { articleId: a30.id, tagId: tagObavijesti.id },
    ],
  })

  // [31/69] ljetni-kamp-robotike-2022-na-zvjezdanom-selu-mosor
  const a31 = await prisma.article.create({
    data: {
      slug: 'ljetni-kamp-robotike-2022-na-zvjezdanom-selu-mosor',
      title: `Ljetni kampovi robotike – Zvjezdano selo Mosor`,
      excerpt: `Udruga za robotiku „Inovatic“ u suradnji s partnerskom udrugom Zvjezdano selo Mosor organizira dva LJETNA KAMPA ROBOTIKE za učenike viših razreda osnovne škole. Prvi Kamp će biti održan u vremenu od 4. do 9. srpnja, a drugi od 30. srpnja do 4. kolovoza 2022. Kampovi će biti održani u zvjezdarnici...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Udruga za robotiku „Inovatic“ u suradnji s partnerskom udrugom Zvjezdano selo Mosor organizira dva LJETNA KAMPA ROBOTIKE za učenike viših razreda osnovne škole. Prvi Kamp će biti održan u vremenu od 4. do 9. srpnja, a drugi od 30. srpnja do 4. kolovoza 2022. Kampovi će biti održani u zvjezdarnici Zvjezdanog sela Mosor, u Gornjem Sitnom.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ljetni kampovi robotike su dio projekta `, styles: {} },
            { type: 'text', text: `„Bilo kuda STEM svuda“`, styles: {'bold': true} },
            { type: 'text', text: ` koji je financiran iz Europskog socijalnog fonda i Ureda za udruge Vlade RH, a namijenjen je jačanju kapaciteta OCD-a (organizacija civilnog društva) te popularizaciji STEM – a među mladima. Vrijednost projekta je 1.980.693,34 kn, a trajanje projekta je 24 mjeseca (od 13.07.2021. do 13.07.2023.). Nositelj projekta je Udruga za robotiku „Inovatic“, a jedan od partnera na projektu je Zvjezdano selo Mosor, udruga s dugogodišnjim iskustvom u provedbi proljetnih, ljetnih i zimskih škola za mlade.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Intencija je ovakvim aktivnostima za vrijeme trajanja projekta popularizirati robotiku i slične sadržaje među mladima, posebice onim skupinama sa lošijim socijalnim statusom te kojima su navedene aktivnosti manje dostupne.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naša udruga i Zvjezdano selo Mosor organiziraju ove Kampove robotike u suradnji s gradom Siskom, ZTK grada Siska, te osnovnim školama iz Sisačko-moslavačke županije. Cilj suradnje je u rad kampova uključiti učenike s područja Sisačko-moslavačke županije pogođenog potresom. U radu svakog od kampova će besplatno sudjelovati po petnaest učenika viših razreda osnovnih škola iz toga kraja. Ljetni kampovi će biti prepuni zabavnih i edukativnih aktivnosti poput svakodnevnih radionica robotike, razgledavanja prirode i kulturnih znamenitosti, odlazaka na kupanje, te astronomskih predavanja i promatranja neba teleskopom.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelj kampa je Tomislav Nikolić, tajnik Zvjezdanog sela Mosor, a voditelj radionica robotike je profesor Jozo Pivac, koji je ujedno i predsjednik Udruge za robotiku „Inovatic“.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Veselimo se nadolazećim ljetnim kampovima i aktivnostima za koje vjerujemo da će navući osmijehe na lica djece kojima je to najviše potrebno.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Više o projektu i partnerima možete pogledati na našim web stranicama:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `http://udruga-inovatic.hr/o-projektu/`, content: [{ type: 'text', text: `http://udruga-inovatic.hr/o-projektu/`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `http://udruga-inovatic.hr/o-partnerima/`, content: [{ type: 'text', text: `http://udruga-inovatic.hr/o-partnerima/`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekt je sufinanciran sredstvima Europske unije iz Europskog socijalnog fonda i od strane Ureda za udruge Vlade RH`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-06-07'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a31.id, tagId: tagRadionice.id },
    ],
  })

  // [32/69] zavrsen-1-ciklus-besplatnih-radionica-iz-elementarne-robotike
  const a32 = await prisma.article.create({
    data: {
      slug: 'zavrsen-1-ciklus-besplatnih-radionica-iz-elementarne-robotike',
      title: `Završen 1. ciklus besplatnih radionica iz elementarne robotike`,
      excerpt: `U subotu, 4. lipnja je završio prvi ciklus besplatnih radionica elementarne robotike. Ciklus je trajao sedam tjedana te su sudjelovala ukupno 32 polaznika uzrasta 10 – 14 godina.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U subotu, 4. lipnja je završio prvi ciklus besplatnih radionica elementarne robotike. Ciklus je trajao sedam tjedana te su sudjelovala ukupno 32 polaznika uzrasta 10 – 14 godina.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Polaznici radionica su stekli osnovne kompetencije iz područja elektronike, mehanike i programiranja te kroz razne projekte prošli osnove elementarne robotike radeći na edukacijskom Fischertechnik ROBOTIC setu. `, styles: {} },
            { type: 'text', text: `Cilj je ovakvih radionica učenike kroz praktične primjere upoznati sa mogućnostima edukacijskih alata namijenjenih poučavanju robotike i sličnih sadržaja. Učenici na našim radionicama povezuju različita znanja i vještine te ih primjenjuju na konkretnim primjerima koristeći moderne alata i tehnologije u nastavi. Kroz ovakve radionice učenici usvajaju osnovna znanja i vještine iz primjene strujnih krugova, mehaničkih elemenata i prijenosa, senzora i elektromotora te programiranje i upravljanje autonomnim sustavima. Svi projekti i modeli koji se koriste na radionicama oponašaju stvarne tehničke i automatske sustave koji nas okružuju. Ovakvim pristupom učenici osim što bolje razumijevaju načine rada ovakvih sustava, potiču vlastitu kreativnost i motivaciju za poduzetništvom i kreiranjem vlastitih pametnih sustava koji mogu unaprijediti ljudsko djelovanje.`, styles: {} },
            { type: 'text', text: `Sljedeću subotu 11. lipnja krećemo sa novim ciklusom besplatnih radionica, a prijavu možete izvršiti na: `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/ciklusi-elementarne-robotike/`, content: [{ type: 'text', text: `Radionice elementarne robotike – Inovatic (udruga-inovatic.hr)`, styles: {} }] },
            { type: 'text', text: `Ciklusi besplatnih radionica elementarne robotike su dio projekta “Bilo kuda STEM svuda”, čiji je nositelj naša udruga, a financiran je od strane Europskog socijalnog fonda i Ureda za udruge Vlade RH.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelj radionica je profesor Jozo Pivac, a predavači i asistenti na projektu su volonteri: Josip Stepinac, Ivan Stepinac, Roko Kljaković Gašpić i Mijo Ljubić.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za galeriju slika kliknite `, styles: {} },
            { type: 'link', href: `https://drive.google.com/drive/folders/1DVgw1PkFuX62pU8MmXi6WGlcbBE4uNq4?usp=sharing`, content: [{ type: 'text', text: `OVDJE`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-06-05'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656900/articles/covers/zavrsen-1-ciklus-besplatnih-radionica-iz-elementarne-robotike.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a32.id, tagId: tagRadionice.id },
      { articleId: a32.id, tagId: tagRezultati.id },
    ],
  })

  // [33/69] drzavni-prvaci-15-robokupa
  const a33 = await prisma.article.create({
    data: {
      slug: 'drzavni-prvaci-15-robokupa',
      title: `DRŽAVNI PRVACI 15. ROBOKUPA!`,
      excerpt: `Naši robotičari osvojili zlato na državnom prvenstvu iz elementarne robotike – 15. ROBOKUP-u, koje je održano 14. – 15. svibnja u Stubičkim Toplicama, točnije hotelu Matija Gubec.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naši robotičari osvojili zlato na državnom prvenstvu iz elementarne robotike – `, styles: {} },
            { type: 'text', text: `15. ROBOKUP`, styles: {'bold': true} },
            { type: 'text', text: `-u, koje je održano 14. – 15. svibnja u Stubičkim Toplicama, točnije hotelu Matija Gubec.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naime članovi naše udruge: `, styles: {} },
            { type: 'text', text: `Lora Bavčević`, styles: {'bold': true} },
            { type: 'text', text: ` (7.r), `, styles: {} },
            { type: 'text', text: `Ivano Tabak`, styles: {'bold': true} },
            { type: 'text', text: ` (8.r) i `, styles: {} },
            { type: 'text', text: `Pave Ljubić`, styles: {'bold': true} },
            { type: 'text', text: ` (6.r) na čelu sa mentorom i predsjednikom udruge `, styles: {} },
            { type: 'text', text: `Jozom Pivcem`, styles: {'bold': true} },
            { type: 'text', text: ` osvojili su `, styles: {} },
            { type: 'text', text: `1. MJESTO`, styles: {'bold': true} },
            { type: 'text', text: ` i proglašeni smo kao NAJBOLJA EKIPA ovogodišnjeg Robokupa!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Robokup natjecanje je izuzetno složeno te sadrži tri elementa: strujni krugovi, programiranje mikroupravljačkog sučelja i robotske konstrukcije i programiranje, u kojima su natjecatelji trebali pokazati svoja znanja i vještine, a naši mladi robotičari su se u pokazali kao najbolji i zasluženo donijeli zlato u Split.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na natjecanju je sudjelovalo sveukupno 15 ekipa, odnosno 45 učenika iz cijele zemlje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naši natjecatelji za svoj rezultat dobili su vrijedne nagrade: Micro:bit maqueen robote i besplatno sudjelovanje na Ljetnoj školi tehničkih aktivnosti koju ovo ljeto u Zadru organizira Hrvatska zajednica za tehničku kulturu (HZTK), ujedno i organizator Robokup natjecanja.`, styles: {} },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657863/articles/inline/drzavni-prvaci-15-robokupa/2-2.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657863/articles/inline/drzavni-prvaci-15-robokupa/3-2.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657863/articles/inline/drzavni-prvaci-15-robokupa/4-2.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657863/articles/inline/drzavni-prvaci-15-robokupa/5-2.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657863/articles/inline/drzavni-prvaci-15-robokupa/8-2.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-05-16'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a33.id, tagId: tagNatjecanja.id },
      { articleId: a33.id, tagId: tagRezultati.id },
    ],
  })

  // [34/69] festival-znanosti-2022
  const a34 = await prisma.article.create({
    data: {
      slug: 'festival-znanosti-2022',
      title: `Festival znanosti 2022.`,
      excerpt: `Na ovogodišnjem Festivalu znanosti smo u suradnji sa partnerom Zvjezdano selo Mosor na projektu “Bilo kuda STEM svuda”, održali dvije radionice robotike u OŠ Spinut, Split. Tema ovogodišnjeg Festivala znanosti je Život, a mi smo uspješno naš projekt “Bilo kuda STEM svuda” kroz besplatne radionice...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na ovogodišnjem Festivalu znanosti smo u suradnji sa partnerom Zvjezdano selo Mosor na projektu “Bilo kuda STEM svuda”, održali dvije radionice robotike u OŠ Spinut, Split. Tema ovogodišnjeg Festivala znanosti je Život, a mi smo uspješno naš projekt “Bilo kuda STEM svuda” kroz besplatne radionice prezentirali učenicima 6. r. OŠ Spinut te im na takav način pokazali koliko robotika i slični sadržaji mogu pozitivno otjecati na živote mladih. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekt “Bilo kuda STEM svuda” je financiran iz Europskog socijalnog fonda, a naša udruga ga provodi zajedno sa partnerima od kojih je jedan Zvjezdano selo Mosor.`, styles: {} },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657869/articles/inline/festival-znanosti-2022/5-1024x768.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657869/articles/inline/festival-znanosti-2022/6-1024x768.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657872/articles/inline/festival-znanosti-2022/7-1024x768.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657870/articles/inline/festival-znanosti-2022/8-1024x768.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657868/articles/inline/festival-znanosti-2022/10-1024x768.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-05-06'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656848/articles/covers/festival-znanosti-2022.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a34.id, tagId: tagRezultati.id },
    ],
  })

  // [35/69] osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022
  const a35 = await prisma.article.create({
    data: {
      slug: 'osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022',
      title: `Osvojeno 2. mjesto na županijskom ROBOKUP-u 2022.`,
      excerpt: `Na splitskom Pmf-u, je održana županijska razina natjecanja ROBOKUP 2022. – natjecanje iz elementarne robotike. Organizatori su bili Zajednica tehničke kulture grada Splita i Udruga za robotiku „Inovatic“. Natjecanju je pristupilo šest ekipa (17 učenika) iz osnovnih škola i udruga s područja Trog...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na splitskom Pmf-u, je održana županijska razina natjecanja ROBOKUP 2022. – natjecanje iz elementarne robotike. Organizatori su bili Zajednica tehničke kulture grada Splita i Udruga za robotiku „Inovatic“. Natjecanju je pristupilo šest ekipa (17 učenika) iz osnovnih škola i udruga s područja Trogira, Splita i Ciste Velike.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prva dva mjesta direktno su se plasirala na državnu razinu natjecanja, a veliko nam je zadovoljstvo što je jedna od tih ekipa upravo naša – Inovatic 2.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Čestitamo Lori Bavčević, Ivanu Tabaku i Mislavu Barčotu, kao i njihovom mentoru Jozi Pivcu na sjajnom drugom mjestu i plasmanu na DRŽAVNU RAZINU NATJECANJA koja će se održati od 13. do 15. svibnja 2022. u Stubičkim Toplicama.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Svim mentorima i učenicima koji su pristupili natjecanju čestitamo na sudjelovanju, a ekipama koje su se plasirale želimo svu sreću na državnoj razini 15. Robokupa.`, styles: {} },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657871/articles/inline/osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022/2-1-819x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657873/articles/inline/osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022/3-1-819x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657873/articles/inline/osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022/6-1-819x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657874/articles/inline/osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022/7-1-819x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657874/articles/inline/osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022/9-1-819x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-05-02'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656873/articles/covers/osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a35.id, tagId: tagNatjecanja.id },
    ],
  })

  // [36/69] drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022
  const a36 = await prisma.article.create({
    data: {
      slug: 'drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022',
      title: `Državno natjecanje iz LEGO robotike: FIRST LEGO LEAGUE 2022.`,
      excerpt: `23. travnja 2022. smo sudjelovali na First Lego League  – FLL, državnom natjecanje iz robotike koje se održalo na Fakultetu elektrotehnike i računarstva (FER) u Zagrebu. Naša udruga je ove godine sudjelovala sa čak tri ekipe: Inovatic Storm, InovaTICA Programa i Inovatic Force. Trud, kreativne id...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `23. travnja 2022. smo sudjelovali na `, styles: {} },
            { type: 'text', text: `First Lego League  – FLL`, styles: {'bold': true} },
            { type: 'text', text: `, državnom natjecanje iz robotike koje se održalo na Fakultetu elektrotehnike i računarstva (FER) u Zagrebu. Naša udruga je ove godine sudjelovala sa čak tri ekipe: `, styles: {} },
            { type: 'text', text: `Inovatic Storm`, styles: {'bold': true} },
            { type: 'text', text: `,`, styles: {} },
            { type: 'text', text: ` InovaTICA Programa `, styles: {'bold': true} },
            { type: 'text', text: `i`, styles: {} },
            { type: 'text', text: ` Inovatic Force`, styles: {'bold': true} },
            { type: 'text', text: `. Trud, kreativne ideje i zajedništvo krasile su svaku od ovih ekipa koje su se vrijedno pripremale cijelu školsku godinu za natjecanje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Jedna od naših natjecateljskih ekipa Inovatic Storm, pod vodstvom mentorice `, styles: {} },
            { type: 'text', text: `Slavice Jurčević `, styles: {'bold': true} },
            { type: 'text', text: `i J`, styles: {} },
            { type: 'text', text: `osipa Stepinca`, styles: {'bold': true} },
            { type: 'text', text: ` te mlađeg trenera `, styles: {} },
            { type: 'text', text: `Mije Ljubića`, styles: {'bold': true} },
            { type: 'text', text: `, svojim je idejama oduševila ocjenjivače te tako osvojila nagradu za `, styles: {} },
            { type: 'text', text: `NAJBOLJI INOVATIVNI PROJEKT`, styles: {'bold': true} },
            { type: 'text', text: `. Ni preostale tri kategorije nisu bile ništa lošije budući da se baš Storm ekipa plasirala na `, styles: {} },
            { type: 'text', text: `REGIONALNO FLL `, styles: {'bold': true} },
            { type: 'text', text: `natjecanje koje će se održati 14. svibnja 2022. u Sloveniji.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Razmjer ovog uspjeha još je veći kada se u obzir uzme da na FLL-u sudjeluje preko 679 000 djece, odnosno više od 110 zemalja širom svijeta.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Čestitamo i ostalim ekipama na trudu i ogromnoj želji, kao i njihovim mentorima Jozi Pivcu, Tini Vicković i mlađim trenerima Ivanu Stepincu i Roku Kljakoviću Gašpiću.`, styles: {} },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657865/articles/inline/drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022/2-1024x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657868/articles/inline/drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022/4-1024x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657867/articles/inline/drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022/6-1024x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657866/articles/inline/drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022/7-1024x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657867/articles/inline/drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022/8-1024x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657867/articles/inline/drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022/9-1024x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657864/articles/inline/drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022/10-1024x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657870/articles/inline/drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022/11-1024x1024.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-04-29'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a36.id, tagId: tagNatjecanja.id },
    ],
  })

  // [37/69] proljetna-radionica-u-zvjezdanom-selu-mosor
  const a37 = await prisma.article.create({
    data: {
      slug: 'proljetna-radionica-u-zvjezdanom-selu-mosor',
      title: `Proljetna radionica u Zvjezdanom selu mosor`,
      excerpt: `U zvjezdarnici naših partnera na projektu “Bilo kuda STEM svuda”, udruge Zvjezdano selo Mosor (ZSM) u Gornjem Sitnom je 19. travnja održana jednodnevna radionica za učenike osnovnih škola. Pohađalo ju je ukupno dvanaest učenika iz Splitsko-dalmatinske županije i grada Zaboka.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U zvjezdarnici naših partnera na projektu “Bilo kuda STEM svuda”, udruge Zvjezdano selo Mosor (ZSM) u Gornjem Sitnom je 19. travnja održana jednodnevna radionica za učenike osnovnih škola. Pohađalo ju je ukupno dvanaest učenika iz Splitsko-dalmatinske županije i grada Zaboka.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Polaznici su na radionici robotike  koristeći Fischertechnik setove i MicroBit kontrolere – izrađivali i programirali različite automatizirane modele, poput semafora za vozila, sušila za ruke i sl. Kroz igru i zabavu, stečena su korisna znanja i vještine iz osnova elektroničkih krugova, mehanike i konstrukcije, te programiranja u grafičkom programskom jeziku. Jednodnevnu radionicu je održao Jozo Pivac, predsjednik Udruge za robotiku “Inovatic”.`, styles: {} },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657879/articles/inline/proljetna-radionica-u-zvjezdanom-selu-mosor/Proljetna2022_9_1.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657879/articles/inline/proljetna-radionica-u-zvjezdanom-selu-mosor/Proljetna2022_11.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657877/articles/inline/proljetna-radionica-u-zvjezdanom-selu-mosor/1651136222722-1024x766.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657877/articles/inline/proljetna-radionica-u-zvjezdanom-selu-mosor/1651136222894-1024x768.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657878/articles/inline/proljetna-radionica-u-zvjezdanom-selu-mosor/1651136222916-1024x766.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657878/articles/inline/proljetna-radionica-u-zvjezdanom-selu-mosor/278678869_395420259259861_7182940540861048402_n-1024x576.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657878/articles/inline/proljetna-radionica-u-zvjezdanom-selu-mosor/278842339_395420212593199_2130285941664812104_n-1024x576.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-04-28'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656882/articles/covers/proljetna-radionica-u-zvjezdanom-selu-mosor.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a37.id, tagId: tagRadionice.id },
    ],
  })

  // [38/69] proljetne-radionice-robotike-2022-bilo-kuda-stem-svuda
  const a38 = await prisma.article.create({
    data: {
      slug: 'proljetne-radionice-robotike-2022-bilo-kuda-stem-svuda',
      title: `Proljetne radionice robotike 2022. “Bilo kuda STEM svuda”`,
      excerpt: `U periodu 19.4. – 21.4. 2022. su održane trodnevne radionice robotike za učenike uzrasta 10-14 g. Polaznici su se upoznali sa Lego Mindstorms EV3 edukacijskim setom te su konstruirali i programirali robotsko vozilo. Posljednji dan radionica naučena znanja su primjenjivali na stazi te su programir...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U periodu 19.4. – 21.4. 2022. su održane trodnevne radionice robotike za učenike uzrasta 10-14 g. Polaznici su se upoznali sa Lego Mindstorms EV3 edukacijskim setom te su konstruirali i programirali robotsko vozilo. Posljednji dan radionica naučena znanja su primjenjivali na stazi te su programirali robotsko vozilo da u što kraćem vremenskom periodu prijeđe istu. Radionice su vodili predavači naše udruge Slavica Jurčević i Jozo Pivac. Djeca su sa oduševljenjem otišla svojim kućama, a njihov osmjeh još je jedna potvrda da je projekt “Bilo kuda STEM svuda” sjajan način popularizacije STEM-a među mladima. Radionice su održane u sklopu višednevnih projektnih aktivnosti na projektu “Bilo kuda STEM svuda” koji je financiran sredstvima Europskog socijalnog fonda.`, styles: {} },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657880/articles/inline/proljetne-radionice-robotike-2022-bilo-kuda-stem-svuda/1651080132239-1024x766.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657880/articles/inline/proljetne-radionice-robotike-2022-bilo-kuda-stem-svuda/1651080132285-1024x768.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657879/articles/inline/proljetne-radionice-robotike-2022-bilo-kuda-stem-svuda/1651080132224-1-1024x766.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657880/articles/inline/proljetne-radionice-robotike-2022-bilo-kuda-stem-svuda/1651080132316-1-1024x768.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657879/articles/inline/proljetne-radionice-robotike-2022-bilo-kuda-stem-svuda/1651079821692-2-1024x766.jpg`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-04-27'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656889/articles/covers/proljetne-radionice-robotike-2022-bilo-kuda-stem-svuda.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a38.id, tagId: tagRadionice.id },
      { articleId: a38.id, tagId: tagEuProjekt.id },
    ],
  })

  // [39/69] proljetne-radionice-robotike-2022
  const a39 = await prisma.article.create({
    data: {
      slug: 'proljetne-radionice-robotike-2022',
      title: `Proljetne radionice robotike 2022.`,
      excerpt: `Povodom nadolazećih proljetnih praznika organiziramo za djecu uzrasta 6-9 godina kreativne radionice iz robotike i programiranja u periodu 19.4. -21.4.2022.I ove godine smo pripremili zanimljive tematske projekte koje će polaznici radionica slagati i programirati uz dosta zabave i novog iskustva.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Povodom nadolazećih proljetnih praznika organiziramo za djecu uzrasta `, styles: {} },
            { type: 'text', text: `6-9 godina`, styles: {'bold': true} },
            { type: 'text', text: ` kreativne radionice iz robotike i programiranja u periodu `, styles: {} },
            { type: 'text', text: `19.4. -21.4.2022.`, styles: {'bold': true} },
            { type: 'text', text: `I ove godine smo pripremili zanimljive tematske projekte koje će polaznici radionica slagati i programirati uz dosta zabave i novog iskustva.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na radionicama će polaznici koristiti Lego WeDo 2.0/Lego Spike Prime lego komplete`, styles: {} },
            { type: 'text', text: `te tablete.`, styles: {} },
            { type: 'text', text: `Cijena kotizacije za sudjelovanje na radionicama iznosi `, styles: {} },
            { type: 'text', text: `300 kn `, styles: {'bold': true} },
            { type: 'text', text: `po djetetu.`, styles: {} },
            { type: 'text', text: `Radionice će se održavati na našim adresama: Velebitska 32 (Plava zgrada) i Ruđera Boškovića 33 -Pmf Split. Više o našim lokacijama možete pogledati`, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/lokacije/`, content: [{ type: 'text', text: ` OVDJE.`, styles: {} }] },
            { type: 'text', text: `Broj mjesta unutar grupa je ograničen na osam polaznika stoga požurite sa prijavama.`, styles: {} },
            { type: 'text', text: `Raspored termina po grupama:`, styles: {'bold': true} },
            { type: 'text', text: `Grupa jutro: 11:00 -12:30`, styles: {} },
            { type: 'text', text: `Grupa popodne: 17:00 -18:30`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu djeteta za radionice izvršava roditelj/skrbnik preko ispod navedene prijavne forme. `, styles: {} },
            { type: 'text', text: `Prijavna forma:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-04-04'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656890/articles/covers/proljetne-radionice-robotike-2022.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a39.id, tagId: tagRadionice.id },
    ],
  })

  // [40/69] 3866-2
  const a40 = await prisma.article.create({
    data: {
      slug: '3866-2',
      title: `Besplatne Proljetne radionice robotike 2022.`,
      excerpt: `Još jednu u nizu aktivnosti koju provodimo u sklopu projekta “Bilo kuda STEM svuda” uskoro ćemo provesti u djelo. Kako nam se bliže proljetni praznici, vrijeme je i za prve u nizu VIŠEDNEVNIH RADIONICA za vrijeme školskih praznika. Proljetni ciklus će se održati od 19.4. do 21.4. u dva popodnevna...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Još jednu u nizu aktivnosti koju provodimo u sklopu projekta “Bilo kuda STEM svuda” uskoro ćemo provesti u djelo. Kako nam se bliže proljetni praznici, vrijeme je i za prve u nizu VIŠEDNEVNIH RADIONICA za vrijeme školskih praznika. Proljetni ciklus će se održati od 19.4. do 21.4. u dva popodnevna termina, a ovoga puta to će biti Lego Mindstorms radionice. Ova aktivnost biti će u potpunosti BESPLATNA, a namijenjena je učenicima od 10 do 14 godina. Polaznici mogu očekivati sva tri dana 75 minuta zabave i učenja kroz igru na našoj već dobro poznatoj lokaciji 2 – Velebitska ulica 32. `, styles: {} },
            { type: 'text', text: `Više o ovoj aktivnosti kao i PRIJAVNU FORMU možete pronaći na: `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/radionice-preko-praznika/?fbclid=IwAR3gJZLApYrtvJwk7XjJLt2KBcs-uuT7FsU4UCdjjSoU9ZqiNz-INfltKi0`, content: [{ type: 'text', text: `http://udruga-inovatic.hr/radionice-preko-praznika/`, styles: {} }] },
            { type: 'text', text: `Projekt je sufinanciran sredstvima Europske unije iz Europskog socijalnog fonda i od Ureda za udruge Vlade RH. `, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-04-04'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656836/articles/covers/3866-2.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a40.id, tagId: tagNatjecanja.id },
    ],
  })

  // [41/69] 3859-2
  const a41 = await prisma.article.create({
    data: {
      slug: '3859-2',
      title: `1. Ciklus radionica Elementarne robotike`,
      excerpt: `Naziv našeg projekta sufinanciranog sredstvima Europske unije i Vlade RH napokon dobiva svoj puni smisao – “Bilo kuda STEM svuda”.Ovaj mjesec smo počeli sa provedbom prvoga ciklusa besplatnih radionica elementarne robotike za polaznike 10-14 godina. Ciklus će trajati 16 školskih sati raspoređenih...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Naziv našeg projekta sufinanciranog sredstvima Europske unije i Vlade RH napokon dobiva svoj puni smisao – “Bilo kuda STEM svuda”.`, styles: {} },
            { type: 'text', text: `Ovaj mjesec smo počeli sa provedbom prvoga ciklusa besplatnih radionica elementarne robotike za polaznike 10-14 godina. Ciklus će trajati 16 školskih sati raspoređenih u periodu od dva mjeseca, unutar kojih će polaznici dolaziti u naše učionice  jednom tjedno po blok školski sat, subotama kroz popodne.`, styles: {} },
            { type: 'text', text: `Ukoliko se već niste prijavili za drugi ciklus ovakvih radionica koji kreću sa realizacijom u svibnju prijavu možete izvršiti `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/ciklusi-elementarne-robotike/`, content: [{ type: 'text', text: `OVDJE`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
            { type: 'text', text: `Realizacija ovih radionica omogućena je zahvaljujući opremi koja je financirana sredstvima Europske unije i Vlade RH u sklopu projekta “Bilo kuda STEM svuda” – Fischertechnik edukacijskim setovima, laptopima, interaktivnim pločama.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-04-04'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656835/articles/covers/3859-2.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a41.id, tagId: tagNatjecanja.id },
    ],
  })

  // [42/69] robokup-2022-zupanijska-razina
  const a42 = await prisma.article.create({
    data: {
      slug: 'robokup-2022-zupanijska-razina',
      title: `ROBOKUP 2022. – županijska razina`,
      excerpt: `Zajednica tehničke kulture grada Splita i Udruga Inovatic i ove su godine organizatori županijske razine 15. po redu Robokupa. Natjecanje će se održati 29. travnja 2022. godine u 9.00 sati, a domaćin natjecanja ponovno je Prirodoslovno-matematički fakultet Split. Svi zainteresirani učitelji i men...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Zajednica tehničke kulture grada Splita i Udruga Inovatic i ove su godine organizatori županijske razine 15. po redu Robokupa. Natjecanje će se održati 29. travnja 2022. godine u 9.00 sati, a domaćin natjecanja ponovno je Prirodoslovno-matematički fakultet Split. Svi zainteresirani učitelji i mentori ekipe mogu prijaviti najkasnije do 14. travnja 2022.Više o natjecanju pročitajte na stranici Ztk-Split: `, styles: {} },
            { type: 'link', href: `http://www.ztk-split.hr/doga%C4%91anja/robokup-2022?fbclid=IwAR0qRmChnndDS1Plj2Kn5OFPUB94gGuqMmxYpg7364ARzWaCDh73DINboRk`, content: [{ type: 'text', text: `http://www.ztk-split.hr/doga%C4%91anja/robokup-2022`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-03-29'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656894/articles/covers/robokup-2022-zupanijska-razina.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a42.id, tagId: tagNatjecanja.id },
    ],
  })

  // [43/69] besplatni-tecajevi-elementarne-robotike
  const a43 = await prisma.article.create({
    data: {
      slug: 'besplatni-tecajevi-elementarne-robotike',
      title: `Besplatni tečajevi elementarne robotike`,
      excerpt: `Ciklusi ovih tečajeva su zamišljeni kao višednevne radionice iz elementarne robotike. Jedan ciklus tečaja bi trajao otprilike 16 školskih sati te bi se radionice održavale jednom tjedno po blok školski sat. Ciklusi tečajeva se tematski ne nastavljaju već se isti program ponavlja iznova, stoga pol...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ciklusi ovih tečajeva su zamišljeni kao višednevne radionice iz elementarne robotike. Jedan ciklus tečaja bi  trajao otprilike 16 školskih sati te bi se radionice održavale jednom tjedno po blok školski sat.`, styles: {} },
            { type: 'text', text: `Ciklusi tečajeva se tematski ne nastavljaju već se isti program ponavlja iznova, stoga polaznici koji su već sudjelovali u jednom od ciklusa tečaja ne ostvaruju pravo ponovnog sudjelovanja u sljedećim ciklusima.`, styles: {} },
            { type: 'text', text: `Polaznici tečaja rade na `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/fischertechnik-microbit/`, content: [{ type: 'text', text: `Fischertechnik robotskim setovima`, styles: {} }] },
            { type: 'text', text: ` te će izrađivati i upravljati jednostavnim električnim krugovima, automatiziranim modelima te robotskim vozilima.`, styles: {} },
            { type: 'text', text: `Od polaznika se ne zahtijeva prethodno poznavanje sličnih sadržaja iz robotike.`, styles: {} },
            { type: 'text', text: `Na radionicama će polaznici biti raspoređeni u parove te će svaki par imati osiguran po jedan laptop i robotski set.`, styles: {} },
            { type: 'text', text: `Radionice su u potpunosti besplatne te će svu potrebnu opremu osigurati organizator tečaja.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Raspored održavanja radionica:`, styles: {'bold': true} },
            { type: 'text', text: `1. ciklus`, styles: {'bold': true} },
            { type: 'text', text: ` 26.3. – 21.5.2022. `, styles: {} },
            { type: 'text', text: `Termini:`, styles: {'bold': true} },
            { type: 'text', text: ` 15:00 – 16:30 ili 16:45 – 18:15`, styles: {} },
            { type: 'text', text: `2. ciklus`, styles: {'bold': true} },
            { type: 'text', text: ` 28.5. – 2.7.2022.  `, styles: {} },
            { type: 'text', text: `Termini:`, styles: {'bold': true} },
            { type: 'text', text: ` 15:00 – 16:30 ili 16:45 – 18:15`, styles: {} },
            { type: 'text', text: `Mjesto održavanja:`, styles: {'bold': true} },
            { type: 'link', href: `https://www.google.com/maps/place/Udruga+za+robotiku+%22Inovatic%22+-+izdvojena+jedinica/@43.5117989,16.453936,14.46z/data=!4m9!1m2!2m1!1svelebitska+32+udruga+inovatic!3m5!1s0x13355f97d4fbe923:0xf6308445c5650a26!8m2!3d43.5164371!4d16.4561446!15sCh12ZWxlYml0c2thIDMyIHVkcnVnYSBpbm92YXRpY5IBEGVkdWNhdGlvbl9jZW50ZXI`, content: [{ type: 'text', text: `Udruga Inovatic, Lokacija 2 – Velebitska 32, Split`, styles: {} }] },
            { type: 'text', text: `Dob polaznika:`, styles: {'bold': true} },
            { type: 'text', text: ` 10 – 14 godina`, styles: {} },
            { type: 'text', text: `Kontakt e-mail:`, styles: {'bold': true} },
            { type: 'link', href: `mailto:info@zvjezdano-selo.hr`, content: [{ type: 'text', text: `info@udruga-inovatic.hr`, styles: {} }] },
            { type: 'text', text: `Kontakt telefon:`, styles: {'bold': true} },
            { type: 'text', text: ` 0993936993`, styles: {} },
            { type: 'text', text: `Kontakt osoba:`, styles: {'bold': true} },
            { type: 'text', text: ` Jozo Pivac, predsjednik`, styles: {} },
            { type: 'text', text: `*Raspored termina i datuma je prikazan za naredna dva ciklusa u ovoj školskoj godini 2021./2022. s napomenom da se planirani datumi i termini održavanja radionica mogu izmijeniti.`, styles: {'italic': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Raspored po grupama za 1. ciklus`, styles: {'bold': true} },
            { type: 'text', text: `radionica u školskoj godini 2021./2022`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `26.3. | 2.4. | 9.4. | 30.4. | 7.5. | 14.5. | 21.5.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 15:00-16:30`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 16:45-18:15`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Raspored po grupama za 2. ciklus radionica u školskoj godini 2021./2022`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `28.5. | 4.6. | 11.6. | 18.6. | 25.6. | 2.7.`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 15:00-16:30 | SUB 18:00-21:00`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 16:45-18:15 | SUB 18:00-21:00`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `*Za  školsku godini 2022./2023. planiramo organizirati još pet istih ciklusa radionica sa sljedećim okvirnim terminima i datumima:`, styles: {'italic': true} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `3. ciklus | 4. ciklus | 5. ciklus | 6. ciklus`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `rujan – listopad2022. | studeni – prosinac2022. | veljača – ožujak2023. | travanj – svibanj2023.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu djeteta za radionice izvršava roditelj/skrbnik preko ispod navedene prijavne forme. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Broj mjesta je ograničen na osam polaznika unutar svake grupe.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Napomena: Dostupni termini su vidljivi u formi kada odaberete željeni ciklus.`, styles: {'italic': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavna forma:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-03-16'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a43.id, tagId: tagRadionice.id },
    ],
  })

  // [44/69] projekt-bilo-kuda-stem-svuda
  const a44 = await prisma.article.create({
    data: {
      slug: 'projekt-bilo-kuda-stem-svuda',
      title: `Projekt “Bilo kuda STEM svuda”`,
      excerpt: `Udruga za robotiku „Inovatic“ nositelj je projekta pod nazivom “Bilo kuda STEM svuda” kojeg sufinancira Europska unija iz Europskog socijalnog fonda te Ured za udruge Vlade RH. Namijenjen je jačanju kapaciteta organizacija civilnog društva (OCD-a) te popularizaciji STEM-a među mladima. Projekt se...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Udruga za robotiku „Inovatic“ nositelj je projekta pod nazivom “Bilo kuda STEM svuda” kojeg sufinancira Europska unija iz Europskog socijalnog fonda te Ured za udruge Vlade RH. Namijenjen je jačanju kapaciteta organizacija civilnog društva (OCD-a) te popularizaciji STEM-a među mladima. Projekt se provodi kroz više različitih projektnih aktivnosti organiziranih u `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/jednodnevne-radionice/`, content: [{ type: 'text', text: `jednodnevne`, styles: {} }] },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/visednevne-radionice/`, content: [{ type: 'text', text: `višednevne`, styles: {} }] },
            { type: 'text', text: ` radionice: cjelogodišnji ciklusi radionica elementarne robotike, radionice za vrijeme školskih praznika, ljetni kamp te Robotička liga na simulatoru. Provedbom planiranih projektnih aktivnosti cilj je osnažiti kapacitet OCD-a, pojačati međusobnu suradnju između udruga, škola i visoko obrazovnih institucija te popularizacija STEM-a među krajnjim korisnicima projekta – učenicima uzrasta 10-14 godina. Proteklih mjeseci vrijedno radimo na pripremama za početak provedbe planiranih projektnih aktivnosti, a u tome će nam pomoći i naši partneri na projektu. Više informacija o aktivnostima donosimo već sutra kada i otvaramo prve PRIJAVE! Robotika će uskoro postati dostupna svima, jer bilo kuda… Pogodili ste – STEM svuda! `, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-03-15'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656881/articles/covers/projekt-bilo-kuda-stem-svuda.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a44.id, tagId: tagEuProjekt.id },
    ],
  })

  // [45/69] zimske-radionice-robotike-2022
  const a45 = await prisma.article.create({
    data: {
      slug: 'zimske-radionice-robotike-2022',
      title: `Zimske radionice robotike 2022.`,
      excerpt: `U periodu 3.1. – 5.1. 2022. smo održali zimske radionice robotike za osnovnoškolce. Na radionicama je sudjelovalo ukupno 30 polaznika, raspoređenih u dvije dobne skupine zavisno o uzrastu.Mlađi polaznici su izrađivali Lego Spike saonice projekt, a stariji Lego Spike Rudolf projekt.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U periodu `, styles: {} },
            { type: 'text', text: `3.1. – 5.1. 2022.`, styles: {'bold': true} },
            { type: 'text', text: ` smo održali zimske radionice robotike za osnovnoškolce. Na radionicama je sudjelovalo ukupno 30 polaznika, raspoređenih u dvije dobne skupine zavisno o uzrastu.`, styles: {} },
            { type: 'text', text: `Mlađi polaznici su izrađivali `, styles: {} },
            { type: 'text', text: `Lego Spike saonice`, styles: {'bold': true} },
            { type: 'text', text: ` projekt, a stariji `, styles: {} },
            { type: 'text', text: `Lego Spike Rudolf`, styles: {'bold': true} },
            { type: 'text', text: ` projekt.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U tri dana radionica polaznici radionica su kroz igru prošli kroz najvažnije elemente robotike, od izgradnje konstrukcije, povezivanja mehaničkih dijelova, ugradnje elektroničkih motora i senzora pa sve do programiranja projekata da automatizacijom obavljaju određene zadatke.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Program je sufinanciran sredstvima Grada Splita iz Javnog poziva za prijavu programa namijenjenih zadovoljavanju javnih potreba u tehničkoj kulturi Grada Splita za 2022.`, styles: {} },
            { type: 'text', text: `Galeriju slika i dio atmosfere sa radionica pogledajte ovdje`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2022-01-09'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656916/articles/covers/zimske-radionice-robotike-2022.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a45.id, tagId: tagRadionice.id },
    ],
  })

  // [46/69] zavrsetak-izvanskolske-aktivnosti-2020-2021
  const a46 = await prisma.article.create({
    data: {
      slug: 'zavrsetak-izvanskolske-aktivnosti-2020-2021',
      title: `Završetak izvanškolske aktivnosti 2020./2021.`,
      excerpt: `Sa datumom 30. lipnja 2021. smo uspješno završili izvanškolsku aktivnost robotike u ovoj školskoj godini. Veliko nam je zadovoljstvo da je usprkos pandemiji preko 250 djece uspješno završilo izvanškolsku aktivnost u ovoj školskoj godini te zasluženo dobili diplome. Čestitamo svim našim članovima ...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sa datumom 30. lipnja 2021. smo uspješno završili izvanškolsku aktivnost robotike u ovoj školskoj godini. Veliko nam je zadovoljstvo da je usprkos pandemiji preko 250 djece uspješno završilo izvanškolsku aktivnost u ovoj školskoj godini te zasluženo dobili diplome. Čestitamo svim našim članovima koji su vrijedno i marljivo radili ovu godinu te se veselimo novoj školskoj godini u kojoj ćemo pripremiti nove projekte i robote u kojima se nadamo da će naši mladi članovi uživati.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Hvala studentima Pmf-a i našim vrijednim predavačima (Marko Janjiš, Slavica Jurčević, Zvonimir Zubić, Anđela Bazina, Bruno Bešlić, Tina Vicković i Jozo Pivac) što su vrijedno i nesebično cijelu školsku godinu dijelili svoje znanje i trudili se u radu sa našim mladim članovima.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Hvala Gradu Splitu i Hrvatskom robotičkom savezu koji nas podržavaju i sufinanciraju u dijelu provedbe naših izvanškolskih aktivnosti. `, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2021-07-08'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656907/articles/covers/zavrsetak-izvanskolske-aktivnosti-2020-2021.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a46.id, tagId: tagRezultati.id },
    ],
  })

  // [47/69] otvorili-smo-upise-u-nove-grupe-iz-robotike
  const a47 = await prisma.article.create({
    data: {
      slug: 'otvorili-smo-upise-u-nove-grupe-iz-robotike',
      title: `Otvaramo upise u nove grupe na novoj lokaciji!`,
      excerpt: `Zbog velikog interesa za pohađanje naših radionica iz robotike od 16.11.2020. radionice provodimo na još jednoj lokaciji gdje planiramo upisati sve zainteresirane koji se nisu uspjeli upisati u prvom jesenskom krugu. Novi prostor se nalazi u tzv. Plavoj zgradi, poznatoj i kao Anićeva zgrada, na k...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Zbog velikog interesa za pohađanje naših radionica iz robotike od `, styles: {} },
            { type: 'text', text: `16.11.2020`, styles: {'bold': true} },
            { type: 'text', text: `. radionice provodimo na još jednoj lokaciji gdje planiramo upisati sve zainteresirane koji se nisu uspjeli upisati u prvom jesenskom krugu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Novi prostor se nalazi u tzv. Plavoj zgradi, poznatoj i kao Anićeva zgrada, na križanju Velebitske i Bušićeve ulice.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prostor je prostran i klimatiziran te prostorno dobro organiziran sa svim potrebnim uvjetima za provedbu radionica. Prostor ima dva ulaza od kojih je jedan sa sjeverne strane pored označene strelice na slici, a drugi ulaz je sa južne strane zgrade do kojeg se može doći sa autom jer se pored nalazi javno parkiralište.`, styles: {} },
          ],
        },
        {
          type: 'image',
          props: {
            url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773657875/articles/inline/otvorili-smo-upise-u-nove-grupe-iz-robotike/Plava-zgrada.png`,
            caption: ``,
            textAlignment: `left`,
            previewWidth: 512,
          },
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Zbog trenutne epidemiološke situacije vodimo računa o svim potrebnim mjerama poput onih da se prostor redovno prozrači, dezinficira te bude siguran za rad u skladu sa trenutnim epidemiološkim preporukama.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Također da bi djelovali odgovorno i preventivno smanjili smo broj polaznika na `, styles: {} },
            { type: 'text', text: `najviše šest polaznika unutar svake grupe`, styles: {'bold': true} },
            { type: 'text', text: `. Isto tako svakom polazniku osiguravamo zaseban set za robotiku i tablet koji ne dijeli sa drugim polaznicima za vrijeme radionice.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Djeca ovoga uzrasta sukladno epidemiološkim mjerama i preporukama nisu obavezna nositi maskice za vrijeme trajanja radionica.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Upisi u nove grupe se odnose isključivo na nove učenike uzrasta `, styles: {} },
            { type: 'text', text: `6 -11 godina`, styles: {'bold': true} },
            { type: 'text', text: `, koji nemaju dosadašnjeg iskustva s našim cjelogodišnjim planom i programom kojeg smo prilagodili početnicima unutar dvije dobne skupine:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `– Mlađa dobna skupina`, styles: {'bold': true} },
            { type: 'text', text: ` – polaznici podijeljeni u grupe uzrasta `, styles: {} },
            { type: 'text', text: `6 – 8 god `, styles: {'bold': true} },
            { type: 'text', text: `(uključujući i `, styles: {} },
            { type: 'text', text: `predškolce`, styles: {'bold': true} },
            { type: 'text', text: `).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `– Starija dobna skupina`, styles: {'bold': true} },
            { type: 'text', text: ` – polaznici podijeljeni u grupe uzrasta `, styles: {} },
            { type: 'text', text: `9 -11 god`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Alat s kojim ćemo raditi je `, styles: {} },
            { type: 'text', text: `Lego WeDo 2.0`, styles: {'bold': true} },
            { type: 'text', text: ` edukacijski set za robotiku, s tim da će starija dobna skupina izrađivati nešto složenije zadatke. Nešto više o samom alatu možete pogledati na našim web stranicama: `, styles: {} },
            { type: 'link', href: `http://udruga-inovatic.hr/lego-wedo-2-0/`, content: [{ type: 'text', text: `http://udruga-inovatic.hr/lego-wedo-2-0/`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Provedba radionica je zamišljena kao vanškolska aktivnost gdje će polaznici dolaziti jednom tjedno po blok školski sat (90 min) tijekom ove školske godine.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cijena mjesečne članarine iznosi `, styles: {} },
            { type: 'text', text: `200 kn`, styles: {'bold': true} },
            { type: 'text', text: ` za jedno dijete te osiguravamo popust od `, styles: {} },
            { type: 'text', text: `50 kn`, styles: {'bold': true} },
            { type: 'text', text: ` na brata ili sestru.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Planirani početak radionica je `, styles: {} },
            { type: 'text', text: `16.11.2020`, styles: {'bold': true} },
            { type: 'text', text: `. stoga se `, styles: {} },
            { type: 'text', text: `požurite prijaviti i odabrati jedan od ponuđenih termina`, styles: {'bold': true} },
            { type: 'text', text: ` unutar prijavne forme, s tim da ako je određeni termin koji vam odgovara trenutno popunjen, svakako ga možete odabrati u slučaju da netko odustane.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sva eventualna pitanja stojimo vam na raspolaganju putem maila: `, styles: {} },
            { type: 'text', text: `jozo.pivac@udruga-inovatic.hr`, styles: {'bold': true} },
            { type: 'text', text: ` ili na broj mob.: `, styles: {} },
            { type: 'text', text: `099 393 6993`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Veselimo se skorom druženju ?`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Vaš Inovatic team!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika prostora:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Nema odabrana galerija ili galerija je izbrisan.`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-11-01'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a47.id, tagId: tagObavijesti.id },
    ],
  })

  // [48/69] pocele-radionice-robotike-u-novoj-skolskoj-godini-2020-2021
  const a48 = await prisma.article.create({
    data: {
      slug: 'pocele-radionice-robotike-u-novoj-skolskoj-godini-2020-2021',
      title: `Počele su radionice robotike u novoj školskoj godini 2020./2021.`,
      excerpt: `Počeli smo sa radionicama iz robotike u ovoj školskoj godini 2020./21 u kojoj očekujemo puno radnih izazova te zabavnih projekata i natjecanja. Kao i do sada naše stare/nove članove smo rasporedili u raznovrsne programe, prilagođene njihovom uzrastu i znanju. Više o programima i robotima možete p...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Počeli smo sa radionicama iz robotike u ovoj školskoj godini 2020./21 u kojoj očekujemo puno radnih izazova te zabavnih projekata i natjecanja.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kao i do sada naše stare/nove članove smo rasporedili u raznovrsne programe, prilagođene njihovom uzrastu i znanju. Više o programima i robotima možete pogledati u izborniku “PROGRAMI”.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Posebno nam je zadovoljstvo što imamo velik broj naših stalnih članova koji su i ove godine upisali naše programe (mnogi od njih su sada 4. i 5. godina da pohađaju naše radionice).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ove godine smo radionice organizirali u još manjim grupama (do 8 učenika), gdje svaki učenik ima zaseban set iz robotike te laptop/tablet.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Također osim naših standardnih `, styles: {} },
            { type: 'text', text: `LEGO`, styles: {'bold': true} },
            { type: 'text', text: `(`, styles: {} },
            { type: 'text', text: `WeDo i Mindstorms)`, styles: {'bold': true} },
            { type: 'text', text: ` programa otvorili smo i nove programe i alate te naši polaznici mogu sada  programirati: `, styles: {} },
            { type: 'text', text: `Fischertechnik`, styles: {'bold': true} },
            { type: 'text', text: ` sa `, styles: {} },
            { type: 'text', text: `Micro:bit IO F5`, styles: {'bold': true} },
            { type: 'text', text: ` sučeljem te `, styles: {} },
            { type: 'text', text: `Codey Rocky`, styles: {'bold': true} },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'text', text: `Maqueen`, styles: {'bold': true} },
            { type: 'text', text: ` robotska vozila.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Uz sve to koristimo i razne robotske simulatore (`, styles: {} },
            { type: 'text', text: `Miranda`, styles: {'bold': true} },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'text', text: `LEGO VirtualRoboticToolkit`, styles: {'bold': true} },
            { type: 'text', text: `) te smo osim fizičkih radionica omogućili i online te mješovite oblike (tri puta mjesečno online i jednom fizički) pohađanja radionica.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-09-12'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656876/articles/covers/pocele-radionice-robotike-u-novoj-skolskoj-godini-2020-2021.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a48.id, tagId: tagRadionice.id },
      { articleId: a48.id, tagId: tagObavijesti.id },
    ],
  })

  // [49/69] odrzan-cetvrti-ciklus-ljetnih-radionica-robotike-u-kolovozu-2020
  const a49 = await prisma.article.create({
    data: {
      slug: 'odrzan-cetvrti-ciklus-ljetnih-radionica-robotike-u-kolovozu-2020',
      title: `Održan četvrti ciklus ljetnih radionica robotike u kolovozu 2020.`,
      excerpt: `U razdoblju od 17.08.2020. – 21.08.2020. održane su Ljetne radionice robotike u kolovozu na kojima je sudjelovalo dvanaest polaznika, uzrasta 6 do 12 godina.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su bile podijeljene u dvije grupe . Sudionici su u pet dana radionica stvarali jako zanimljive projekte iz robotike, gdje je naglasak bio na poučavanja mladih u robotici (slaganje i programiranje robota).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Od robota, djeca su koristila Lego education setove (Mindstorms i WeDo 2.0), zatim razne Fischertehnik konstrukcijske setove koje su povezivali i programirali sa prilagođenim micro:bit IO F5 sučeljem kao i Maqueen micro:bit robota.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Jutarnje radionice su trajale  svaki dan od 10:00-13:00h,a popodnevne od 17:00-20:00h.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dio vesele atmosfere sa radionica možete pogledati u našoj galeriji slika!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-08-21'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656859/articles/covers/odrzan-cetvrti-ciklus-ljetnih-radionica-robotike-u-kolovozu-2020.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a49.id, tagId: tagRadionice.id },
      { articleId: a49.id, tagId: tagRezultati.id },
    ],
  })

  // [50/69] odrzan-treci-ciklus-ljetnih-radionica-robotike-u-kolovozu-2020
  const a50 = await prisma.article.create({
    data: {
      slug: 'odrzan-treci-ciklus-ljetnih-radionica-robotike-u-kolovozu-2020',
      title: `Održan treći ciklus ljetnih radionica robotike u kolovozu 2020.`,
      excerpt: `U razdoblju od 10.08.2020. – 14.08.2020. održane su Ljetne radionice robotike u kolovozu na kojima je sudjelovalo dvanaest polaznika, uzrasta 7 do 12 godina.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su bile podijeljene u dvije grupe . Polaznici su u pet dana radionica stvarali zanimljive projekte iz robotike, gdje je naglasak bio na poučavanja mladih u robotici (slaganje i programiranje robota).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Od robota djeca su koristila Lego education setove (Mindstorms i WeDo 2.0), zatim razne Fischertehnik konstrukcijske setove koje su povezivali i programirali sa prilagođenim micro:bit IO F5 sučeljem kao i Maqueen micro:bit robota.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Jutarnje radionice su trajale  svaki dan od 10:00-13:00h, dok su popodnevne radionice trajale od 17:00-20:00h.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dio odlične atmosfere sa radionica možete pogledati na snimkama projekata kao i u našoj galeriji slika!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekti sa radionica :`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `1.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1SXLNXSZK6xr_0Sqq-Up7cMRTwaJuCvD_/view?usp=sharing`, content: [{ type: 'text', text: `Lego Mindstorms Ev3-Gorila`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `2.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1SjP3lAosLFCfBUqD9zS0R2Gu0cLC3yx5/view?usp=sharing`, content: [{ type: 'text', text: `Lego Mindstorms Ev3-Gorila`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `3.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1Sum1yesOB5JL82n_3TL9Y4PXTuWIHt5r/view?usp=sharing`, content: [{ type: 'text', text: `Lego Mindstorms Ev3-Gorila`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `4.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1SybG7FH_hkmE--3ZMt1F80dosPg9_UM0/view?usp=sharing`, content: [{ type: 'text', text: `Lego Mindstorms Ev3-Gorila`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `5.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1SX9HX641LYqDjoyKa0reN3JG2iuNI2qs/view?usp=sharing`, content: [{ type: 'text', text: `Lego Mindstorms Ev3-Insekt`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `6.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1Sg6quBJFXlHOUVd_aFiYWLbZQaEyEodz/view?usp=sharing`, content: [{ type: 'text', text: `Lego Mindstorms Ev3-Robotsko vozilo`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `7.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1RzkuxPYI8Inl3465y2S1L1pFUpqmUAzv/view?usp=sharing`, content: [{ type: 'text', text: `Zabavni park-Microbit&Fischertechnik`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `8.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1SUFAHaCAo6W3BZDLpS2dKsWz4_kF1I1v/view?usp=sharing`, content: [{ type: 'text', text: `Zabavni park-Microbit&Fischertechnik`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `9.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1S_XrGf6Bf0tkVvz5oNF-G7gYqzy9Ougc/view?usp=sharing`, content: [{ type: 'text', text: `Zabavni park-Microbit&Fischertechnik`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `10.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1SaWfPZugHiUQ8iW1WM0g9Mn0cPHNOlIK/view?usp=sharing`, content: [{ type: 'text', text: `Zabavni park-Microbit&Fischertechnik`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `11.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1RtJwXHE4GVW_N0KrlsVmKuMDHwZL0sFH/view?usp=sharing`, content: [{ type: 'text', text: `Zabavni park-Microbit&Fischertechnik`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-08-16'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a50.id, tagId: tagRadionice.id },
      { articleId: a50.id, tagId: tagRezultati.id },
    ],
  })

  // [51/69] odrzan-drugi-ciklus-ljetnih-radionica-robotike-2020
  const a51 = await prisma.article.create({
    data: {
      slug: 'odrzan-drugi-ciklus-ljetnih-radionica-robotike-2020',
      title: `Održan drugi ciklus ljetnih radionica robotike 2020.`,
      excerpt: `U razdoblju od 20.07.2020. – 24.07.2020. održane su Ljetne radionice robotike na kojima je sudjelovalo šesnaest polaznika, uzrasta 6 do 12 godina.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su bile podijeljene u dva modela (Model A i Model B). Polaznici su u pet dana radionica stvarali zanimljive projekte iz robotike, gdje je naglasak bio na slaganju i programiranju robota.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Od robota djeca su koristila Lego education setove (Mindstorms i WeDo 2.0), zatim razne Fischertehnik konstrukcijske setove koje su povezivali i programirali sa prilagođenim micro:bit IO F5 sučeljem te su također programirali malo robotsko vozilo Codey Rockey – Makeblock.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Model A radionica je trajao svaki dan od 9-16h (uključujući ručak), a Model B je trajao kraće, od 18-20h.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dio fantastične atmosfere sa radionica možete pogledati na snimkama projekata kao i u našoj galeriji slika!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Upise za novi ciklus radionica koje će se održati u kolovozu možete vidjeti`, styles: {'bold': true} },
            { type: 'link', href: `http://udruga-inovatic.hr/ljetne-radionice-u-kolovozu/`, content: [{ type: 'text', text: `OVDJE`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekti sa radionica (Model A):`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `1.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1CKmQiK_g-VAuvlg4BxifZDlMJTCGX8d-/view?usp=sharing`, content: [{ type: 'text', text: `Lego Mindstorms-prepoznavanje objekata`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `2.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1Jwnk16V1PvrLx52dKScs2XpFiiqgbwSw/view?usp=sharing`, content: [{ type: 'text', text: `Fischertehnik&Microbit-pokretna traka`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `3. `, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1K-edRnx4FgzZ0ao-pYd9bRYD7B0poX2c/view?usp=sharing`, content: [{ type: 'text', text: `Codey Rocky-prepoznavanje boja`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekti sa radionica (Model B):`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `1.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1JwJd7OzJsjzfPmSl-HyR0sx4GuUsV1Ib/view?usp=sharing`, content: [{ type: 'text', text: `Lego WeDo 2.0-Zmija`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `2.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1KCxpaqf4sF2khsQiQSR3pLkmJMg-BTox/view?usp=sharing`, content: [{ type: 'text', text: `Lego WeDo 2.0-Formula`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-07-26'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a51.id, tagId: tagRadionice.id },
      { articleId: a51.id, tagId: tagRezultati.id },
    ],
  })

  // [52/69] ljetne-radionice-robotike-2020-2
  const a52 = await prisma.article.create({
    data: {
      slug: 'ljetne-radionice-robotike-2020-2',
      title: `Održan prvi ciklus ljetnih radionica robotike 2020.`,
      excerpt: `U razdoblju od 13.07.2020. – 17.07.2020. održane su Ljetne radionice robotike na kojima je sudjelovalo sedamnaest polaznika, uzrasta 6 do 12 godina`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju od 13.07.2020. – 17.07.2020. održane su Ljetne radionice robotike na kojima je sudjelovalo sedamnaest polaznika, uzrasta 6 do 12 godina`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su bile podijeljene u dva modela (Model A i Model B). Polaznici su u pet dana radionica stvarali zanimljive projekte iz robotike, gdje je naglasak bio na slaganju i programiranju robota.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Od robota su djeca koristila Lego education setove (Mindstorms i WeDo 2.0), zatim razne Fischertehnik konstrukcijske setove koje su povezivali i programirali sa prilagođenim micro:bit IO F5 sučeljem te su također programirali malo robotsko vozilo Codey Rockey – Makeblock.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Model A radionica je trajao svaki dan 9-16h (uključujući ručak), a Model B je trajao kraće 18-20h.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dio fantastične atmosfere sa radionica možete pogledati na snimkama projekata te u našoj galeriji slika!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Upise za novi ciklus radionica koje će se održati u kolovozu možete vidjeti`, styles: {'bold': true} },
            { type: 'link', href: `http://udruga-inovatic.hr/ljetne-radionice-u-kolovozu/`, content: [{ type: 'text', text: `OVDJE`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekti sa radionica (Model A):`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `1.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1AdH4-saXxvLSfN0Fqe1S1HsrTNP15Uz8/view?usp=sharing`, content: [{ type: 'text', text: `Codey Rocky-Hvatanje lopte`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `https://drive.google.com/file/d/1AcbLLa-tIFg6dMq9Wz1mxQ_2fRjlvaqJ/view?usp=sharing`, content: [{ type: 'text', text: `2. Codey Rocky-Senzor boje`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `3. `, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1ARrjFHLTwUP5wGa1T9rseupCyrD_gmxa/view?usp=sharing`, content: [{ type: 'text', text: `Microbit&Fischertechnik -Vjetrenjača`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `4.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1Aq4b-hqPmGfWzaX_JnIU_9cJSSm-wvxf/view?usp=sharing`, content: [{ type: 'text', text: `Lego Mindstorms Ev3-Staza s bojama`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekti sa radionica (Model B):`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `1. `, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1AlAhgc6jXC5WyINCKwsPMuIzbcvirtxA/view?usp=sharing`, content: [{ type: 'text', text: `Lego WeDo 2.0 Zmija`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `2.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1AlirUFBkASGJ1lsGdkA-rO8nuYC8CZLS/view?usp=sharing`, content: [{ type: 'text', text: `Lego WeDo 2.0 Formula`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `3.`, styles: {} },
            { type: 'link', href: `https://drive.google.com/file/d/1AXQKmZZdt-AhoUwZFVpV78okye_3IzqC/view?usp=sharing`, content: [{ type: 'text', text: `Codey Rocky- Staza s kartama`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-07-19'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a52.id, tagId: tagRadionice.id },
    ],
  })

  // [53/69] ljetne-radionice-robotike-2020
  const a53 = await prisma.article.create({
    data: {
      slug: 'ljetne-radionice-robotike-2020',
      title: `Ljetne radionice robotike 2020.`,
      excerpt: `Pozivamo svu zainteresiranu djecu da se i ovo ljeto pridruže našim radionicama iz robotike te na zabavan i edukativan način upotpune svoje ljetne praznike. Radionice su namijenjene polaznicima uzrasta 6 – 12 g. kojima izazov predstavlja slagati i programirati razne projekte iz robotike.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pozivamo svu zainteresiranu djecu da se i ovo ljeto pridruže našim radionicama iz robotike te na zabavan i edukativan način upotpune svoje ljetne praznike.`, styles: {} },
            { type: 'text', text: `
Radionice su namijenjene polaznicima uzrasta`, styles: {} },
            { type: 'text', text: ` 6 – 12 g.`, styles: {'bold': true} },
            { type: 'text', text: ` kojima izazov predstavlja slagati i programirati razne projekte iz robotike.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice će biti prožete mnogim suvremenim edukacijskim alatima iz robotike namijenjenima prvenstveno poučavanju mladih u robotici poput: `, styles: {} },
            { type: 'text', text: `Lego education, Makeblock, Microbit&Fischertechnik `, styles: {'italic': true} },
            { type: 'text', text: `i drugih sl. robota.`, styles: {} },
            { type: 'text', text: `
Plan i program ljetnih radionica će biti osmišljen kroz izradu i sastavljanje raznih kreativnih robotičkih konstrukcija poput robotskih vozila i nekih drugih tehničkih tvorevina (svaki dan jedan zaseban projekt) kojima će polaznici upravljati tj. programirati ih koristeći programske jezike namijenjene mladima: `, styles: {} },
            { type: 'text', text: `Scratch, Lego education, mBlock i sl.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sve radionice će se održati u prostoru Udruge Inovatic na Prirodoslovno-matematičkom fakultetu u Splitu, Ruđera Boškovića 33.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prvi krug ljetnih radionica će se održati kroz dva ciklusa:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `1. Ciklus: 13.7. – 17.7. (Model A ili Model B)`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `2. Ciklus: 20.7. – 24.7. (Model A ili Model B)`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U svakom od navedenih ciklusu možete odabrati jedno od dva ponuđena modela radionica:`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Model A`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovaj model radionica će se održavati pet dana u tjednu (pon-pet), u terminu `, styles: {} },
            { type: 'text', text: `9:00 – 16:00h`, styles: {'bold': true} },
            { type: 'text', text: `. Cijena za ovaj model iznosi`, styles: {} },
            { type: 'text', text: ` 1250 kn`, styles: {'bold': true} },
            { type: 'text', text: ` po djetetu (20% popust na brata ili sestru).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U cijenu je uključeno`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `– oprema (tablet, laptop i više vrsta robota)`, styles: {} },
            { type: 'text', text: `
– materijali`, styles: {} },
            { type: 'text', text: `
– stručni mentori (treneri)`, styles: {} },
            { type: 'text', text: `
– majica`, styles: {} },
            { type: 'text', text: `
– diploma`, styles: {} },
            { type: 'text', text: `
– svaki dan dogovoreni ručak sa izvrsnom hranom i ugođajem u Zalogajnici Calypso (R. Boškovića 27).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dnevni raspored:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `9:00 – 9:30 Igra i dolazak djece`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `9:30 – 11:00 Jutarnji edukacijski program i radionice`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `11:00 – 11:30 Pauza za razgibavanje, osvježenje i odmor`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `11:30 – 13:00 Nastavak jutarnjih radionica`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `13:00 – 14:00 Pauza za ručak (Zalogajnica Calypso)`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `14:00 – 15:30 Poslijepodnevni program i radionica`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `15:30 – 16:00 Igra i odlazak djece`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Grupa će biti sačinjena od malog broja djece (najviše do osam polaznika) gdje će svaki polaznik imati svoje radno mjesto sa laptopom/tabletom i opremom za robotiku. Sve uvjete na radionicama ćemo provoditi u skladu sa zaštitnim mjerama propisanim od strane Hrvatskog zavoda za javno zdravstvo.`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Model B`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Ovaj model radionica će se održavati pet dana u tjednu (pon-pet), u terminu `, styles: {} },
            { type: 'text', text: `18:00 – 20:00h`, styles: {'bold': true} },
            { type: 'text', text: `. Cijena za ovaj model iznosi `, styles: {} },
            { type: 'text', text: `500 kn`, styles: {'bold': true} },
            { type: 'text', text: ` po djetetu (20% popusta na brata ili sestru).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U cijenu je uključeno:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `– oprema (tablet, laptop i više vrsta robota)`, styles: {} },
            { type: 'text', text: `
– materijali`, styles: {} },
            { type: 'text', text: `
– stručni mentori (treneri)`, styles: {} },
            { type: 'text', text: `
– diploma`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Grupa će biti sačinjena od malog broja djece (najviše do osam polaznika) gdje će svaki polaznik imati svoje radno mjesto sa laptopom/tabletom i opremom za robotiku. Sve uvjete na radionicama ćemo provoditi u skladu sa zaštitnim mjerama propisanim od strane Hrvatskog zavoda za javno zdravstvo.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sva dodatna pitanja stojimo vam na raspolaganju putem naše email adrese: `, styles: {} },
            { type: 'text', text: `info@udruga-inovatic.hr`, styles: {'bold': true} },
            { type: 'text', text: ` ili putem mobitela `, styles: {} },
            { type: 'text', text: `+385958838780`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijave za srpanj su zatvorene!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijavu za kolovoz možete izvršiti`, styles: {'bold': true} },
            { type: 'link', href: `http://udruga-inovatic.hr/ljetne-radionice-u-kolovozu/`, content: [{ type: 'text', text: `OVDJE`, styles: {} }] },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Arhiva radionica iz srpnja 2020.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `"Održan prvi ciklus ljetnih radionica robotike 2020."`, styles: {'italic': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Arhiva prošlogodišnje ljetne radionice 2019.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `"Održan drugi ciklus ljetnih radionica 2019."`, styles: {'italic': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `"Održan prvi ciklus ljetnih radionica 2019."`, styles: {'italic': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-06-22'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a53.id, tagId: tagRadionice.id },
    ],
  })

  // [54/69] rosil
  const a54 = await prisma.article.create({
    data: {
      slug: 'rosil',
      title: `Robotička simulacijska liga (ROSIL)`,
      excerpt: `Udruga Inovatic zajedno sa Hrvatskim robotičkim savezom organizira Robotičku simulacijsku ligu (ROSIL). Online liga je besplatna za sve sudionike, natjecateljskog je karaktera i usmjerena je prema svim udrugama i školama u Hrvatskoj za djecu od 4. do 8. razreda, koje zbog novonastale situacije ni...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Udruga Inovatic `, styles: {'bold': true} },
            { type: 'text', text: `zajedno sa`, styles: {} },
            { type: 'text', text: ` Hrvatskim robotičkim savezom`, styles: {'bold': true} },
            { type: 'text', text: ` organizira `, styles: {} },
            { type: 'text', text: `Robotičku simulacijsku ligu (ROSIL).`, styles: {'bold': true} },
            { type: 'text', text: ` Online liga je besplatna za sve sudionike, natjecateljskog je karaktera i usmjerena je prema svim udrugama i školama u Hrvatskoj za djecu od 4. do 8. razreda, koje zbog novonastale situacije nisu u mogućnosti provoditi tradicionalne radionice iz robotike. Djeca koja su 3. razred i niže, imaju pravo sudjelovanja, ali je isključena mogućnost osvajanja nagrada. Natjecanje se provodi u više kola tijekom školske godine 2019/2020. Nakon završetka svakog kola, sudci će pristupiti ocjenjivanju te će se tablica ažurirati kako rezultati budu stizali. Učenici programiraju u robotskom simulatoru Miranda u programskom jeziku Scratch. U simulaciji će se koristiti robot Edison.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `ROSIL- Rezultati`, styles: {'bold': true} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'link', href: `http://ar.hrobos.hr/2020/05/14/rosil-rezultati/`, content: [{ type: 'text', text: `http://ar.hrobos.hr/2020/05/14/rosil-rezultati/`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za pregled kompletne tablice s rezultatima kola kliknite na:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'link', href: `https://docs.google.com/spreadsheets/d/1wQxNQevO8_-lcct_4X6X6jZN7hWZYNMgMFqxgZYgtkY`, content: [{ type: 'text', text: `https://docs.google.com/spreadsheets/d/1wQxNQevO8_-lcct_4X6X6jZN7hWZYNMgMFqxgZYgtkY`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Poveznica na Mirandu`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'link', href: `https://www.miranda.software/`, content: [{ type: 'text', text: `https://www.miranda.software/`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Materijali i upute za korištenje Mirande`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Robotički priručnik za mentore i učenike`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Video upute vezane uz pristup, korištenje software-a i programiranje robota dostupne su na youtube kanalu HROBOS-a`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'link', href: `https://www.youtube.com/channel/UCV02PFS70pVpFXzBio3XnHA`, content: [{ type: 'text', text: `https://www.youtube.com/channel/UCV02PFS70pVpFXzBio3XnHA`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Peto kolo:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Četvrto kolo:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Treće kolo:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Drugo kolo`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prvo kolo`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pilot kolo`, styles: {'bold': true} },
            { type: 'text', text: `:`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-05-17'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a54.id, tagId: tagEuProjekt.id },
    ],
  })

  // [55/69] online-edukcije-iz-robotike
  const a55 = await prisma.article.create({
    data: {
      slug: 'online-edukcije-iz-robotike',
      title: `Online edukcija iz robotike!`,
      excerpt: `Pokrećemo online edukaciju iz robotike za onu djecu koja žele od doma učiti, stvarati i programirati robote! Aplikacije u obliku raznih simulatora koje ćemo koristiti u online edukaciji su osmišljene prvenstveno za poučavanje djece robotici te im omogućuju da na zabavan i kreativan način izrađuju...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pokrećemo online edukaciju iz robotike za onu djecu koja žele od doma učiti, stvarati i programirati robote!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Aplikacije u obliku raznih simulatora koje ćemo koristiti u online edukaciji su osmišljene prvenstveno za poučavanje djece robotici te im omogućuju da na zabavan i kreativan način `, styles: {} },
            { type: 'text', text: `izrađuju te programiraju razne oblike robota, senzora i motora.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Neke od najznačajnih karakteristika naših simulatora su;`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `programiranje u najrasprostranjenijem programskom jeziku za mlade – `, styles: {} },
            { type: 'text', text: `Scratch`, styles: {'bold': true} },
            { type: 'text', text: `, a za malo naprednije učenike mogućnost programiranja i u`, styles: {} },
            { type: 'text', text: ` Python-u.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Preko sedam vrsta različitih simulacijskih robota koji na realističan način oponašaju svoju namjenu: `, styles: {} },
            { type: 'text', text: `mBot, Lego, Codey Rockey, Dash, Ozobot, Edison, Drons `, styles: {'bold': true} },
            { type: 'text', text: `i dr.,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Mogućnost izrade vlastitog robota od raznih 3D oblika, senzora i motora,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Veliki izbor različitih robotskih staza, arena te igračkih simulacija,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Svakom učeniku će se dodijeliti jedinstveni račun s kojim će se moći u bilo kojem trenutku povezivati sa simulatorom preko web preglednika ili lokalne aplikacije koristeći vlastiti laptop, računalo ili tablet,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Mogućnost online suradnje te dijeljenja zadataka i staza sa drugim učenicima,`, styles: {} },
          ],
        },
        {
          type: 'bulletListItem',
          content: [
            { type: 'text', text: `Svi učenici koji budu sudjelovali u našim online edukacijama će imati konstantan pristup aplikaciji i dodatnim zadacima za vježbu koje će moći izvoditi samostalno u svome slobodnom vremenu.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Planirani početak online edukacija je u travnju ove godine, izvoditi će se jednom tjedno te je planirani završetak u srpnju ove godine.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Termin edukacije će biti jednom tjedno, radnim danom u popodnevnim satima ili subotom, zavisno o dogovoru.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Edukacije su namijenjene prvenstveno učenicima od 9 do 16 godina!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Cijena za sudjelovanje na online edukacijama iznosi `, styles: {} },
            { type: 'text', text: `200 kn`, styles: {'bold': true} },
            { type: 'text', text: ` mjesečno!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Za sve dodatne informacije slobodno nam se obratite putem maila: `, styles: {} },
            { type: 'text', text: `info@udruga-inovatic.hr`, styles: {'bold': true} },
            { type: 'text', text: ` ili na mob: `, styles: {} },
            { type: 'text', text: `099 393 6993`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijava za online edukacije:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'link', href: `/kontakt`, content: [{ type: 'text', text: `Prijavite se putem kontakt forme`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-03-23'),
      coverImage: null,
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a55.id, tagId: tagRadionice.id },
      { articleId: a55.id, tagId: tagObavijesti.id },
    ],
  })

  // [56/69] zimske-radionice-lego-robotike-2020
  const a56 = await prisma.article.create({
    data: {
      slug: 'zimske-radionice-lego-robotike-2020',
      title: `Zimske radionice Lego robotike 2020.`,
      excerpt: `U razdoblju 02.01.2020. – 04.01.2020. su održane Zimske radionica robotike na kojima je sudjelovalo dvadeset i troje polaznika, uzrasta 6 do 9 godina.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 02.01.2020. – 04.01.2020. su održane Zimske radionica robotike na kojima je sudjelovalo dvadeset i troje polaznika, uzrasta 6 do 9 godina.Polaznici su u tri dana radionica stvarali zanimljive Lego projekte gdje je naglasak bio na slaganju lego kockica te programiranju i upravljanju motora i senzora.`, styles: {} },
            { type: 'text', text: `
Nadahnuti zimskim praznicima pripremili smo projekte tematskog sadržaja poput; soba Rudolfa, Djeda Mraza i Skijaša.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dio fantastične atmosfere sa radionica možete pogledati na snimkama projekata te u našoj galeriji slika!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Projekti sa radionica;`, styles: {'bold': true} },
            { type: 'link', href: `https://drive.google.com/open?id=1AFz7e-GY98EGlCmN6gRBJPwnMd21ko5f`, content: [{ type: 'text', text: `Lego WeDo 2.0 Rudolf`, styles: {} }] },
            { type: 'link', href: `https://drive.google.com/open?id=18O8PN7VMFD5ke0HTVxviwfJjJ5c-pTmR`, content: [{ type: 'text', text: `Lego WeDo 2.o Djed Mraz`, styles: {} }] },
            { type: 'link', href: `https://drive.google.com/open?id=16mOmykApAGdfNM0G8cbNmj6CqxXtJxFn`, content: [{ type: 'text', text: `Lego WeDo 2.0 Skijaš`, styles: {} }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika;`, styles: {'bold': true} },
            { type: 'text', text: `«`, styles: {} },
            { type: 'text', text: `‹`, styles: {} },
            { type: 'text', text: `										od										`, styles: {} },
            { type: 'text', text: `											2										`, styles: {} },
            { type: 'link', href: `/wp-json/wp/v2/posts/1705?_fields=content&#038;page_number_0=2`, content: [{ type: 'text', text: `›`, styles: {} }] },
            { type: 'link', href: `/wp-json/wp/v2/posts/1705?_fields=content&#038;page_number_0=2`, content: [{ type: 'text', text: `»`, styles: {} }] },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2020-01-06'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656914/articles/covers/zimske-radionice-lego-robotike-2020.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a56.id, tagId: tagRadionice.id },
    ],
  })

  // [57/69] ljetne-radionice-robotike
  const a57 = await prisma.article.create({
    data: {
      slug: 'ljetne-radionice-robotike',
      title: `Održan drugi ciklus ljetnih radionica 2019.`,
      excerpt: `U razdoblju 19.8. – 30.8.2019.  su održana dva tjedna ciklusa Ljetnih radionica robotike. Na radionicama je ukupno sudjelovalo četrdeset učenika osnovnih škola, podijeljenih u dvije dobne skupine; mlađi uzrast (6-8 g.) i stariji uzrast (9-14 g.)`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 19.8. – 30.8.2019.  su održana dva tjedna ciklusa Ljetnih radionica robotike. Na radionicama je ukupno sudjelovalo četrdeset učenika osnovnih škola, podijeljenih u dvije dobne skupine; mlađi uzrast (6-8 g.) i stariji uzrast (9-14 g.)`, styles: {} },
            { type: 'text', text: `
Polaznici su uz vodstvo naših predavača i asistenata slagali i programirali zanimljive projekte poput humanoidnih robota, raznih robotskih vozila te ostale kreativne projekte iz Lego education i Makeblock robotičkih platformi za djecu.`, styles: {} },
            { type: 'text', text: `
Slagati razne konstrukcije i mehanizme, koristiti elektroničke elemente, motore i senzore te sve to povezivati sa aplikacijom za programiranje i upravljanje robotima je predstavljalo djeci uzbudljive izazove koji su kroz igru, druženje i timski rad uspješno savladali.`, styles: {} },
            { type: 'text', text: `
Osim izrade spomenutih projekata polaznici su sudjelovali u raznim međusobnim natjecanjima poput borbi robota, savladavanju raznih robotskih staza te igre robota nogometaša.`, styles: {} },
            { type: 'text', text: `
Veselimo se nadolazećim zimskim radionicama, a do tada možete pogledati najistaknutija videa i slike sa naših ljetnih radionica 🙂`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Videa:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Robotska ruka:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Mindstorms borbe humanoida:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Wedo borbe humanoida:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Mbot prati crtu i zaobilazi prepreku:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Codey Rocky nogometaši:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Codey Rocky prati boje i zaobilazi prepreku:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Slike:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2019-07-19'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656856/articles/covers/ljetne-radionice-robotike.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a57.id, tagId: tagRadionice.id },
    ],
  })

  // [58/69] odrzan-prvi-ciklus-ljetnih-radionica-2019
  const a58 = await prisma.article.create({
    data: {
      slug: 'odrzan-prvi-ciklus-ljetnih-radionica-2019',
      title: `Održan prvi ciklus ljetnih radionica 2019.`,
      excerpt: `U razdoblju 1.7.2019. – 5.7.2019. je održan prvi ciklus Ljetnih radionica robotike na kojem je sudjelovalo četrdesetak učenik osnovnih škola, podijeljenih u dvije dobne skupine.`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U razdoblju 1.7.2019. – 5.7.2019. je održan prvi ciklus Ljetnih radionica robotike na kojem je sudjelovalo četrdesetak učenik osnovnih škola, podijeljenih u dvije dobne skupine.`, styles: {} },
            { type: 'text', text: `
Učenici su uz vodstvo naših predavača slagali i programirali zanimljive Lego projekte koje možete vidjeti u našoj galeriji slika sa ljetnih radionica.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2019-07-10'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656862/articles/covers/odrzan-prvi-ciklus-ljetnih-radionica-2019.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a58.id, tagId: tagRadionice.id },
      { articleId: a58.id, tagId: tagRezultati.id },
    ],
  })

  // [59/69] proljetne-radionice-lego-robotike-2019
  const a59 = await prisma.article.create({
    data: {
      slug: 'proljetne-radionice-lego-robotike-2019',
      title: `Proljetne radionice Lego robotike 2019.`,
      excerpt: ``,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Održali smo `, styles: {} },
            { type: 'text', text: `Proljetne radionice Lego robotike`, styles: {'bold': true} },
            { type: 'text', text: ` na splitskom `, styles: {} },
            { type: 'text', text: `Pmf-u`, styles: {'bold': true} },
            { type: 'text', text: `, od `, styles: {} },
            { type: 'text', text: `23.travnja `, styles: {'bold': true} },
            { type: 'text', text: `do`, styles: {} },
            { type: 'text', text: ` 25. travnja 2019.`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na radionicama je sudjelovalo ukupno četrdeset i dva učenika osnovnoškolskog uzrasta (6-10 g), podijeljenih u četiri grupe.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su vodili predavači `, styles: {} },
            { type: 'text', text: `Jozo Pivac`, styles: {'bold': true} },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'text', text: `Marko Janjiš`, styles: {'bold': true} },
            { type: 'text', text: `.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Učenici su kroz tri dana radionica uspješno izgradili Lego projekt pod nazivom „`, styles: {} },
            { type: 'text', text: `Robo bojač`, styles: {'bold': true} },
            { type: 'text', text: `“, robot koji je imao zadatak automatizacijom pomoći učenicima u bojanju i ukrašavanju pisanica.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Edukacijski alati koji su se koristili na radionicama su `, styles: {} },
            { type: 'text', text: `Lego Education WeDo 2.0`, styles: {'bold': true} },
            { type: 'text', text: ` setovi za robotiku i tableti koji su učenicima služili za programiranje i upravljanje robotom.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Učenici su radili u parovima te su kroz tri dana radionica imali razne izazove poput slaganja Lego konstrukcija robota, savladavanje mehanizama i prijenosa gibanja, upoznavanje sa osnovama rada motora i senzora te su posebni izazov učenici imali prilikom programiranja te upravljanja robotom da na što kreativniji i produktivniji način izrade pisanice.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dobre zabave i kreativnosti nije nedostajalo, a neke najzanimljivije trenutke sa radionica možete pogledati u našim video i slikovnim zapisima 🙂`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Sa radionica:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `
Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2019-04-29'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656887/articles/covers/proljetne-radionice-lego-robotike-2019.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a59.id, tagId: tagRadionice.id },
    ],
  })

  // [60/69] 1082
  const a60 = await prisma.article.create({
    data: {
      slug: '1082',
      title: `Zimske radionice Lego robotike 2018./2019.`,
      excerpt: ``,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Održane su `, styles: {} },
            { type: 'text', text: `Zimske radionice LEGO robotike`, styles: {'bold': true} },
            { type: 'text', text: ` na splitskom PMF-u za osnovnoškolce!`, styles: {} },
            { type: 'text', text: `
Period održavanja radionica je proveden kroz dva ciklusa; 27.12.2018 – 29.12.2018 i 03.1.2019. – 05.01.2019.
Radionice su bile namijenjene učenicima od 6 do 14 godina, a podijeljeni su bili u mlađu i stariju `, styles: {'bold': true} },
            { type: 'text', text: `dobnu skupinu.`, styles: {} },
            { type: 'text', text: `
Ukupno je na zimskim radionicama bilo pedesetak učenika, podijeljenih u pet grupa.`, styles: {} },
            { type: 'text', text: `
Obje dobne skupine su imali projektni zadatak izraditi Lego robota u obliku soba sa dodatnim lego saonicama.`, styles: {} },
            { type: 'text', text: `
Mlađa dobna skupina je koristila `, styles: {} },
            { type: 'text', text: `Lego WeDo 2.0`, styles: {'bold': true} },
            { type: 'text', text: ` edukacijski alat za robotiku, a starija dobna skupina učenika je koristila nešto napredniji `, styles: {} },
            { type: 'text', text: `Lego Mindstorms Ev3`, styles: {'bold': true} },
            { type: 'text', text: ` edukacijski alat.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Učenici su kroz igru rješavali projektne zadatke te tako ovladali osnovama rada i upravljanja motora i senzora te početnim znanjima iz programiranja.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Neke najzanimljivije trenutke sa radionica možete pogledati u našoj galeriji slika 🙂`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2018-12-13'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656834/articles/covers/1082.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a60.id, tagId: tagRadionice.id },
    ],
  })

  // [61/69] lego-mindstorms-radionice-robotike
  const a61 = await prisma.article.create({
    data: {
      slug: 'lego-mindstorms-radionice-robotike',
      title: `Ljetne radionice Lego robotike 2018.`,
      excerpt: ``,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Održane su `, styles: {} },
            { type: 'text', text: `Ljetne radionice LEGO robotike`, styles: {'bold': true} },
            { type: 'text', text: ` na splitskom PMF-u za osnovnoškolce!`, styles: {} },
            { type: 'text', text: `
Održane radionice su provedene kroz ukupno tri ciklusa radionica;`, styles: {} },
            { type: 'text', text: ` 27.06. – 29.06.`, styles: {'bold': true} },
            { type: 'text', text: `, `, styles: {} },
            { type: 'text', text: `27.8. – 31.08.`, styles: {'bold': true} },
            { type: 'text', text: ` i `, styles: {} },
            { type: 'text', text: `03.09. – 07.09.2018.`, styles: {'bold': true} },
            { type: 'text', text: `
Radionice su bile namijenjene učenicima od `, styles: {} },
            { type: 'text', text: `6`, styles: {'bold': true} },
            { type: 'text', text: ` do`, styles: {} },
            { type: 'text', text: ` 14 godina`, styles: {'bold': true} },
            { type: 'text', text: `, a podijeljeni su bili u mlađu i stariju dobnu skupinu.`, styles: {} },
            { type: 'text', text: `
Ukupno je na ljetnim radionicama bilo pedesetak učenika, podijeljenih u pet grupa.`, styles: {} },
            { type: 'text', text: `
Obje dobne skupine su imali projektne zadatake unutar kojih su izrađivali razne korisne tehničke tvorevine u obliku Lego robota, poput helikoptera za spašavanje unesrećenih, kamiona za recikliranje otpada, vatrogasna vozila i sl.`, styles: {} },
            { type: 'text', text: `
Mlađa dobna skupina je koristila `, styles: {} },
            { type: 'text', text: `Lego WeDo 2.0`, styles: {'bold': true} },
            { type: 'text', text: ` edukacijski alat za robotiku, a starija dobna skupina učenika je koristila nešto napredniji `, styles: {} },
            { type: 'text', text: `Lego Mindstorms Ev3`, styles: {'bold': true} },
            { type: 'text', text: ` edukacijski alat.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Neke najzanimljivije trenutke sa radionica možete pogledati u našim videima i slikama 🙂`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Helikopter za spašavanje:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `
Kamion za recikliranje otpada:`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Galerija slika:`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2018-08-29'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656850/articles/covers/lego-mindstorms-radionice-robotike.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a61.id, tagId: tagRadionice.id },
    ],
  })

  // [62/69] festival-znanosti-2018
  const a62 = await prisma.article.create({
    data: {
      slug: 'festival-znanosti-2018',
      title: `Festival znanosti 2018.`,
      excerpt: ``,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Povodom Festivala znanosti ove godine organiziramo besplatne radionice iz robotike.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Tema ovogodišnjeg Festivala znanosti je “Upoznajmo svijet oko nas” gdje će učenici imati priliku koristeći tehnologiju upoznati neke prirodne karakteristike svijeta koji nas okružuje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na radionicama će učenici imati priliku koristiti micro:bit uređaje te ih na lagan i zabavan način programirati da prepoznaju i prikažu razne vrijednosti okoline. Za to su nam potrebni razni senzori koje micro:bit koristi poput senzora za temperaturu, svjetlost, pokret i magnetska polja.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionica će se održati 19.04. na Prirodoslovno matematičkom fakultetu Split, na adresi Ruđera Boškovića 33. (učionica Udruge Inovatic).`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionica je namijenjene svim radoznalim učenicima osnovnoškolskog uzrasta od 4. do 7. razreda.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Voditelji radionice su; doc.dr.sc. Vladimir Pleština, prof, doc.dr.sc. Stjepan Kovačević, prof i Jozo Pivac, prof.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Broj mjesta je ograničen te će se u obzir uzimati vremenski slijed prijava!`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2018-04-15'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656847/articles/covers/festival-znanosti-2018.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a62.id, tagId: tagRezultati.id },
    ],
  })

  // [63/69] proljetne-radionice-lego-robotike-2018-2
  const a63 = await prisma.article.create({
    data: {
      slug: 'proljetne-radionice-lego-robotike-2018-2',
      title: `Proljetne radionice Lego robotike 2018.`,
      excerpt: ``,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Održali smo `, styles: {} },
            { type: 'text', text: `Proljetne radionice iz robotike`, styles: {'bold': true} },
            { type: 'text', text: ` na splitskom Pmf-u, u razdoblju od 04.travnja do 06.travnja.2018.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na radionicama je sudjelovalo ukupno četrdesetak  učenika osnovnoškolskog uzrasta (7-10 g) podijeljenih u četiri grupe.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Učenici su kroz tri dana radionica uspješno izgradili Lego projekt „`, styles: {} },
            { type: 'text', text: `Robot za bojanje i izradu pisanica`, styles: {'bold': true} },
            { type: 'text', text: `“ te izradili kreativne i zanimljive pisanice.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Dobre zabave i kreativnosti nije nedostajalo, a posebni izazov su učenici imali prilikom grafičkog programiranja kako bi što bolje upravljali njihovim robotom. Također su stekli razna druga robotička znanja poput razumijevanja načina rada i upravljanja motorima i senzorima.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `U svakoj grupi je nagrađen po jedan najuspješniji učenik sa lego poklon paketom 🙂`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Kratki video zapisi sa radionica;`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Galerija slika sa radionica;`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2018-04-10'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656885/articles/covers/proljetne-radionice-lego-robotike-2018-2.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a63.id, tagId: tagRadionice.id },
    ],
  })

  // [64/69] zimske-radionice-lego-robotike
  const a64 = await prisma.article.create({
    data: {
      slug: 'zimske-radionice-lego-robotike',
      title: `Zimske radionice Lego robotike 2018.`,
      excerpt: ``,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Zimske radionice LEGO robotike 2018. održane su u udruzi za robotiku INOVATIC u razdoblju od 27.12.2017 do 29.12.2017. i od 03.01.2018. do 05.01.2018.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Na radionicama je sudjelovalo oko 60 učenika osnovnoškolskog uzrasta koji su uz vodstvo profesora Joze Pivac  zakoračili u svijet lego robotike.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Učenici su kroz predviđena tri dana radionica uspješno izgradili od lego kockica Djeda Mraza na saonicama sa pokretnim sobovima. Osim razvijanja kreativnosti u slaganju kockica učenici su i naučili kako se koristiti računalnim i grafičkim programiranjem pomoću kojeg su upravljali svojim lego kreacijama satavljenima od elektromotora, senzora za udaljenost i nagibnog senzora.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Učenici su kroz igru, učenje i interakciju savladali razne tehničke, konstrukcijske i programerske vještine te uspješno savladali početne izazove edukacijske robotike.`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Pogledajte u našem videu djeličak atmosfere sa radionica:`, styles: {} },
          ],
        },
        {
          type: 'heading',
          props: {
            level: 3,
          },
          content: [
            { type: 'text', text: `Galerija fotografija sa radionica:`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2018-01-12'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656915/articles/covers/zimske-radionice-lego-robotike.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a64.id, tagId: tagRadionice.id },
    ],
  })

  // [65/69] radionice-robotike-za-djecu-zaposlenika-ht-a
  const a65 = await prisma.article.create({
    data: {
      slug: 'radionice-robotike-za-djecu-zaposlenika-ht-a',
      title: `Radionice robotike za djecu zaposlenika HT-a`,
      excerpt: `Održali smo radionice iz robotike za djecu zaposlenika HT-a. Radionice robotike, u suradnji s Croatian Makersom i partnerima su održane u ciklusu od četiri subote u Udruzi Inovatic na Pmf-u Split. Polaznici su se upoznali sa osnovama robotike koristeći micro-bit, maleno programabilno računalo, uz...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Održali smo radionice iz robotike za djecu zaposlenika HT-a. Radionice robotike, u suradnji s Croatian Makersom i partnerima su održane u ciklusu od četiri subote u Udruzi Inovatic na Pmf-u Split.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Polaznici su se upoznali sa osnovama robotike koristeći micro-bit, maleno programabilno računalo, uz koje učenje postaje jednostavno i zabavno!`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Uz micro:bit, djeca su se upoznala i sa radom mBot robota. Naučili su programirati kretnje robota, koristiti senzore za prepoznavanje crne i bijele boje.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pogledajte galeriju slika sa radionica;`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2017-10-06'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656892/articles/covers/radionice-robotike-za-djecu-zaposlenika-ht-a.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a65.id, tagId: tagRadionice.id },
    ],
  })

  // [66/69] proljetna-skola-lego-robotike
  const a66 = await prisma.article.create({
    data: {
      slug: 'proljetna-skola-lego-robotike',
      title: `Proljetna škola Lego robotike 2017.`,
      excerpt: `Kako nam se bliže uskrsni praznici za vrijeme kojih sudjelujemo u brojnim slavljima i inspirirani smo raznim aktivnostima i udruga Inovatic je za vas pripremila zanimljive i kreativne aktivnosti. Najistaknutija aktivnost je zasigurno bojanje uskrsnih jaja, koja se uređuju različitim, često vrlo d...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Kako nam se bliže uskrsni praznici za vrijeme kojih sudjelujemo u brojnim slavljima i inspirirani smo raznim aktivnostima i udruga Inovatic je za vas pripremila zanimljive i kreativne aktivnosti. Najistaknutija aktivnost je zasigurno bojanje uskrsnih jaja, koja se uređuju različitim, često vrlo detaljnim i ukrašenim uzorcima.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Inspirirani nadolazećim uskrsnim blagdanima za vas smo pripremili radionice u kojima ćete imati priliku pomoću Lego Mindstorms EV3 kompleta napraviti automatskog dekoracijskog robota te ga programirati da na što kreativniji način oboji uskrsna jaja.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice su namijenjene učenicima osnovnih škola.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Radionice će se održati na Prirodoslovno-matematičkom fakultetu – Split, u prostoru Udruge Inovatic, na adresi Ruđera Boškovića 33, u terminu od 18.04.2017. do 20.04.2017 u vremenu od 9:00h do 11:00h.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2017-04-07'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656884/articles/covers/proljetna-skola-lego-robotike.png',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a66.id, tagId: tagRadionice.id },
    ],
  })

  // [67/69] druga-zimska-skola-lego-robotike
  const a67 = await prisma.article.create({
    data: {
      slug: 'druga-zimska-skola-lego-robotike',
      title: `Zimska škola lego robotike`,
      excerpt: `Održana je druga Zimska škola LEGO robotike za osnovnoškolce u periodu 09.01. – 11.01. Učenici su u tri dana škole pod vodstvom mentora prošli tri faze robotike. Prvi dan je bio gradivni gdje su učenici od lego kockica sastavljali konstrukcije Djeda Mraza, saonica i sobova. Drugi su dan povezival...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Održana je druga Zimska škola LEGO robotike za osnovnoškolce u periodu 09.01. – 11.01. Učenici su u tri dana škole pod vodstvom mentora prošli tri faze robotike. Prvi dan je bio gradivni gdje su učenici od lego kockica sastavljali konstrukcije Djeda Mraza, saonica i sobova. Drugi su dan povezivali lego kockice sa računalom i učili o upravljanju i programiranju. Treći dan je bio za testiranje i natjecanje u kojem su najuspješniji učenici dobili i prikladne nagrade. Drago nam je da smo Zimskom školom uspjeli zainteresirati robo mališane i potaknuti ih da kroz igru zakorače u svijet robotike koji pruža skup prirodnih, tehničkih i znanstvenih disciplina koje nas čine radoznalim i inovativnim.`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2017-01-14'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656843/articles/covers/druga-zimska-skola-lego-robotike.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a67.id, tagId: tagRadionice.id },
    ],
  })

  // [68/69] kras-razveselio-nase-malisane-poklonima
  const a68 = await prisma.article.create({
    data: {
      slug: 'kras-razveselio-nase-malisane-poklonima',
      title: `Kraš razveselio naše mališane poklonima`,
      excerpt: `Učenici su u prekrasnoj blagdanskoj atmosferi slagali lego saonice od kockica te programirali sobove da uspješno djedicu dovedu do cilja sa darovima. Da bi veselje bilo još veće KRAŠ je našim robo mališanima donirao po poklon paket koji ih je dodatno razveselio i zato im veliko hvala! Također naj...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Učenici su u prekrasnoj blagdanskoj atmosferi slagali lego saonice od kockica te programirali sobove da uspješno djedicu dovedu do cilja sa darovima. Da bi veselje bilo još veće KRAŠ je našim robo mališanima donirao po poklon paket koji ih je dodatno razveselio i zato im veliko hvala! Također najuspješnijim učenicima smo darovali  majice i diplome za njihov rad i trud u ovoj godini. Vidimo se opet u novoj godini sa novim izazovima. Vaš INOVATIC team!`, styles: {} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2016-12-23'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656849/articles/covers/kras-razveselio-nase-malisane-poklonima.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a68.id, tagId: tagRadionice.id },
    ],
  })

  // [69/69] zimska-skola-lego-robotike
  const a69 = await prisma.article.create({
    data: {
      slug: 'zimska-skola-lego-robotike',
      title: `Zimska škola Lego robotike 2017.`,
      excerpt: `Pozivamo sve osnovnoškolce koji vole slagati LEGO kockice i ROBOTIKA im predstavlja izazov da se prijave na Zimsku školu LEGO robotike.  Učenici će imati priliku slagati lego konstrukcije božićnih saonica, Djeda Božićnjaka i druge slične božićne konstrukcije koje će zatim programirati pomoću raču...`,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Pozivamo sve osnovnoškolce koji vole slagati LEGO kockice i ROBOTIKA im predstavlja izazov da se prijave na Zimsku školu LEGO robotike.  Učenici će imati priliku slagati lego konstrukcije božićnih saonica, Djeda Božićnjaka i druge slične božićne konstrukcije koje će zatim programirati pomoću računala da izvršavaju određene zadatke i izazove poput vožnje saonica po snježnoj stazi uz razne prepreke, nebi li Djed Božićnjak što prije došao do cilja sa darovima. Udruga INOVATIC će naposljetku organizirati natjecanje gdje će najspretnije i najsretnije nagraditi određenim prigodnim darovima. Učenici će raditi u paru te svaki par će imati svoje računalo i LEGO opremu. Voditelji radionice su profesori Jozo Pivac i Goran Samardžić.`, styles: {} },
            { type: 'text', text: `
Radionica će se održati u prostoru Udruge INOVATIC na splitskom PMF-u  u periodu od 02. siječnja do 05. siječnja 2017. g u teminima od 17:00h do 19:00h. Broj prijava je ograničen. Cijena kotizacije za radionicu iznosi 250 kn. Prijavu za radionicu ispunite putem dolje navedene prijavne forme.`, styles: {} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Prijave zatvorene zbog ograničenog broja prijava!`, styles: {'bold': true} },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Forma za prijavu`, styles: {'bold': true} },
          ],
        },
      ],
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2016-12-05'),
      coverImage: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656911/articles/covers/zimska-skola-lego-robotike.jpg',
    },
  })

  await prisma.articleTag.createMany({
    data: [
      { articleId: a69.id, tagId: tagRadionice.id },
    ],
  })


  // Suppress unused variable warnings
  void slr2
  void slr3

  console.log('✅ Articles and tags seeded (69 articles)')

  console.log('')
  console.log('🎉 Seed complete!')
  console.log('')
  console.log('Demo accounts:')
  console.log('  Admin:   jozo@udruga-inovatic.hr    / admin123')
  console.log('  Teacher: snjezana@udruga-inovatic.hr / teacher123')
  console.log('  Student: ucenik@udruga-inovatic.hr  / student123')
  console.log('')
  console.log('📸 Run npm run db:seed-images to set cover images from public/images/articles/')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
