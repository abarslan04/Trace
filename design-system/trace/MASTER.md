# Trace design system

Trace is a consumer running route planner: the map is the main visual, the distance choice is the main input, and Generate Routes is the single primary action.

## Skill application

Read and applied the installed `ui-ux-pro-max` skill. Its design-system searches for `running fitness outdoor minimalist` and `outdoor wellness minimal` returned marketing layouts and visual styles unsuitable for a native map planner. Those recommendations were not persisted as product requirements. This system uses the skill's general native accessibility, hierarchy, spacing, touch, theming, and feedback guidance. The React Native `accessibility` stack search reinforced semantic roles, labels, and screen-reader testing.

## Foundations

- Forest green actions, warm off-white backgrounds, restrained surfaces, and native system typography.
- Semantic light/dark colors live in `mobile/src/theme/tokens.ts`; avoid per-screen color overrides.
- Body text 16/24, support text 14/21, captions 12/18, main heading 29/36. Support native font scaling and wrapping.
- Spacing follows a 4/8 point rhythm. Cards have rounded corners without decorative gradients or heavy shadows.
- Controls have at least 48 × 48 point targets, visible pressed states, descriptive accessibility labels, and selected/disabled semantics.
- Route numbers and text supplement color. A contrasting halo separates lines from the basemap.

## Layout and interactions

- Phone: map above a scrollable planner, with a persistent bottom Generate Routes action.
- Landscape and wide screens: scrollable planner beside the map, maintaining access to the primary action.
- Safe areas wrap the native screen. Input uses the decimal keyboard with persistent labels and inline validation.
- GPS is requested on entry, with explicit accuracy, retry, and settings recovery. Saved starts are never represented as a fresh GPS fix.
- Loading offers progress text and cancellation. Errors have recovery instructions and screen-reader announcements.
- Selecting a route updates its line emphasis, camera bounds, distance, and saved selection.
- Camera movement honors reduced motion. No ornamental animation is used.
- Required map-data attribution stays on the map; GraphHopper attribution is available in the planner.

## Verification

Automated tests measure text/button contrast in both themes and validate geometry framing across the date line. Browser smoke tests cover narrow, landscape, desktop, dark, and reduced-motion layouts. Native VoiceOver/TalkBack and largest Dynamic Type checks still require a device. Do not claim browser checks validate native accessibility behavior.
