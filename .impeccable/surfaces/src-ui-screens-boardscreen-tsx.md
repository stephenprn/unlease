---
version: 1
slug: "src-ui-screens-boardscreen-tsx"
primary_target: "mobile/notes/src/ui/screens/BoardScreen.tsx"
related_targets: ["mobile/shared/src/ui","web/notes/src","web/shared/src/ui"]
---

# Surface brief: the board (phone) and its web twin

Scope: Carnet's notes board on Android and everything reached from it (editor, collections, capture, settings), plus its web twin; the suite's other apps inherit the same world. Mode: Operate. Platform: Android (Material 3 structure, brand through theming); the web follows web conventions. DESIGN.md holds the system and its numbers.

Audience and job: one owner, every day, phone and desktop. Capture a note or a link in seconds; find it again among hundreds; trust the collections (clothes, films, restaurants) as living wishlists that Claude fills. Screenshots use synthetic samples.

Constraints: French UI; offline-first on the phone; link reading is server-side and optional (no server or no key: links stay plain, never "reading" forever); no Google service.

The owner's pins:
- The layout, disposition and behaviour stay as they are; components are premium, clean and practical with a little fantasy: organic done well (smooth curvature, one shape per role, organic forms kept off text containers).
- The drawer runs the full height with no rounded corner; cards and the info card never wobble.
- Matcha only as the accent; icons and checkboxes neutral on any note colour; no shadow behind an icon, emblem or illustration; hovers and presses stay inside the control and never tilt or jump.
- The difference from Keep lives in the look and the feeling, not in features: Carnet's own icons, Onde (one ink, gently wavy but clean, never coloured, never a face), and a grainy ground in two tones only.
- Refused: per-item random corners, bowed sides, coloured or kawaii icons, a multi-colour mesh ground, per-feature gimmicks (stamps for checklists, postage stamps for links), a printed riso world.

Memorable moment: the wavy one-ink icons on a grainy two-tone ground, at a glance; then the pebble that answers the finger, and the snip that lands each link under its collection's emblem.

## Direction contract

THESIS: Carnet is a notebook of calm sheets resting on pebbles, after its own mark (a card on a matcha pebble): every container is a smooth, identical sheet, and the brand's pebble, its one organic form, marks what is chosen, captured or kept. It refuses per-item random outlines, wobbling edges, organic shapes holding text, and ornamented chrome.

OWN-WORLD: a paper ground in two tones under its own grain, cream sheets, warm ink, terracotta fills, a matcha accent, earth pigments. Sheets: one continuous corner from a short radius scale by role, hairline edge, one light source, quiet grain never stacked. Pebbles: stretched and turned per role, never under text. Controls are soft sheets. Matisse emblems, label tags, the stamp and the snip. Signika. Onde icons.

STORY: the owner opens a wall that never wobbles, finds a collection by its stone and emblem, and feels the pebbles answer the finger.

FIRST VIEWPORT: the two-tone grainy ground behind everything; the search strip as a sheet (menu, layout toggle, sync dot; frosted on the web); collection chips whose emblems lie on wash pebbles; "Épinglées" then two columns of identical sheets, each exactly as tall as its content; on the phone the capture pebble floating at the foot's right, no bar. The drawer: full height, square, the chosen place's row on its wash. Signature interaction: a pebble pressed gives rounder and springs back; sheets never change shape.

FORM: organic modernism after Perriand and Noguchi, fused with the Carnet mark (a sheet on a pebble); seed key 66bef433.

FINISH: unreviewed and undocumented is unfinished; a build ends with the finish review, the verdict and DESIGN.md.

Open decisions: none blocking.
