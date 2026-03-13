import { PrismaClient, CourseLevel, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

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

  // ── Demo article ─────────────────────────────────────────────────────────────
  await prisma.article.create({
    data: {
      slug: 'wro-srebro-singapore-2025',
      title: 'Tim CroSpec osvoji srebro na WRO finalima u Singapuru!',
      excerpt: 'Naši polaznici iz tima CroSpec nastupili su na World Robot Olympiad 2025 u Singapuru i osvoji srebrnu medalju u kategoriji.',
      content: `<p>S velikim ponosom objavljujemo da je naš tim <strong>CroSpec</strong> nastupio na World Robot Olympiad (WRO) 2025 u Singapuru i <strong>osvojio srebrnu medalju</strong>!</p>
<p>Tim se sastojao od naših polaznika koji su godinama trenirali na tečajevima Inovatic, a ovaj uspjeh kruna je njihovog predanog rada i truda.</p>
<p>WRO je jedno od najprestižnijih robotičkih natjecanja na svijetu, a naš tim se borio s najboljim timovima iz cijelog svijeta.</p>
<p>Čestitamo svim članovima tima i njihovim roditeljima na ovom nevjerojatnom uspjehu!</p>`,
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date('2025-11-15'),
    },
  })

  console.log('✅ Demo article created')

  console.log('')
  console.log('🎉 Seed complete!')
  console.log('')
  console.log('Demo accounts:')
  console.log('  Admin:   jozo@udruga-inovatic.hr    / admin123')
  console.log('  Teacher: snjezana@udruga-inovatic.hr / teacher123')
  console.log('  Student: ucenik@udruga-inovatic.hr  / student123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
