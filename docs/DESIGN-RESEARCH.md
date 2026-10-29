# Organic design, done well: research notes

Gathered on 2026-10-22 for the component rework ("Galet et feuille"). Five questions, primary sources first: the geometry of smooth shapes, how the big design systems use expressive shape, premium apps that stay clean but carry a twist, the craft pitfalls of organic UI, and the perception science. The rules below are what Carnet now follows; DESIGN.md says how.

## Rules

1. **Smooth beats irregular.** A premium curve is curvature-continuous (G2): the bend starts from zero and grows, so no "hump" shows where a straight side meets the arc. Irregular elliptical corners do the opposite: an a:b quarter-ellipse is (a/b)^3 times tighter at one end than the other, so one end pinches while the other flares.
   - Figma, "Desperately seeking squircles" (Furse, 2018): "The curvature of a squircle's perimeter is continuous, whereas a rounded square's is not"; "ξ = 0.6 just about nails the iOS shape". https://www.figma.com/blog/desperately-seeking-squircles/
   - Raph Levien, *From Spiral to Spline* (PhD thesis, 2009): G2 is enough for flat drawing; curvature should vary in few monotone spans. https://levien.com/phd/thesis.pdf
   - PaintCode on the iOS 7 corner: the old circular corner "produced a subtle but noticeable 'hump'". https://www.paintcodeapp.com/news/code-for-ios-7-rounded-rectangles
2. **One shape per role, from a short scale; never a random outline per item.** Differences between shapes must mean something.
   - Material 3, Shape: "Shapes without clear meaning behind why they're different can add more visual clutter than delight"; "Avoid applying unconventional shapes to text-heavy containers". https://m3.material.io/styles/shape/overview-principles
   - NN/g, Similarity: "Clear, consistently applied visual rules for each type of UI element are critical". https://www.nngroup.com/articles/gestalt-similarity/
   - Material 2: avoid radii that follow a component's size, since "the shape will change as the height changes". https://m2.material.io/design/shape/applying-shape-to-ui.html
3. **Nest radii concentrically**: inner radius = outer radius - padding (Apple WWDC25 session 356, "Get to know the new design system"; M3: 48 - 14 = 34dp). Corners that ignore it look "pinched" or "flared". https://developer.apple.com/videos/play/wwdc2025/356/
4. **Organic forms go on non-text things**: picture crops, avatars, marks, loading, the one focal control. Text lives in calm containers. (M3 Shape; M3 Expressive launch post: the 35 shapes "add decorative detail for elements like image crops and avatars". https://m3.material.io/blog/building-with-m3-expressive)
5. **Change shape to show state, not identity**: M3 Expressive morphs a pressed button squarer, a selected toggle from round to square, and loads with a seven-shape morph. The resting state stays quiet; the organic life is in the interaction (Apple, "Meet Liquid Glass": "the resting state stay visually quiet, while it comes to life on touch"). https://developer.apple.com/videos/play/wwdc2025/219/
6. **Edges that touch the screen stay straight; floating things are rounded.** The standard navigation drawer is full height; "Rounded corners are not necessary for components that reach the edge of the screen" (Fluent 2). https://fluent2.microsoft.design/shapes
7. **Strict structure, one signature, rare moments.** Things 3 has one liquid button, Notion one face, Mailchimp one high five, Nothing its dots; the frame stays plain. Google: "Stick to one or two hero moments in your product"; "No amount of emotion can compensate for a lack of clarity". Arc's founders on its novelty in structure: "too many new things to learn, for too little reward".
   - https://design.google/library/expressive-material-design-google-research
   - https://browsercompany.substack.com/p/letter-to-arc-members-2025
   - https://culturedcode.com/things/blog/2025/09/things-for-os-26/
8. **Regularity first, then a little novelty (MAYA).** Curvature is liked, but modestly: g = 0.39 across 61 studies, near zero for interiors and design experts (Chuquichambi et al. 2022, Ann NY Acad Sci, doi:10.1111/nyas.14919). Symmetry weighs more than curvature (Chuquichambi et al. 2021); liking falls as a blob gains bumps (Palumbo et al. 2021, PeerJ). Typicality and novelty only pay together (Hekkert et al. 2003, Br J Psychol). Low visual complexity plus typicality wins first impressions (Tuch et al. 2012, IJHCS). An unusual touch wins people over when it is a fixed rule that keeps coming back, not noise (Landwehr et al. 2013).
9. **Board craft**: constant gutters, cards on one plane, a consistent treatment for things compared side by side (NN/g, Cards; M3 Cards: "cards in a collection are coplanar"). Bowed sides change the visible gap between cards.
10. **Depth and texture**: one light source; shadows layered, soft, tinted by the ground; few levels; at night, depth comes from surface colour and edges (Josh W. Comeau, "Designing Beautiful Shadows in CSS"; M3 Elevation; HIG Dark Mode). Texture sits under the content, never stacks on nested surfaces, and is checked against the worst pixel for contrast (WCAG F83). https://www.joshwcomeau.com/css/designing-shadows/

## What Carnet does with it

- Every container is a sheet with Figma's continuous corner (smoothing 0.6), one radius per role (`SHAPES`, `RADII` in `design/shapes.ts`), drawn identically by the web and the phone.
- Controls are continuous capsules; rows and fields take a fixed radius below their half height.
- The brand's pebble (`design/pebbles.ts`) is the one organic form: the capture button, the chosen place, an open info, every collection's emblem on a pebble of its wash, pictures cropped to pebbles, icon buttons' tint. Pressed, it morphs rounder and springs back.
- The drawer is full height and square; the board keeps one gutter; grain is quieter.

## Failure checklist

- Neighbouring cards have different silhouettes for no reason.
- The visible gap between cards varies along an edge.
- Inner elements are not concentric with their container (pinched or flared corners).
- An organic shape holds text, or a corner crowds the text.
- A clip removes a shadow or a focus ring.
- More than three resting shadow levels, mixed light directions, or black shadows on warm paper.
- Grain stacked on nested surfaces, or the same grain at night.
- Decoration varies per item but means nothing.
- Expressiveness replaced a familiar pattern.

## Browser and platform notes (October 2026)

- CSS `corner-shape: squircle` ships in Chromium only (Firefox Nightly behind a pref, Safari Technology Preview). Carnet's web containers therefore draw their outline as a path (`clip-path`), which every engine supports; controls use `border-radius`, upgraded to `corner-shape` where supported.
- `clip-path: shape()` is Baseline since February 2026 (Chrome 135, Safari 18.4, Firefox 148) and takes percentages, so the pebble scales with its box without measuring it.
- Android has no squircle in React Native (`borderCurve` is iOS only); Carnet draws it in its own native view (`OrganicView`), mirroring the core numbers.
