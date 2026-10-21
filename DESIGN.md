---
name: "Afterblock"
description: "Thirteen selectable visual systems around one stable phone-first falling-block game."
colors:
  basalt-bg: "#17252c"
  basalt-surface: "#233840"
  basalt-panel: "#2b4249"
  basalt-text: "#e6f0e9"
  basalt-muted: "#b4c9c7"
  basalt-border: "#607b80"
  basalt-accent: "#b4edb8"
  basalt-accent-ink: "#172c21"
  basalt-control-rgb: "rgb(180 237 184)"
  basalt-board-border: "#75928e"
  basalt-board-bg: "#20343b"
  basalt-board-grid: "#294149"
  basalt-board-ghost: "#bed8ce"
  basalt-board-flash: "#b4edb860"
  basalt-piece-I: "#88beb1"
  basalt-piece-O: "#e4d188"
  basalt-piece-T: "#d5b9e3"
  basalt-piece-S: "#b4edb8"
  basalt-piece-Z: "#d99591"
  basalt-piece-J: "#a4c9d7"
  basalt-piece-L: "#efaa78"
typography:
  body-new:
    fontFamily: "Familjen Grotesk, sans-serif"
    fontWeight: 400
  body-legacy:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontWeight: 400
  display-new:
    fontFamily: "Familjen Grotesk, sans-serif"
    fontSize: "38px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  display-score:
    fontFamily: "Newsreader, serif"
    fontSize: "41px"
    fontWeight: 500
    lineHeight: 1.15
  display-folio:
    fontFamily: "Newsreader, serif"
    fontSize: "42px"
    fontWeight: 550
    lineHeight: 1.15
  headline-new:
    fontFamily: "Familjen Grotesk, sans-serif"
    fontSize: "29px"
    fontWeight: 600
    letterSpacing: "-0.035em"
  title-mode:
    fontSize: "23px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  body-setting:
    fontSize: "13px"
  label-hud:
    fontSize: "9px"
    lineHeight: 1.2
  value-hud:
    fontSize: "17px"
    fontWeight: 550
    lineHeight: 1.4
  value-result:
    fontSize: "52px"
    letterSpacing: "-0.05em"
rounded:
  new-default: "12px"
  basalt: "12px 5px 12px 5px"
  workshop: "4px"
  sleeve-score: "2px"
  folio: "14px"
  folio-key: "16px 6px 16px 6px"
  gate: "3px"
  gate-key: "6px"
  annual-data: "0px"
  annual-key: "2px"
  classic: "14px"
  classic-key: "24%"
  classic-rotate: "50%"
  legacy-sheet: "18px"
  legacy-key: "20%"
spacing:
  micro: "4px"
  small: "8px"
  medium: "12px"
  large: "16px"
  panel: "20px"
  home: "24px"
components:
  button-primary-basalt:
    backgroundColor: "{colors.basalt-accent}"
    textColor: "{colors.basalt-accent-ink}"
    rounded: "{rounded.basalt}"
    padding: "12px 16px"
  button-secondary-basalt:
    backgroundColor: "{colors.basalt-panel}"
    textColor: "{colors.basalt-text}"
    rounded: "{rounded.basalt}"
    padding: "12px 16px"
  sheet-basalt:
    backgroundColor: "{colors.basalt-surface}"
    textColor: "{colors.basalt-text}"
    rounded: "{rounded.basalt}"
    padding: "20px"
    width: "100%"
  select-basalt:
    backgroundColor: "{colors.basalt-panel}"
    textColor: "{colors.basalt-text}"
    rounded: "{rounded.basalt}"
    padding: "8px"
  mode-basalt:
    backgroundColor: "{colors.basalt-surface}"
    textColor: "{colors.basalt-text}"
    rounded: "{rounded.basalt}"
    padding: "20px"
---

# Design System: Afterblock

## Overview

**Creative North Star: "One game, thirteen complete worlds"**

Afterblock keeps the board and thumb controls dominant while each selectable theme carries a complete material treatment through menus, sheets, the board and piece previews. The user approved all nine new worlds alongside the four existing themes. This is a family of visual systems rather than a single palette with interchangeable accent colors.

