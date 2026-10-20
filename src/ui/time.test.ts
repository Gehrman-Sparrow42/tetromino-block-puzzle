import { describe, expect, it } from "vitest";
import { formatTime } from "./app";

describe("mode time display", () => {
  it("keeps one second visible until an Ultra countdown actually expires", () => {
    expect(formatTime(999, false, true)).toBe("00:01");
    expect(formatTime(1, false, true)).toBe("00:01");
    expect(formatTime(0, false, true)).toBe("00:00");
    expect(formatTime(-50, false, true)).toBe("00:00");
  });
  it("distinguishes Sprint results to hundredths without rounding into the next second", () => {
    expect(formatTime(61999, true)).toBe("01:01.99");
    expect(formatTime(62005, true)).toBe("01:02.00");
    expect(formatTime(62015, true)).toBe("01:02.01");
  });
});
