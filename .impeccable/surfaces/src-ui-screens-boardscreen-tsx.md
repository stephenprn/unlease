---
version: 1
slug: "src-ui-screens-boardscreen-tsx"
primary_target: "src/ui/screens/BoardScreen.tsx"
related_targets: ["web/src"]
---

# Surface brief: the board (phone) and its web twin

Scope: the Android app's notes board and everything reached from it (editor, collections, capture, settings), plus the web app, which inherits the same world. Mode: Operate. Platform: Android (Material 3 structure, brand through theming); the web twin follows web conventions.

Audience and job: one owner, every day, phone and desktop. Capture a note or a link in seconds; find it again among hundreds; trust the collections (clothes, films, restaurants) as living wishlists that Claude fills. Content is the owner's own notes; screenshots use synthetic samples.

Constraints: French UI; offline-first on the phone; link reading is server-side and optional (no server or no key: links stay plain, never "reading" forever); no Google service. Pinned by the owner on 2026-10-22, replacing the earlier organic pins (random unequal corners, bowed sides, pebble bars): the layout, disposition and behaviour stay exactly as they are; the components are reworked to feel premium, clean and practical with a little fantasy, organic done well (researched: smooth curvature, one shape per role, organic forms kept off text containers); the left panel (the drawer) runs the full height with no rounded corner; the info card and the note cards lose their wobble. Kept from before: habits-garden's palette, matcha only as the accent, icons and checkboxes neutral on any note colour, no shadow behind an icon, emblem or illustration, hovers and presses inside the control and never tilting or jumping, paper grain (quieter), Signika, the Matisse emblems and label tags, the stamp, the snip. URL lists are called "collections", labels "labels". Pinned by the owner the same evening (identity round, `.impeccable/decision/twist-round-1..5.json`): the difference from Keep lives in the look and the feeling, not in features; the twist is Carnet's own icons, Onde (one ink, original, gently wavy but clean: every straight stroke one soft wave, frames that swell like cushions), chosen over coloured sets (paper collage, candy 3D, felt-tip and highlighter) and faces, which the owner refused (no colour on icons, no smiley or kawaii); and a simple grainy ground in two tones only (beige to a darker beige; grey to a darker grey at night), chosen over a multi-colour mesh. Turned down on the way: per-feature twists (stamps for checklists, postage stamps for links, Jazz plates, a Seyès ground, a cloth cover), a printed riso world, and daylight with leaf shadows.

Memorable moment: the wavy one-ink icons on a grainy two-tone ground, at a glance; then the pebble that answers. The capture pebble, a collection's stone and the chosen place give under the finger, their outline settling back like a pebble in the hand; and the snip still lands each link under its collection's emblem.

Open decisions: none blocking.

## Direction contract

THESIS: Carnet is a notebook of calm sheets resting on pebbles, after its own mark (a card on a matcha pebble): every container is a smooth, identical sheet, and the brand's pebble, its one organic form, marks what is chosen, captured or kept. It refuses per-item random outlines, wobbling edges, organic shapes holding text, and ornamented chrome.

OWN-WORLD: habits-garden's paper ground, now two tones of the wall from the window's top to its foot under its own grain (`GROUNDS`), and cream sheets, warm ink, terracotta fills, matcha accent, earth pigments. Sheets: one continuous corner (Figma's, smoothing 0.6) from a short radius scale by role, never by size or item, capped at 0.3 of the shorter side, nested concentrically, hairline edge, one light source, quiet grain never stacked. Pebbles: the mark's pebble, stretched and turned per role, never under text: the capture pebble, the chosen place's mark, the open info, every collection's emblem on its stone where it stands for the collection (chips, cards, tiles, its page's head; in the navigation only the chosen place), pictures cropped to pebbles where they are glimpses (a link's own picture keeps its 4:5 frame, so products compare whole). Controls are soft sheets, their radius under half their height. Matisse emblems, label tags, stamp and snip kept. Signika. Icons: Onde, Carnet's own (tools/icons/onde.mjs): one even 1.9 ink line, round ends, one soft wave per straight stroke, cushion frames, breathing circles; never coloured, never a face.

STORY: the owner opens a wall that never wobbles, finds a collection by its stone and emblem, and feels the pebbles answer the finger.

FIRST VIEWPORT: the two-tone grainy ground behind everything, running on under the bottom bar without a seam; the search strip as a sheet (wavy menu, cushion layout toggle, sync dot; frosted on the web); collection chips whose emblems lie on wash pebbles; "Épinglées" then two columns of identical sheets, each exactly as tall as its content; the bottom bar with the capture pebble at its right. The drawer: full height, square, the chosen place a matcha pebble behind its glyph. Signature interaction: a pebble pressed morphs rounder and springs back; sheets never change shape.

FORM: organic modernism after Perriand and Noguchi, fused with the Carnet mark (a sheet on a pebble), candidate 1 of 7 on my list, chosen by the owner as IMPECCABLE'S PICK over the roll's Japanese stationery (4 of 7); seed key 66bef433.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