The theme registry and stylesheet are the authority for exact appearance; the Canvas renderer is the authority for tiles and ghosts. Short functional English labels, locally bundled typefaces for the new worlds and a shared phone-first geometry keep the experience coherent. Theme changes alter appearance without moving gameplay controls.

**Key Characteristics:**

- Thirteen complete shell and board palettes.
- Nine new worlds with local type, distinct corners and Canvas materials.
- Shared safe areas, compact status rows and configurable translucent controls.
- Static pattern identities in Movement Score, Data Field and LCD.

## Colors

### Primary

Each theme owns its action accent and paired action ink. Night Sleeve and Design Annual use text-on-background primary buttons instead of their accent pair; Data Field is deliberately ivory-on-black. The normative frontmatter uses Basalt as its compact reference palette; its `basalt-<role>` keys preserve the exact source strings. The complete thirteen-theme palette registry remains in `src/ui/themes.ts`, referenced by the sidecar variant index rather than duplicated here.

### Neutral

`bg`, `surface` and `panel` define the shell layers; `text`, `muted`, `border` and `board-border` carry reading hierarchy and rules. `control-rgb` supplies the translucent control color. Canvas roles are `board-bg`, `board-grid`, `board-ghost` and `board-flash`; `piece-I` through `piece-L` retain piece identity. The source registry additionally defines the legacy palettes' explicit paused overlays and board text. New paused overlays are derived by appending `d9` to board background; their board text follows shell text.

| Theme                      | Palette character                      | Canvas material                                    |
| -------------------------- | -------------------------------------- | -------------------------------------------------- |
| Basalt (`basalt`)          | Chalk green on slate                   | Light upper facets and darker lower cuts           |
| Workshop (`workshop`)      | Cream, navy and red                    | Inset outline and narrow white highlight           |
| Night Sleeve (`sleeve`)    | Matte charcoal, ivory and coral        | Fine ivory inset perimeter                         |
| Movement Score (`score`)   | Warm paper, ink and coral              | Seven static printed marks                         |
| Botanical Folio (`folio`)  | Cream stock, green and berry           | Three-sided inset line and small corner cutout     |
| Gate Board (`gate`)        | Navy, pale data and amber              | Horizontal split and inset perimeter               |
| Design Annual (`annual`)   | Near-white, black and periwinkle       | Inset square with a small dark registration square |
| Data Field (`data`)        | Black and ivory                        | Seven static printed marks in ivory tiles          |
| Classic Arcade (`classic`) | Blue-black and saturated arcade colors | Uninterrupted bright tile fills                    |
| Ink (`ink`)                | Blue-black and mint                    | Light top and dark bottom edge                     |
| LCD (`lcd`)                | Green phosphor monochrome              | Seven light cutout identities in dark tiles        |
| Neon (`neon`)              | Violet-black and luminous colors       | Inset dark fill and bounded colored glow           |
| Paper (`paper`)            | Warm neutral stock and muted colors    | Flat fill and dark perimeter                       |

**The Complete World Rule.** Switch the full shell and Canvas palette together; do not leave tokens from the previous theme behind.

## Typography

**Display Font:** Familjen Grotesk for seven new worlds; Newsreader for Movement Score and Botanical Folio. The four legacy themes retain Segoe UI with system sans-serif fallbacks. Local font files and their licenses live in `src/ui/fonts/`.

**Body Font:** Familjen Grotesk for every new theme; Segoe UI for the legacy themes. Control symbols use their existing system sans-serif fallback independently of display type.

### Hierarchy

