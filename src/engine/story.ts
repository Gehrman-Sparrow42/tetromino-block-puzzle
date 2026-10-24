export interface StoryLevel {
  readonly id: number;
  readonly title: string;
  readonly targetLines: number;
  readonly phases: readonly {
    readonly fromLine: number;
    readonly speed: number;
  }[];
}

const goals = [12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 60];
const introductions = [1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8];
const peaks = [2, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11];
const titles = [
  "First Steps",
  "Finding Rhythm",
  "Steady Hands",
  "Quickening",
  "Second Wind",
  "Rising Tide",
  "Switchback",
  "Momentum",
  "High Ground",
  "Crosswinds",
  "Summit Approach",
  "Final Ascent",
];

/** Each chapter has a short burst, recovery, and final push. No speed reaches the 16ms cap. */
export const STORY_LEVELS: readonly StoryLevel[] = Object.freeze(
  goals.map((targetLines, index) => {
    const intro = introductions[index];
    const peak = peaks[index];
    const recovery = Math.max(intro, peak - 2);
    return Object.freeze({
      id: index + 1,
      title: titles[index],
      targetLines,
      phases: Object.freeze([
        Object.freeze({ fromLine: 0, speed: intro }),
        Object.freeze({ fromLine: Math.floor(targetLines * 0.4), speed: peak }),
        Object.freeze({
          fromLine: Math.floor(targetLines * 0.55),
          speed: recovery,
        }),
        Object.freeze({ fromLine: Math.floor(targetLines * 0.8), speed: peak }),
      ]),
    });
  }),
);

export function getStoryLevel(id: number): StoryLevel | undefined {
  return Number.isInteger(id)
    ? STORY_LEVELS.find((level) => level.id === id)
    : undefined;
}

export function storySpeedForLines(level: StoryLevel, lines: number): number {
  let speed = level.phases[0].speed;
  for (const phase of level.phases) {
    if (lines < phase.fromLine) break;
    speed = phase.speed;
  }
  return speed;
}
