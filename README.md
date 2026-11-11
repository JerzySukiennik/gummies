# Gummies

A web toy about making your own gummies in a white studio. Pick a mold, choose a color and a flavor, pour the mass, let it set, pull the gummies out, drizzle chocolate, sprinkle sour sugar, drop them into a printed pouch and close it with a heat sealer.

No build step: plain ES modules, three.js from a CDN. Open `index.html` through any static server.

## How it works

- **Mass and chocolate** are a viscous height-field fluid on a 256x256 grid with pinned contact lines, so puddles keep a rounded edge and molds fill and overflow. Streams are falling particle chains drawn as tapering tubes.
- **Molds** are height fields built from 2D shape silhouettes (24 shapes, or draw your own). A 4x finer relief drives a per-pixel normal map shared by the mold and the gummies cast in it.
- **Gummies** are whatever the fluid looked like when it set: each connected region is meshed with marching squares between the fluid surface and the mold floor, then turned into a soft body (particle clusters with shape matching) skinned on the GPU. Spills on the table set into peelable blobs too.
- **Chocolate and toppings** are stored per vertex, so drizzle lines and sugar stay where they landed.
- **Pouches** carry a printed design (color, pattern, sticker, name), can be dragged and shaken, are closed with the heat sealer and saved to a local collection. Saved packs can be poured back onto the table.

## Controls

- Click a tool to pick it up, hold to pour, click its empty spot (or press Esc) to put it back. Keys 1-4 pick tools.
- Pull a gummy out of the mold, or pull the mold up to turn everything out. Tap a gummy to flip it.
- Drag a gummy over the pouch and let go. Clamp the heat sealer on the top of the pouch to close it.

## Layout

- `src/fluid.js`, `src/stream.js`: fluid simulation and pouring
- `src/shapes.js`, `src/mold.js`: shapes, distance fields, mold relief
- `src/gummy.js`, `src/soft.js`: meshing, soft bodies, skinning, serialization
- `src/tools.js`, `src/pack.js`, `src/sugar.js`: pitcher, bottle, shaker, sealer, pouch, toppings
- `src/ui.js`, `css/style.css`, `src/data.js`: interface and texts (Polish and English)

## Credits

Sounds are CC0 recordings from freesound.org, listed in `assets/audio/CREDITS.md`.
