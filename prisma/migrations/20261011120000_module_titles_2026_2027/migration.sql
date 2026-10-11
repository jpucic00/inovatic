-- Module titles and descriptions for 2026./2027. (SLR 1–4), renamed IN PLACE.
--
-- Matched by program slug + position (sortOrder), never by the old title:
-- a module row's position is what its ModuleSchedule windows, ModuleEnrollments
-- and per-module paid marks hang off, and its materials, lessons and gallery
-- already follow the new order (SLR 2 slot 1 holds "1. Sova", SLR 4 slot 1
-- "1. Polagač mosta"). No row is created, deleted or moved, so nothing attached
-- to a module changes owner. Titles are not matched because they were not
-- always the courses-data.ts spelling in every database ("Modul N – …").
--
-- Text is generated from src/lib/courses-data.ts, so db:seed:programs finds
-- every module by its new title afterwards and creates nothing.

DO $$
DECLARE
  bad TEXT;
BEGIN
  SELECT string_agg(c."slug", ', ') INTO bad
  FROM "Course" c
  WHERE c."slug" IN ('slr-1', 'slr-2', 'slr-3', 'slr-4')
    AND (
      SELECT array_agg(m."sortOrder" ORDER BY m."sortOrder")
      FROM "CourseModule" m WHERE m."courseId" = c."id"
    ) IS DISTINCT FROM ARRAY[1, 2, 3, 4];
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'module_titles_2026_2027: expected exactly one module at each position 1-4 in: %', bad;
  END IF;
END $$;

-- Svijet LEGO Robotike 1
UPDATE "CourseModule" SET "title" = $txt$Zabavni sustavi 1.0$txt$, "description" = $txt$Kako nastaju tehnološke igračke i interaktivni sustavi koji nas zabavljaju?

U ovom modulu djeca kroz robotiku istražuju kako nastaju sustavi koji reagiraju na korisnika i stvaraju pokret. Uče kako kombinacijom motora i senzora mogu "oživjeti" svoje modele i pretvoriti ih u interaktivne atrakcije.

Izgradnjom projekata poput vrtuljka, panoramskog kotača i štanda s grickalicama, polaznici upoznaju osnovne principe mehanike, prijenosa gibanja i rada senzora. Poseban naglasak stavlja se na kreativnost – djeca ne samo da slijede upute, već se potiču da osmisle vlastite verzije i nadogradnje projekata.

Kroz ovaj modul razvijaju razumijevanje razlike između pasivnih i interaktivnih sustava te prvi put doživljavaju kako njihova ideja postaje funkcionalan model.$txt$
WHERE "sortOrder" = 1 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-1');

UPDATE "CourseModule" SET "title" = $txt$Prometni sustavi 1.0$txt$, "description" = $txt$Promet je jedan od ključnih sustava modernog društva.

U ovom modulu djeca kroz praktične projekte upoznaju kako funkcioniraju prometni sustavi i koja je uloga tehnologije u svakodnevnom kretanju ljudi i robe – na kopnu, na vodi i u zraku.

Gradnjom i programiranjem različitih vozila, poput riječnog trajekta, taksija i helikoptera, polaznici istražuju pojmove brzine, smjera kretanja, skretanja i upravljanja. Uče kako programirati robota da se kreće na određeni način te kako prilagoditi njegovo ponašanje različitim situacijama.

Osim tehničkih znanja, djeca razvijaju i svijest o važnosti sigurnosti u prometu te razumiju kako tehnologija doprinosi organizaciji i učinkovitosti prometnih sustava.$txt$
WHERE "sortOrder" = 2 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-1');

UPDATE "CourseModule" SET "title" = $txt$Sportski i igraći sustavi 1.0$txt$, "description" = $txt$Kako robotika može postati dio sporta i igre?

U ovom modulu djeca kroz omiljene sportove i igre otkrivaju kako motori, senzori i jednostavni mehanizmi mogu pokretati, usmjeravati i pratiti tijek igre.

Izgradnjom projekata poput mini golfa, kuglanja i flipera, polaznici upoznaju rad udarnih poluga, rampi i pomičnih prepreka te uče kako programom podesiti brzinu i smjer gibanja. Senzorima boje i nagiba robot svjetlom ili zvukom javlja je li cilj postignut.

