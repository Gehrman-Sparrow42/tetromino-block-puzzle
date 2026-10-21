# Control usability repair — 2.5.0

The reported preview and placement mismatch was confirmed in code and browser rendering. Settings invented a 420px viewport and cropped it to the buttons; the editor used a smaller stage as its coordinate system; gameplay used the full play area. The collision solver could reposition unrelated groups while an edit was being saved.

The repair uses one measured gameplay viewport and uniform scaling for the editor and complete Settings preview. Rejected moves retain the last valid placement. Presets use a two-row action cluster and offer Balanced, Compact and Mirrored. Fixed and Dynamic pad modes are explicit; Dynamic touch-down defines a neutral origin, shows its marker and accepts relative left/right/down input. There is no up command. Per-group position, size and opacity, separate orientation maps, safe-area handling, staged save/cancel and legacy layouts remain.

Evidence: 134 unit tests, 51 browser scenarios, installed Android offline tests including simultaneous movement/rotation, upgrade preservation and direct standalone HTML without network requests. Preview glyph overflow found during visual inspection was corrected and its centers/bounds checked. Final detector: 0 primary, 32 advisory differences in incumbent styling. Native and browser screenshots are retained outside Git in the task artifacts.

References considered: [official Tetris controls](https://playstudios.helpshift.com/hc/en/16-tetris-mobile/faq/2944-tetris-controls/) and [TETR.IO PLUS touch-control options](https://you.have.fail/tetrio/touchcontrols/). These inform choice of input styles, not a claim that another game's controls were copied or that ergonomics are proven.

Argon timed out before changing files; this is not an Argon approval. Two native workers handled separable geometry/persistence and editor/preview work. Physical-phone comfort remains for the owner's next test.
