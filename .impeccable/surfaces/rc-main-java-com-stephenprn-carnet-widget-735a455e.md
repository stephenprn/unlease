---
version: 1
slug: "rc-main-java-com-stephenprn-carnet-widget-735a455e"
primary_target: "android/app/src/main/java/com/stephenprn/carnet/widget"
related_targets: ["src/ui/features/widgets","android/app/src/main/res/layout"]
---

# Surface brief: the Android home-screen widgets and the quick window

Scope: five home-screen widgets (Actions rapides, Classer un lien, Collection, Notes d'un label, Note) and the quick window they open over the home screen (the link field, and the collection, label and note pickers). Mode: Operate. Platform: Android (RemoteViews widgets drawn by the launcher; the quick window is React Native in a translucent activity). Extends the established world "Galet et feuille" (DESIGN.md); no new world.

Audience and job: the owner, many times a day, from the home screen: capture without opening the app, glance at a collection or a label, tick a list. French UI.

Constraints: a launcher draws widgets from XML (no path clip, no custom view, no animation), so the continuous corner is built from generated corner vectors (tools/widgets/build_widget_resources.mjs) and every colour comes from palette.ts through generated day/night resources. JavaScript owns the data: widgets draw a JSON picture it hands over and route every write back through the app's actions. Owner's answers (2026-10-26): after adding a link the window closes at once with a short slip (no snip wait); quick actions are note, list, photo, camera, link, search, reminder; a link row opens its page in Carnet, with a small button for the website. Follow-up the same day: the owner asked for the app's spacing and especially its grainy two-tone ground: widget slabs are the ground (GROUNDS' two tones under the web's film grain, which is visible where the phone's speckle at night is not), sheets carry the paper speckle; the capture pebbles drawn smaller inside 48 targets; list text in the system font, titles in Signika (WidgetType). System day/night, not the app's theme setting.

## Direction contract

THESIS: On the home screen Carnet is pieces of its own board laid on the wallpaper: a slab of its ground holding calm sheets, the matcha pebble for capture, a collection's emblem on its stone. It refuses Material You tonal tiles, Keep's flat white lists, and a dialog that opens the whole app.

OWN-WORLD: DESIGN.md unchanged: slabs of the ground (two tones, film grain) at the panel radius (22) with a hairline, note cards concentric inside (14) in paper or their wash, field-look strips (bar 15, outline edge), Onde one-ink glyphs, Signika by family (night grade under font-night), emblems tinted with their pigment on wash pebbles, label tags, terracotta text actions, matcha leaf capture pebble that gives under the press.

STORY: the owner sees what a collection or label holds without opening anything, ticks an item in place, drops a link from the clipboard in two taps, and every write lands as if made in the app (same clocks, same sync).

FIRST VIEWPORT: Collection: head row with the emblem on its stone, name and chevron (the selector), count under it, "+" at the right; then link rows, each a 4:5 framed picture, source and price, two-line title, the website glyph at the end; a "Voir la collection" foot. Label: tag and name, list glyph and the capture pebble, then cards. Note: the note's own sheet, title row with the edit glyph, items with Onde boxes, done ones under a hairline. Quick: the app's bottom bar (six glyphs, pebble right); two rows add the search strip with the mark and named actions. Link: a field strip "Classer un lien" with the sparkle, or the leaf pebble alone in one cell. Quick window: the window is the scrim; the app's own sheet rises (the same "Classer un lien" sheet, pickers as list rows).

FORM: extension of "Galet et feuille" (organic modernism, seed key 66bef433); no new roll, precisely specified request.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Open decisions: none blocking.
