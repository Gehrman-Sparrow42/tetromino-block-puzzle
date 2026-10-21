# Gamepad controls

## Approved brief

The user approved a gamepad-style layout based on supplied screenshots, with a three-way movement pad and no up button. The earlier agreed scope includes larger outlined translucent controls, a draggable/resizable layout editor, per-control opacity, reset, and separate portrait/landscape layouts. This extends the existing thirteen-theme interface; it does not introduce a replacement visual world.

## Behavior

- Left thumb: left and right across the top row, neutral center and soft drop below.
- Right thumb: clockwise/counterclockwise rotation, hard drop and hold as separate controls.
- Sliding between movement zones changes that pointer's action; neutral/outside/cancel releases it. Keyboard and second-pointer ownership stay independent.
- Editor changes are drafts. Done saves; Cancel, Escape and Android Back discard. Cancelled drags roll back.
- Positions are normalized within the play area and saved separately for portrait and landscape. Geometry clamps sizes/positions, prevents overlap and maintains at least 48 px targets with 8 px separation between groups.
- Gamepad is the new-settings default. Existing saved preset selections remain valid; users can switch through Settings. Thumb, Left-handed and Floating remain available.

## Appearance

Keep the full board horizontally centered and visible above the Gamepad controls with an 8 px gutter. Fit the largest centered, clear 10-by-20 board from the top of the play area, including edited control positions. Short screens use two action rows. The movement pad is an outlined T with no upper arm. Actions are circular and retain the selected theme's colors. The editor uses the current theme, short labels and a bounded stage; unused spacing stays hidden in Gamepad mode while height remains adjustable. Theme changes do not move controls.

## Verification evidence

See VALIDATION.md and `.impeccable/critique/gamepad-controls-review.md`. Browser rendering and installed Android checks cover phone and landscape layouts. Physical-phone thumb comfort remains unverified.

## Control usability repair — 2.5.0

Balanced, Compact and Mirrored presets use two action rows. Fixed and Dynamic movement are distinct: Dynamic anchors relative input at touch-down in the movement area with a visible neutral-origin marker and cancels on release, blur or pause. Settings preview and editor use the actual gameplay viewport and uniform scaling. Invalid edits retain the last valid placement; unrelated groups do not teleport. Choosing a preset resets custom maps explicitly. Existing saved maps remain stored and legacy presets remain available.