Kroz ovaj modul djeca uče uspoređivati različite postavke istog mehanizma i otkrivaju kako jedna promjena utječe na rezultat. Pritom razvijaju preciznost, strpljenje i naviku da svoje rješenje isprobaju, provjere i poboljšaju.$txt$
WHERE "sortOrder" = 3 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-1');

UPDATE "CourseModule" SET "title" = $txt$Pametni sustavi 1.0$txt$, "description" = $txt$Kako roboti mogu pomagati u svakodnevnom životu?

Pametni uređaji sve su prisutniji oko nas. U ovom modulu djeca istražuju kako motori, senzori i program zajedno stvaraju pomagala koja sama reagiraju i obavljaju korisne zadatke.

Izgradnjom i programiranjem modela poput stroja za pozdravljanje, čudovišta za otpad i robota pomagača, polaznici uče programirati ponavljajuće pokrete, otvaranje i zatvaranje te kretanje po zadanoj ruti. Uče i kako senzor prepoznaje predmete i pokreće odgovarajuću reakciju.

Kao završni modul prve razine, ovaj modul potiče samostalnost. Djeca sve više programe slažu sama, uz manje pomoći trenera, i razumiju kako tehnologija može olakšati svakodnevne zadatke.$txt$
WHERE "sortOrder" = 4 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-1');

-- Svijet LEGO Robotike 2
UPDATE "CourseModule" SET "title" = $txt$Biorobotički sustavi 1.0$txt$, "description" = $txt$Kako priroda nadahnjuje robote?

Životinje se kreću, reagiraju na zvukove i prepoznaju svoju okolinu, a inženjeri te sposobnosti prenose u robote. U ovom modulu djeca kroz robotiku istražuju kako oponašati pokrete i ponašanje živih bića.

Izgradnjom projekata poput sove, konja i gnijezda s ptićima, polaznici otkrivaju kako se vrtnja motora pomoću poluga i bregova pretvara u mahanje krilima, njihanje ili podizanje. Uče programirati robota da reagira na zvuk ili boju, baš kao što životinje reagiraju na podražaje iz okoline.

Kroz ovaj modul djeca razvijaju razumijevanje mehaničkih prijenosa i senzorskog upravljanja te otkrivaju vezu između prirode, znanosti i tehnologije.$txt$
WHERE "sortOrder" = 1 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-2');

UPDATE "CourseModule" SET "title" = $txt$Prometni sustavi 2.0$txt$, "description" = $txt$Kako tehnologija oblikuje moderan promet i povezanost svijeta?

U ovom modulu djeca istražuju naprednije oblike prometa i tehnološka rješenja koja omogućuju upravljanje vozilima i letjelicama.

Kroz izgradnju i programiranje modela poput simulatora letenja, simulatora utrke i robotskog miša, polaznici uče kako se letjelicom upravlja naginjanjem upravljača i kako svjetlosni signali vode start utrke. Uče i kako isplanirati i programirati rutu kojom robot samostalno prolazi.

Djeca razvijaju razumijevanje složenijih sustava upravljanja, preciznosti i kontrole, ali i važnosti prometa za kvalitetu života u modernim gradovima.$txt$
WHERE "sortOrder" = 2 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-2');

UPDATE "CourseModule" SET "title" = $txt$Industrijski sustavi 2.0$txt$, "description" = $txt$Kako funkcionira moderna industrija i automatizacija?

U ovom modulu polaznici ulaze u svijet naprednijih industrijskih sustava i procesa koji pokreću današnje gospodarstvo.

Kroz projekte poput dizalice, razvrstavača boja i transportera, djeca uče kako strojevi podižu, prenose i razvrstavaju materijale. Otkrivaju kako senzor može odlučiti kamo predmet treba ići i kako sustav bilježi koliko je predmeta kroz njega prošlo.

Naglasak je na razumijevanju preciznosti, ponovljivosti i učinkovitosti – ključnih elemenata moderne proizvodnje. Djeca kroz praktičan rad razvijaju sposobnost rješavanja složenijih problema i razumiju kako robotika ima stvarnu primjenu u industriji.$txt$
WHERE "sortOrder" = 3 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-2');

UPDATE "CourseModule" SET "title" = $txt$Zabavni sustavi 2.0$txt$, "description" = $txt$Kako nastaju napredni interaktivni sustavi koji nas zabavljaju?

