# Watermark na slikama — puštanje u produkciju

Kako se Inovatic watermark uključuje za nove slike i kako se stavlja na one koje
su uploadane prije nego što je značajka postojala.

## Što se zapravo mijenja

Watermark **nije zapečen u piksele**. Cloudinary čuva original nedirnut; u bazu
se sprema URL s transformacijskim segmentom ubačenim odmah iza `/image/upload/`:

```
https://res.cloudinary.com/dgc2tp4f8/image/upload/l_branding:inovatic-watermark,o_60,w_0.28,fl_relative,g_south_east,x_20,y_20/v1773656893/articles/covers/regionalno-fll-2026.jpg
```

Zato je backfill prepisivanje stringova, a `--revert` vraća čiste fotografije
brisanjem jednog segmenta — nijedna slika se ne uploada ponovno.

**Samo slike.** Video se namjerno ne dira: `withWatermark` odbija sve što nije
`image/upload`, a walk kroz tijelo članka preskače video blokove.

## 1. Preduvjet — asset mora postojati PRIJE deploya

`branding/inovatic-watermark` mora biti u Cloudinaryju. Ako overlay pokazuje na
asset koji ne postoji, Cloudinary vraća grešku pri isporuci i **svaka slika na
javnom sajtu pukne** dok se asset ne postavi.

Provjera:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://res.cloudinary.com/dgc2tp4f8/image/upload/branding/inovatic-watermark.png"
```

`200` znači da je sve na mjestu. Asset je uploadan 2026-09-01 (svijetli lockup,
`public/images/logo_white.png`, 1537×874).

## 2. Deploy koda

Nakon deploya svaka **nova** slika kroz `/api/upload` i `/api/upload/gallery`
dobiva watermark automatski. Postojeće slike su i dalje čiste — to rješava
korak 3.

## 3. Backfill postojećih slika

Skripta se **ne može pokrenuti unutar Railway kontejnera**: produkcijski image je
Next standalone build i ne sadrži ni `scripts/` ni `tsx`. Pokreće se lokalno, a
Railway samo ubacuje varijable okruženja.

Prvo suho pokretanje — ništa se ne piše:

```bash
railway run npm run db:watermark-images
```

Pročitaj izvještaj (broj redaka po tablici + par primjera prije/poslije). Ako
izgleda točno:

```bash
railway run npm run db:watermark-images -- --apply
```

Pokriva `Article.coverImage`, `Article.content` (BlockNote JSON),
`ArticleImage.url` i `GalleryImage.url`.

Skripta je idempotentna — drugo pokretanje prijavi 0 izmjena.

## 4. Provjera

Otvori `/novosti`, jedan članak i jednu galeriju grupe. Watermark je dolje
desno, 28% širine isporučene slike. Na thumbnailu mora biti **cijeli**, ne
odrezan — resize ide ispred overlaya u lancu, pa se logo crta na gotovom
thumbnailu.

## Vraćanje unatrag

```bash
railway run npm run db:watermark-images -- --revert
railway run npm run db:watermark-images -- --revert --apply
```

Vraća originalne fotografije. Nove slike će i dalje dobivati watermark dok se ne
makne `withWatermark` iz upload ruta.

## Promjena izgleda ili položaja watermarka

Dvije različite stvari:

- **Druga grafika, isti položaj** — uploadaj novu sliku u Cloudinary pod istim
  public idom `branding/inovatic-watermark`. Ništa u bazi se ne dira; svi URL-ovi
  odmah pokazuju novu grafiku. (Cloudinary CDN cache se prazni s `invalidate`.)
- **Druga prozirnost, veličina ili kut** — to je `WATERMARK_TRANSFORM` u
  `src/lib/cloudinary-url.ts`. Skripta **ne prepisuje** postojeći watermark, pa
  je redoslijed: `--revert --apply`, pa deploy izmijenjene konstante, pa `--apply`.

## Ako nešto pođe po zlu

Watermark postoji samo u stringu, pa je najgori ishod ružna slika, nikad
izgubljena. Original je cijelo vrijeme u Cloudinaryju i `--revert` ga vraća.
