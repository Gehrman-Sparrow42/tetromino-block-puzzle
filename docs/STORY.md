# Story and practice modes

Story is a twelve-level solo campaign. Each level starts with an empty board and a line-clear goal. There are no lives, time limits, ads or purchases in campaign progression. Complete a level to unlock the next; completed levels can be replayed. Progress and per-level best score/time are stored on this installation.

Each level has four phases: introduction, faster burst, recovery and final push. The speed changes after a line clear reaches a phase threshold, including when a multi-line clear skips a threshold. The HUD shows the current speed and progress toward the goal. These speeds use the same gravity scale as Marathon; they do not alter movement-repeat settings, rotation, lock delay, Hold or the seven-piece bag.

| Level | Name            | Goal | Cleared-line threshold → speed  |
| ----- | --------------- | ---: | ------------------------------- |
| 1     | First Steps     |   12 | 0 → 1, 4 → 2, 6 → 1, 9 → 2      |
| 2     | Finding Rhythm  |   16 | 0 → 1, 6 → 3, 8 → 1, 12 → 3     |
| 3     | Steady Hands    |   20 | 0 → 2, 8 → 3, 11 → 2, 16 → 3    |
| 4     | Quickening      |   24 | 0 → 2, 9 → 4, 13 → 2, 19 → 4    |
| 5     | Second Wind     |   28 | 0 → 3, 11 → 4, 15 → 3, 22 → 4   |
| 6     | Rising Tide     |   32 | 0 → 3, 12 → 5, 17 → 3, 25 → 5   |
| 7     | Switchback      |   36 | 0 → 4, 14 → 6, 19 → 4, 28 → 6   |
| 8     | Momentum        |   40 | 0 → 4, 16 → 7, 22 → 5, 32 → 7   |
| 9     | High Ground     |   44 | 0 → 5, 17 → 8, 24 → 6, 35 → 8   |
| 10    | Crosswinds      |   48 | 0 → 6, 19 → 9, 26 → 7, 38 → 9   |
| 11    | Summit Approach |   52 | 0 → 7, 20 → 10, 28 → 8, 41 → 10 |
| 12    | Final Ascent    |   60 | 0 → 8, 24 → 11, 33 → 9, 48 → 11 |

Thresholds are inclusive. For example, Momentum uses speed 4 at 0–15 lines, 7 at 16–21, 5 at 22–31 and 7 from 32 until the 40-line goal. Clearing four rows at once can finish a stage up to three rows past its goal; the engine recognizes completion before considering the next spawn.

The initial difficulty curve increases both the required clears and the line-span-weighted falling rate at every level. Introductory and peak speeds never decrease between levels. Recovery phases ease the immediate pace without making the later stage easier overall. The final peak is speed 11, below the engine's maximum-gravity cap. Tests verify the curve and actual gravity timing; physical-player feedback may justify future tuning of `src/engine/story.ts`.

Pause/resume retains the stage, bag, active piece and phase. Restart retries the current stage. Starting another mode asks before replacing a resumable run. Story victories count as played games but do not change Marathon, Sprint or Ultra records. A failed progress write does not unlock the next level; the result screen offers a save retry.

## Optional tutorials

Tutorial is separate from Story and can be opened voluntarily from the main menu. Basics teaches movement, rotation, drops, clearing a row and Hold. Advanced practices ghost placement, Hold's once-per-piece restriction, a four-line clear, back-to-back four-line clears, and a T-spin double. The T-spin lesson requires soft-dropping into a prepared pocket and rotating before locking; a plain drop does not complete it.

Lessons use scripted practice boards with the real game engine. They wait for the required action or actual clear event instead of awarding success for merely reading instructions. Reset retries a lesson; Exit returns to the menu. Practice uses transient state and never replaces a saved run, changes records, or unlocks campaign levels. A background pause releases inputs and requires an explicit resume. The practice board stays still unless dropping is being demonstrated, so players can study the setup without racing gravity.