- **Display:** the new default is captured in `display-new`. Basalt overrides weight to 500; Workshop to 700. Night Sleeve uses 40px/400; Gate Board 33px/700 uppercase; Design Annual 40px/500; Data Field 34px/500 uppercase; Classic Arcade 38px/700. Movement Score and Botanical Folio have their own frontmatter roles, with Newsreader optical size settings of 72 and 16 respectively.
- **Headline:** sheets use the new headline role, inheriting the theme's display family and weight. Legacy sheet titles are 28px/600 with tighter tracking.
- **Title:** mode names use the mode role, with 700 in Workshop and Classic Arcade, 400 in Night Sleeve, and Newsreader 25px/500 in Movement Score and Botanical Folio.
- **Body:** descriptions and setting rows use compact 13px text; sheet paragraphs use line-height 1.65. Primary and secondary actions use 14px/600.
- **Label:** HUD and preview captions use the HUD label role. New-world tracking defaults to 0.015em; Basalt uses 0.035em, Night Sleeve 0.075em uppercase, Gate Board 0.055em uppercase, and Data Field 0.07em uppercase.
- **Numbers:** HUD, results, records and statistics use tabular numerals. New worlds also request lining numerals and tighter tracking. The primary HUD score is 22px; standard values are 17px, with the compact-width overrides described below.

The system display fallback in legacy themes and existing system-rendered control glyphs are incumbent compatibility details, not recommendations for new display identities or a new icon system.

## Layout

The centered home container has a maximum width of 480px; its top padding responds to viewport height. The centered game container has a maximum portrait width of 600px and fills the viewport after safe-area insets. Landscape uses the full safe width. The play area fills the safe screen height with a 4px top inset. A centered board is flanked by 48px side rails with 2px gutters: Hold and statistics on the left, Pause and a vertical five-piece Next queue on the right. Controls occupy clear space below or, in landscape, beside the board. Modal sheets max out at 440px and scroll within available height. Padding uses the recorded spacing values; this is an observed vocabulary rather than a mandatory mathematical scale.

Safe areas take the maximum of native CSS environment values and injected Android values on each side. The board is a 10-column by 20-visible-row Canvas; theme materials do not change that grid. The control layout module computes seven targets with a 48px minimum, five column footprints and an 8px row gap. It preserves movement/rotation order while offering mirrored, floating and other saved settings. Below 276px content width its documented overflow requirement remains applicable.

At viewport heights up to 650px, home spacing and mode padding compress. Side rails at least 300px tall use 11px labels, 18px values and 48 × 36px Next previews; shorter rails adapt to the available height, and rails shorter than 200px use 8px labels and 12px values while retaining 48px button targets; large scores use compact notation with their full value available through a title and accessible label. Landscape rail spacing compresses. These are shared responsive adaptations, not per-theme layouts.

**The Shared Geometry Rule.** Theme styling must not change the board sizing, safe areas, control placement or control geometry calculations.

## Elevation & Depth

The nine new worlds use borders, palette layers and Canvas material marks rather than floating sheets: their sheet shadow is `none` and modal backdrop blur is removed. The inherited modal scrim still dims the game. Legacy sheets retain a diffuse shadow and a 5px backdrop blur. Basalt and Movement Score retain their ruled material treatment; the playing screen has no top preview strip. Neon retains its bounded Canvas glow, while Ink retains tile bevels. These are native parts of their respective worlds.

Pressed controls use an inset accent outline, and the shared feedback indicator fades over 0.15s. Reduced-motion settings and the operating-system preference disable animations and transitions. Static piece patterns carry identity without animation.

## Shapes

The frontmatter records the recurring corner vocabulary. Basalt alternates softly cut corners; Workshop uses small squared corners; Night Sleeve and Movement Score combine nearly square chrome with 10px keys. Botanical Folio pairs round chrome with asymmetric keys. Gate Board uses 3px chrome and 6px keys; Design Annual uses square chrome and 2px keys; Data Field is square throughout. Classic Arcade uses round chrome, percentage-rounded keys and circular rotation controls. Legacy shapes remain varied by component: mode/resume cards 14px, sheets 18px, ordinary action buttons 10px and control keys 20%.

Tile geometry stays square, clipped inside each cell with a small proportional gap. Signature marks are drawn within that clip; they must remain legible in the small hold/next previews. Ghosts use dashed perimeters and a faint fill, with the LCD dash pattern distinct from the other themes.

## Components

### Buttons

Primary actions use accent and action ink, except the explicit Night Sleeve and Design Annual text/background inversion. Secondary actions use panel fill and a one-pixel border. Both have a 48px minimum height and 12px by 16px padding. Corners follow the selected theme. Focus is a 2px accent outline offset 3px; disabled buttons use half opacity. Hover changes are component-specific rather than a universal lift.

