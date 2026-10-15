# Virtual Saree Try-On

A 3D showroom: every saree in the collection, draped on a mannequin, viewable from all sides.
React + Vite + Tailwind v4 + React Three Fiber. Works offline after the first visit.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production files in dist/
npm run preview    # test the production build (offline mode only works here)
```

Deploy: push to the Netlify site. `netlify.toml` sets the build command and cache headers.

## Showroom kiosk

Open the site with `?kiosk=1`:

- no fabric upload, no right-click or long-press menus
- after 20 s without a touch the mannequin turns; after 75 s it cycles through the collection
- any touch returns control to the customer

Tune timings on site without a rebuild (seconds): `/?kiosk=1&idle=20&attract=75&cycle=9`

Chrome kiosk launch (Windows shortcut target or Linux autostart):

```
chrome --kiosk --app="https://YOUR-SITE.netlify.app/?kiosk=1" --noerrdialogs --disable-pinch --overscroll-history-navigation=0
```

Open the URL once while online. After that the app, model and all fabrics are cached
and keep working if the showroom Wi-Fi drops.

Keyboard (for staff): left and right arrows change saree, keys 1-5 change the camera view.

## Trying a saree from a photo

Press **Try a saree from a photo** and choose any saree photo (product shot, flat lay, saree on a mannequin,
or a close-up of the fabric). The saree is draped straight away, with no steps for the customer:

- the background, mannequin and dress form are ignored
- the **body** fabric is the main plain colour of the saree
- the **border** is the straight band along the edge of the body fabric (its angle is found too)
- the **pallu** is the largest patterned area that is neither body nor border
- the blouse is a darker shade of the body colour

A small message then offers **Save** (keep it on this screen, also offline), **Adjust** and **Close**.
If no border or no separate pallu was found, the message says so; a matching plain border or the body
fabric is used instead.

Works best with: a clear photo of the whole saree or a flat lay on a plain background, in even light.
Can go wrong with: grey, black or white sarees; busy backgrounds; heavily pleated or folded sarees
(the folds show in the fabric); watermarked images (the watermark is copied too).

**Adjust** (staff) opens the manual screen with body, border and pallu already marked:

1. **Body fabric**: drag a new box over plain body fabric if needed. Check the 2 x 2 preview. Set the size of one repeat in cm.
2. **Border**: straighten the photo until the border runs straight, then drag a box from the body
   to the saree edge. Use *Flip* if the edge is not at the bottom of the preview. Set the border width in cm.
3. **Pallu**: drag a box inside the pallu design. *Turn pattern 90°* until the bands run the right way.
4. **Blouse and finish**: pick a blouse colour, then *Try on mannequin*, *Save to this device*, or
   *Download for catalogue* (the tiles plus a ready-made `catalog.js` entry, to add it to the website for everyone).

On the kiosk, customers do not see the photo button. Open `/?kiosk=1&staff=1` to use it on the kiosk.

## Adding a saree

Edit `src/data/catalog.js`. Put images in `public/catalog/<id>/`. Two options:

**Template (most accurate).** One 4096 x 856 px image laid out like
`docs/saree_uv_layout_guide.png`: the whole 5.5 m length left to right, hem border along
the bottom edge, top border along the top edge, pallu design in the last 16 % on the right.

**Swatch (fastest).** A repeating fabric tile plus border and pallu settings. The app builds
the full saree image itself. `tileCm` is the real width of one tile on the fabric; set it
so the motifs come out the right size on the mannequin.

Each saree also needs a `chip` image (300 x 380 px) for the collection list and a `blouse` colour.
Rebuild and deploy; the offline cache picks up the new files automatically.

## Files

| Path | What it is |
| --- | --- |
| `public/models/saree_showroom.glb` | Mannequin, blouse and saree, covered drape (1.65 m tall, faces +Z, meshopt-compressed) |
| `src/data/catalog.js` | The collection |
| `src/config.js` | Store name, currency, kiosk timings |
| `src/lib/autoDetect.js` | Finds body, border and pallu in a photo |
| `src/lib/prepareTiles.js` | Turns marked regions of a photo into fabric tiles |
| `src/lib/composeSaree.js` | Builds a full saree image from a swatch |
| `src/lib/sareeTextures.js` | Loads, caches and pre-builds saree textures |
| `src/components/Mannequin.jsx` | Applies the saree to the model |
| `src/components/ModelViewer.jsx` | 3D stage, lighting, camera |
| `public/sw.js` | Offline cache (file list filled in at build time) |

The Blender source for the model is `saree_showroom.blend` (kept outside this repo).

## On-site acceptance check

Open `/?kiosk=1&qa=1` on the actual showroom screen. A small panel (bottom left) shows live
frames per second, worst frame time, GPU texture/geometry counts and canvas size. Without `qa=1`
the panel and test hooks are off.

On the real screen, check:

- fps stays at 30 or above while the mannequin turns (this was not measurable in testing, which used software rendering)
- worst frame stays under ~250 ms when switching sarees
- after 15 minutes of attract mode, `textures` is no higher than 15 and `geometries` / `programs` have not changed
- one-finger drag turns the mannequin, two-finger pinch zooms, nothing else on the page moves

## Content licences

Every catalogue entry in `src/data/catalog.js` has a `SOURCE` note. The sample sarees are
generated designs, an AI-generated image, and an iStock image that needs a purchased licence.
Replace them with your own product photographs before going live.
