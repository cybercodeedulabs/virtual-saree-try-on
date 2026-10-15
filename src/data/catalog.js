/*
  The collection shown in the showroom.

  Two ways to describe a saree:

  1. template  – one image laid out on the 5.5 m saree template
                 (4096 x 856 px, see docs/saree_uv_layout_guide.png). Most accurate.

  2. swatch    – a repeating fabric tile plus a border and pallu. The app builds the
                 full saree image at runtime, so a single swatch photo is enough.
       body:   { src, tileCm }            tileCm = real width of one tile on the fabric
       border: { src?, color, zari, heightCm }
       pallu:  { src?, tileCm, color, opacity? }  (src defaults to the body tile)

  price: number or null (null hides the price).
*/
export const CATALOG = [
  // SOURCE: your own product photo (pink silk saree, sent 13 Oct 2026), converted into tiles:
  // body = pink ground + the photo's butta motifs, border = measured zari border profile,
  // pallu = straightened crop of the brocade with the photo's lighting evened out.
  {
    id: 'pink-silk',
    name: 'Rani Pink Silk',
    fabric: 'Silk with zari border and brocade pallu',
    colour: 'Rani pink, gold and olive',
    family: 'Pink',
    code: 'SR-107',
    price: null,
    blouse: '#2f4a33',
    chip: '/catalog/pink-silk/chip.jpg',
    swatch: {
      body: { src: '/catalog/pink-silk/body.jpg', tileCm: 35 },
      border: { src: '/catalog/pink-silk/border.jpg', color: '#bd126d', zari: '#d9a04a', heightCm: 12.8 },
      pallu: { src: '/catalog/pink-silk/pallu.jpg', tileCm: 40, color: '#5a5444', opacity: 1 },
    },
  },
  // SOURCE: generated sample design (not a real product). Replace before going live.
  {
    id: 'maroon-kanjivaram',
    name: 'Maroon Kanjivaram',
    fabric: 'Silk with zari temple border',
    colour: 'Maroon and green',
    family: 'Red',
    code: 'SR-101',
    price: null,
    blouse: '#123d2a',
    chip: '/catalog/maroon-kanjivaram/chip.jpg',
    template: '/catalog/maroon-kanjivaram/template.jpg',
  },
  // SOURCE: AI-generated image (ChatGPT / GPT-4o, C2PA credentials in the original orange-saree.png),
  // hand-cropped into tiles by prep_assets.py. Not a real product photo. Replace before going live.
  {
    id: 'orange-silk',
    name: 'Sindoor Silk',
    fabric: 'Silk with floral zari pallu',
    colour: 'Orange red and gold',
    family: 'Orange',
    code: 'SR-102',
    price: null,
    blouse: '#7a2b10',
    chip: '/catalog/orange-silk/chip.jpg',
    swatch: {
      body: { src: '/catalog/orange-silk/body.jpg', tileCm: 40 },
      border: { src: '/catalog/orange-silk/border.jpg', color: '#c2401e', zari: '#d9a04a', heightCm: 20 },
      pallu: { src: '/catalog/orange-silk/pallu.jpg', tileCm: 22, color: '#c2401e', opacity: 1 },
    },
  },
  // SOURCE: generated sample design (not a real product). Replace before going live.
  {
    id: 'blue-silver',
    name: 'Indigo Silver',
    fabric: 'Silk with silver zari',
    colour: 'Indigo and plum',
    family: 'Blue',
    code: 'SR-103',
    price: null,
    blouse: '#5a0f35',
    chip: '/catalog/blue-silver/chip.jpg',
    template: '/catalog/blue-silver/template.jpg',
  },
  // SOURCE: iStock asset 1686462550 (Anchalee Thaweeboon, Getty Images) from the original red-saree.jpg.
  // Commercial use needs a purchased iStock licence. Do not ship without one.
  {
    id: 'red-floral',
    name: 'Rose Garden Print',
    fabric: 'Printed georgette',
    colour: 'Ivory, rose and teal',
    family: 'Red',
    code: 'SR-104',
    price: null,
    blouse: '#5c0b1d',
    chip: '/catalog/red-floral/chip.jpg',
    swatch: {
      body: { src: '/catalog/red-floral/body.jpg', tileCm: 34 },
      border: { color: '#600e1e', zari: '#cfa553', heightCm: 11 },
      pallu: { tileCm: 52, color: '#600e1e', opacity: 0.55 },
    },
  },
  // SOURCE: original yellow-saree.jpg, no source metadata. Confirm its licence before going live.
  {
    id: 'yellow-floral',
    name: 'Marigold Print',
    fabric: 'Printed cotton silk',
    colour: 'Marigold and maroon',
    family: 'Yellow',
    code: 'SR-105',
    price: null,
    blouse: '#76141f',
    chip: '/catalog/yellow-floral/chip.jpg',
    swatch: {
      body: { src: '/catalog/yellow-floral/body.jpg', tileCm: 24 },
      border: { color: '#76141f', zari: '#d8b25c', heightCm: 12 },
      pallu: { tileCm: 38, color: '#76141f', opacity: 0.5 },
    },
  },
  // SOURCE: original blue-saree.jpg, no source metadata. Confirm its licence before going live.
  {
    id: 'teal-mandala',
    name: 'Peacock Mandala',
    fabric: 'Printed crepe',
    colour: 'Peacock teal and magenta',
    family: 'Blue',
    code: 'SR-106',
    price: null,
    blouse: '#8f1452',
    chip: '/catalog/teal-mandala/chip.jpg',
    swatch: {
      body: { src: '/catalog/teal-mandala/body.jpg', tileCm: 22 },
      border: { color: '#93165a', zari: '#dedee6', heightCm: 12 },
      pallu: { tileCm: 34, color: '#93165a', opacity: 0.45 },
    },
  },
];

export const FAMILIES = ['All', ...Array.from(new Set(CATALOG.map((s) => s.family)))];

// A saree prepared from a photo in the preparation step (see components/FabricPrep.jsx).
// record: { id, name, blouse, body:{blob,tileCm}, border:{blob,heightCm,color}|null, pallu:{blob,tileCm,color}|null, chip: Blob }
export function sareeFromPrepared(record, { saved = false } = {}) {
  const urls = [];
  const url = (blob) => { if (!blob) return null; const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const body = url(record.body.blob), border = url(record.border?.blob), pallu = url(record.pallu?.blob), chip = url(record.chip);
  return {
    id: record.id,
    name: record.name,
    fabric: saved ? 'Prepared from a photo' : 'Your photo',
    colour: 'From the photo',
    family: 'Prepared',
    code: null,
    price: null,
    blouse: record.blouse,
    chip: chip ?? body,
    isUpload: !saved,
    isSaved: saved,
    blobUrls: urls,
    swatch: {
      body: { src: body, tileCm: record.body.tileCm },
      border: border
        ? { src: border, color: record.border.color, zari: '#cfa957', heightCm: record.border.heightCm }
        : { color: 'auto', zari: '#cfa957', heightCm: 11 },
      pallu: pallu
        ? { src: pallu, tileCm: record.pallu.tileCm, color: record.pallu.color, opacity: 1 }
        : { tileCm: record.body.tileCm * 1.5, color: 'auto', opacity: 0.5 },
    },
  };
}
