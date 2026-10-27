# ProtoLab

A 3D builder that runs in the browser. People start from a template or their own file, make it theirs, check that it fits the printer, and save a `.stp` (STEP) file for printing.

- `/` is the landing page.
- `/build` is the builder. The CAD engine (about 23 MB of WebAssembly, smaller over the wire) only loads on this page.

## How it works

- **CAD engine:** [replicad](https://replicad.xyz) on top of OpenCascade (WebAssembly), running in a web worker (`src/cad/worker.js`). Shapes are real solids, so STEP export is exact.
- **Meshes:** imported `.stl` and `.3mf` files use [Manifold](https://github.com/elalish/manifold) for combining and cutting. A design that contains a mesh saves as `.stl` only.
- **Viewport:** three.js with orbit and move/rotate gizmos (`src/builder/Viewport.jsx`).
- **Design model:** a flat list of parts (`src/objects.js`). Each part has a type, sizes in mm, a position, a rotation (applied X, then Y, then Z), and a Solid/Hole flag. Solids are joined, then holes are cut from them.
- **Templates:** `src/templates.js`. Thumbnails in `public/templates/` are rendered from the builder itself.

## Placeholder settings (`src/config.js`)

These are stand-ins until the real decisions are made:

| Setting | Placeholder |
|---|---|
| Build volume | 256 × 256 × 256 mm (Bambu Lab P1/X1 size) |
| Price | Express 3D chime formula on the bounding box: `16.16 + 1.185 × (cubic inches)^0.5753` |
| Ordering | Download only. "Order print" shows the estimate and saves the file; no checkout yet |
| Minimum wall | 1.2 mm warning |

## Owner should confirm

- Printer model and build volume.
- Pricing formula.
- How orders should work: upload to the shop and email, Stripe checkout, and whether each order is approved before charging.
- The "We print it." promise on the landing page, once ordering exists.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # builds every shape and template in Node and exports STEP/STL
npm run build
```

Fonts for 3D text are SIL Open Font License fonts from Fontsource (Archivo Black, Space Mono, Pacifico), in `public/fonts/`.
