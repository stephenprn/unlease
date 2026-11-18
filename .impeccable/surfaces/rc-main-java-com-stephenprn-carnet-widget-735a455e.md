---
version: 1
slug: "rc-main-java-com-stephenprn-carnet-widget-735a455e"
primary_target: "mobile/notes/android/app/src/main/java/com/stephenprn/carnet/widget"
related_targets: ["mobile/notes/src/ui/features/widgets","mobile/notes/android/app/src/main/res/layout","mobile/calendar/android/app/src/main/res/layout","mobile/contacts/android/app/src/main/res/layout","tools/widgets/build_widget_resources.mjs"]
---

# Surface brief: the Android home-screen widgets and the quick window

Scope: every app's home-screen widgets (Carnet's six, Contacts' two, Agenda's five; Clock has none) and the quick window they open over the home screen (the link field, a list's new items, the pickers). Mode: Operate. Platform: Android (RemoteViews widgets drawn by the launcher; the quick window is React Native in a translucent activity). Extends the established world (DESIGN.md › Home-screen Widgets, which holds the numbers); no new world.

Audience and job: the owner, many times a day, from the home screen: capture without opening the app, glance at a collection, a label, the day or a favourite contact, tick a list. French UI.

Constraints:
- A launcher draws widgets from XML (no path clip, no custom view, no animation, no app font): the continuous corner is built from generated corner vectors and every colour comes from `palette.ts` through generated day and night resources (`tools/widgets/build_widget_resources.mjs`). They follow the system's day or night, not the app's theme.
- JavaScript owns the data: a widget draws the picture it is handed (`mobile/<app>/src/app/widgetPayloads.ts`) and routes every write back through the app's actions.
- The owner's choices: after adding a link the window closes at once with a short slip; quick actions are note, list, photo, camera, link, search, reminder; a link row opens its page in Carnet, with a small button for the website; slabs are the app's grainy two-tone ground, sheets carry the paper speckle; capture pebbles are drawn smaller inside 48 targets; list text in the system font, titles in Signika (`WidgetType`).

## Direction contract

THESIS: On the home screen an app is pieces of itself laid on the wallpaper: a slab of its ground holding calm sheets, the matcha pebble for capture, a collection's emblem on its stone. It refuses Material You tonal tiles, flat white lists, and a dialog that opens the whole app.

OWN-WORLD: DESIGN.md unchanged: slabs of the ground at the panel radius with a hairline, note cards concentric inside in paper or their wash, field-look strips, Onde one-ink glyphs, Signika by family, emblems in their pigment on wash pebbles, label tags, terracotta text actions, the leaf capture pebble that gives under the press.

STORY: the owner sees what a collection, a label or the day holds without opening anything, ticks an item in place, drops a link from the clipboard in two taps, and every write lands as if made in the app (same clocks, same sync).

FIRST VIEWPORT: each widget's anatomy is in DESIGN.md › Home-screen Widgets; in the launcher's picker each shows a preview with sample content short enough to read whole.

FORM: extension of "Galet et feuille" (organic modernism, seed key 66bef433).

FINISH: unreviewed and undocumented is unfinished; a build ends with the finish review, the verdict and DESIGN.md.

Open decisions: none blocking.
