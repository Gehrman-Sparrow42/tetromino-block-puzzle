import type { ClearEvent } from "../src/contracts/game-contract";
import { attackPercent } from "../src/online/protocol";

export interface BattleState {
  pending: { hole: number; readyAt: number }[];
  fraction: number;
  sent: number;
}
export function createBattleState(): BattleState {
  return { pending: [], fraction: 0, sent: 0 };
}
export function baseAttack(event: ClearEvent | null): number {
  if (!event || event.linesCleared === 0) return 0;
  const lines = event.linesCleared;
  const base =
    event.tSpin === "full"
      ? ([0, 2, 4, 6][lines] ?? 0)
      : event.tSpin === "mini"
        ? ([0, 1, 2][lines] ?? 0)
        : ([0, 0, 1, 2, 4][lines] ?? 0);
  return (
    base +
    (event.backToBack ? 1 : 0) +
    Math.min(4, Math.floor(Math.max(0, event.combo) / 2)) +
    (event.perfectClear ? 4 : 0)
  );
}
/** Integer carry preserves small nerfed attacks over multiple clears. */
export function scaledAttack(
  state: BattleState,
  event: ClearEvent | null,
  level: number,
): number {
  const hundredths = baseAttack(event) * attackPercent(level) + state.fraction;
  const result = Math.floor(hundredths / 100);
  state.fraction = hundredths % 100;
  return result;
}
/** Cancel oldest pending rows before sending the remainder to the opponent. */
export function cancelIncoming(state: BattleState, attack: number): number {
  const cancelled = Math.min(attack, state.pending.length);
  state.pending.splice(0, cancelled);
  return attack - cancelled;
}
export const GARBAGE_DELAY_MS = 750;
export const MAX_PENDING = 40;
export const MAX_RISE = 8;
/** Only mature rows rise, and only at a piece boundary chosen by the server. */
export function takeGarbage(state: BattleState, now: number): number[] {
  const holes: number[] = [];
  while (holes.length < MAX_RISE && state.pending[0]?.readyAt <= now)
    holes.push(state.pending.shift()!.hole);
  return holes;
}