U ovom modulu djeca produbljuju svoje razumijevanje zabavne tehnologije i prelaze iz uloge korisnika u ulogu kreatora. Kroz robotiku istražuju kako osmisliti sustave koji reagiraju, komuniciraju i pružaju interakciju korisniku.

Kroz projekte poput elektroničke kocke, letećeg vrtuljka i brojača bodova, polaznici uče kako kombinirati mehaniku, senzore i programiranje kako bi dobili željeno ponašanje robota – od nasumičnog bacanja kocke do praćenja rezultata igre. Poseban naglasak stavlja se na samostalno osmišljavanje rješenja i razvoj vlastitih ideja, uključujući i projekt po slobodnom izboru.

Ovaj modul potiče kreativnost, ali i razumijevanje kako nastaju moderne digitalne i interaktivne "igračke" koje djeca svakodnevno koriste.$txt$
WHERE "sortOrder" = 4 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-2');

-- Svijet LEGO Robotike 3
UPDATE "CourseModule" SET "title" = $txt$Zabavni sustavi 3.0$txt$, "description" = $txt$Kako nastaju interaktivni sustavi koji reagiraju na korisnika?

U ovom modulu djeca istražuju kako kombinacijom mehanike i programiranja nastaju sustavi koji stvaraju pokret, zvuk i reakciju. Fokus je na razvoju interaktivnih modela koji nisu samo funkcionalni, već i zanimljivi za korištenje.

Kroz projekte poput spirografa, panoramskog kotača i glazbene kutije, polaznici uče precizno upravljati motorima i sinkronizirati različite radnje pomoću programa.

Poseban naglasak stavlja se na samostalnost i kreativno izražavanje kroz projekt po vlastitoj ideji, gdje djeca razvijaju rješenje od početne zamisli do gotovog modela.$txt$
WHERE "sortOrder" = 1 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-3');

UPDATE "CourseModule" SET "title" = $txt$Prometni sustavi 3.0$txt$, "description" = $txt$Kako tehnologija unapređuje promet i učinkovitost kretanja?

U ovom modulu polaznici istražuju složenije aspekte prometa i funkcioniranja vozila. Kroz praktičan rad upoznaju principe koji omogućuju učinkovito i kontrolirano kretanje.

Izradom modela poput mjenjačke kutije, motocikla i dragstera, djeca uče kako se prenosi snaga i kako se kontrolira brzina. Otkrivaju i na koji način različiti mehanizmi utječu na performanse vozila, a senzorima mjere okretaje i broje prijeđene krugove.

Uz tehnički dio, razvijaju i razumijevanje šire slike – kako prometni sustavi utječu na svakodnevni život i zašto je njihova optimizacija važna.$txt$
WHERE "sortOrder" = 2 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-3');

UPDATE "CourseModule" SET "title" = $txt$Industrijski sustavi 3.0$txt$, "description" = $txt$Kako funkcioniraju automatizirani sustavi u industriji?

Ovaj modul uvodi polaznike u naprednije koncepte automatizacije i preciznog upravljanja strojevima. Djeca kroz projekte upoznaju način rada sustava koji se koriste u proizvodnji i obradi materijala.

Kroz izradu robotičkog manipulatora, razvrstavača boja i plotera, uređaja za precizno crtanje, polaznici uče kako programirati robote da izvršavaju točne i ponovljive zadatke.

Naglasak je na razumijevanju logike rada sustava, analizi problema i pronalaženju učinkovitih rješenja – vještinama koje su ključne u suvremenoj industriji.$txt$
WHERE "sortOrder" = 3 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-3');

UPDATE "CourseModule" SET "title" = $txt$Energetski sustavi 1.0$txt$, "description" = $txt$Kako vjetar i Sunce postaju energija koju koristimo?

U ovom modulu djeca istražuju različite izvore energije i načine njihove primjene, s posebnim fokusom na obnovljive izvore i njihovu ulogu u budućnosti.

Kroz projekte poput vjetroturbine, Savoniusove turbine i solarne svjetiljke, polaznici uče mjeriti brzinu vrtnje rotora i prikazivati punjenje baterije na zaslonu Huba. Programiraju i svjetiljku koja se pali tek kada se baterija dovoljno napuni.

Uz tehničko znanje, razvijaju i svijest o važnosti održivosti i uče razlikovati stvarno mjerenje od računalne simulacije.$txt$
WHERE "sortOrder" = 4 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-3');