### Mode cards and navigation

Mode choices retain one shared flex-row anatomy: name and description at the left, directional control at the right. Their normal minimum height is 96px. Night Sleeve, Movement Score, Design Annual and Data Field use ruled lists; Workshop emphasizes the navy perimeter; Gate Board uses panel bands and a focused hover outline. Home utility navigation is a flexible row of transparent 48px-minimum buttons with surface hover fill. There is no chip or tag component to standardize.

### Sheets and fields

Sheets are bordered surface panels with 20px padding and theme corners. Header rows hold a title and close action. Settings use divider-separated rows with a 56px minimum row height. Selects are panel-colored with a 48px minimum height and 8px padding; range inputs reserve 48px height. Native checkboxes remain 24px within their setting rows. Preserve the platform behavior of these inputs and the visible focus treatment.

### Translucent control deck

Controls use the theme's RGB channel token and saved opacity (the stylesheet fallback is 0.18), with a 0.4-alpha border. Hover/pressed fill uses 0.38 alpha; pressed state adds a 2px inset accent line. New-world hard drop symbols take accent color. Control previews mirror the same material and corner vocabulary. Theme styling changes the skin while geometry remains calculated by `control-layout.ts`.

### Gamepad controls and editor

The default Gamepad is a shared functional control system across all themes: a translucent outlined T-shaped pad on the left with left/right across the upper row, a neutral center and soft drop beneath it. There is no up arm or up action. Separate circular actions use a two-row cluster: hard drop and hold above counterclockwise and clockwise rotation. Balanced, Compact and Mirrored presets keep that action order; mirroring swaps whole clusters. Legacy presets retain the theme-specific key shapes described above.

The pad is one editable group; hard drop, clockwise rotation, counterclockwise rotation and hold are four separate groups. Each stores normalized center position, relative size and background opacity in independent portrait/landscape maps. Geometry clamps targets to at least 48 px and separates groups by at least 8 px. The editor rejects collisions without moving other controls. Invalid legacy placements fall back to their own defaults; theme changes never move controls.

The editor uses the selected palette and a full-screen dialog with Cancel/Done, a bounded stage, selection feedback, Size/Opacity ranges and Reset layout. All edits stay in a draft until Done. Cancel/Escape/Android Back discard the draft; interrupted drags roll back. Reset layout affects only the visible orientation. The upper-center pad area is a neutral rest zone; sliding out of an active direction releases that pointer's action. Keyboard and other touch owners remain independent.

### Board, hold and next

The renderer shares one tile function across the board and previews. Data Field and Movement Score map I to horizontal marks, O to four dots, T to a cross, S and Z to opposing diagonal patterns, J to vertical lines, and L to nested squares. LCD uses its separate seven cutout identities. The preview centers the piece bounds and caps cells at 19px; dimmed hold pieces use 0.4 opacity. Ghost marks use a faint 0.07 fill and dashed outline. Canvas backing resolution follows device pixel ratio capped at 3.

**The Same Tile Rule.** Use the same block renderer for board, hold and next previews; keep ghost marks subordinate to solid pieces.

## Do's and Don'ts

### Do:

- **Do** preserve all thirteen selectable themes and their persisted identifiers.
- **Do** use the selected theme palette for the shell, board, hold, next, ghost and clear feedback.
- **Do** preserve the shared control geometry and visible keyboard focus.
- **Do** bundle new font assets locally with their licenses and preserve offline use.
- **Do** retain seven static piece patterns in Movement Score, Data Field and LCD.

### Don't:

- **Don't** introduce themed slogans or decorative overlays into play.
- **Don't** make theme selection reposition gameplay controls.
- **Don't** replace static piece patterns with color alone in the monochrome worlds.
- **Don't** impose one corner radius or one display face across all thirteen themes.

## Marathon setup

Marathon opens a compact setup sheet with Speed (Progressive or Fixed), Starting level (1–15), one short explanatory sentence and Start. Progression remains one level per ten cleared lines up to level 30; Fixed keeps the selected level. The setup stays separate from an existing paused run until Start and any replacement confirmation are accepted. The run stores its own options; legacy runs retain their previous behavior. Fixed results have separate score and line records.