-- Svijet LEGO Robotike 4
UPDATE "CourseModule" SET "title" = $txt$Prometni sustavi 4.0$txt$, "description" = $txt$Kako izgleda promet budućnosti i koje izazove donosi?

U ovom modulu djeca istražuju napredne koncepte prometnih sustava, uključujući automatizaciju, optimizaciju i sigurnost, s naglaskom na upravljanje vozilima na kopnu i u zraku.

Kroz izradu složenijih modela vozila, letjelica i prometnih rješenja, polaznici uče kako izgraditi i upravljati modelima te kako različiti sustavi međusobno komuniciraju i mogu se programirati za učinkovitije upravljanje prometom.

Cjelina se obrađuje kroz projekte poput polagača mosta, simulatora letenja, motocikla i projekta po slobodnom izboru, pri čemu je naglasak na razumijevanju kompleksnih sustava i donošenju odluka koje utječu na njihovu učinkovitost i sigurnost. Polaznici prve programe pišu i u programskom jeziku Python.$txt$
WHERE "sortOrder" = 1 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-4');

UPDATE "CourseModule" SET "title" = $txt$Industrijski sustavi 4.0$txt$, "description" = $txt$Kako funkcioniraju suvremeni automatizirani proizvodni sustavi?

Industrija je jedan od ključnih faktora razvijenosti modernih država, a posljednjih desetljeća obilježena je sve većom automatizacijom radnih i proizvodnih procesa.

U ovom modulu polaznici upoznaju napredne industrijske procese i tehnologije te kroz izgradnju i programiranje robotičkih sustava uče kako optimizirati procese, povećati učinkovitost i smanjiti pogreške u radu.

Cjelina se obrađuje kroz projekte poput dizalice, višestrukog razvrstavača, razvrstavača programiranog u Pythonu i projekta po slobodnom izboru, pri čemu je fokus na razumijevanju automatizacije, razvrstavanju predmeta prema boji i veličini, koordinaciji više komponenti i razvoju sustava koji mogu samostalno izvršavati zadatke.$txt$
WHERE "sortOrder" = 2 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-4');

UPDATE "CourseModule" SET "title" = $txt$Zabavni sustavi 4.0$txt$, "description" = $txt$Kako osmisliti i razviti kompleksne interaktivne sustave?

U ovom modulu polaznici istražuju kako se robotika može koristiti u zabavne i interaktivne svrhe te što čini razliku između korisnika tehnologije i njezina kreatora. Kroz rad na naprednim modelima koji kombiniraju pokret, reakciju na okolinu i korisničku interakciju, djeca postupno razvijaju vlastita rješenja.

Kroz projekte poput lansirnog mehanizma, glazbene kutije, interaktivnog pingvina i projekta po slobodnom izboru, polaznici uče u Pythonu povezivati senzore i motore te programiranjem postići precizno i koordinirano ponašanje robota – od lansiranja upravljanog senzorom sile do pingvina koji pozdravlja i odgovara korisniku. Poseban naglasak stavlja se na razumijevanje kako nastaju interaktivni sustavi koji reagiraju na korisnika i stvaraju jedinstveno iskustvo. Time prelaze iz faze učenja u fazu stvaranja i razvijaju se u male inovatore.$txt$
WHERE "sortOrder" = 3 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-4');

UPDATE "CourseModule" SET "title" = $txt$Interaktivne igre 1.0$txt$, "description" = $txt$Kako nastaju videoigre i kontroleri kojima ih igramo?

U završnom modulu programa polaznici postaju razvijatelji igara. Grade vlastite kontrolere i u programskom jeziku Python programiraju igre koje se igraju na svjetlosnom zaslonu Huba.

Cjelina se obrađuje kroz projekte poput igre labirinta, igre Zmija, arkadnog Tetrisa i projekta po slobodnom izboru. Djeca otkrivaju kako igra prati položaj igrača, prepoznaje sudare, broji bodove i određuje kraj igre. Pritom koriste koordinate, liste, petlje i uvjete – temeljne pojmove stvarnog programiranja igara.

Kroz ovaj modul polaznici povezuju mehaniku, senzore i napredno programiranje u cjelovit sustav. Postupno testiraju i mijenjaju pravila igre, što razvija analitičko razmišljanje i sposobnost otklanjanja pogrešaka.$txt$
WHERE "sortOrder" = 4 AND "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'slr-4');
