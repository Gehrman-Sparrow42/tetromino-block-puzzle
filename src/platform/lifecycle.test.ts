import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: false,
  addListener: vi.fn(),
  exitApp: vi.fn(),
  impact: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: mocks.addListener, exitApp: mocks.exitApp },
}));
vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact: mocks.impact },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" },
}));
import { setupLifecycle, exitApp } from "./lifecycle";
import { pulseHaptic } from "./haptics";
import { playSound } from "./audio";
import { DEFAULT_SETTINGS } from "./storage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("pauses on browser blur or hidden state and removes listeners", async () => {
  const doc = new EventTarget() as EventTarget & { visibilityState: string };
  doc.visibilityState = "visible";
  const win = new EventTarget();
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  const onPause = vi.fn();
  const onBack = vi.fn();
  const dispose = await setupLifecycle({ onPause, onBack });
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(onPause).not.toHaveBeenCalled();
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(new Event("blur"));
  expect(onPause).toHaveBeenCalledTimes(2);
  expect(mocks.addListener).not.toHaveBeenCalled();
  dispose();
  win.dispatchEvent(new Event("blur"));
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(onPause).toHaveBeenCalledTimes(2);
});

it("handles Android app state and back and cleans native listeners", async () => {
  mocks.native = true;
  const listeners: Record<string, (data: { isActive: boolean }) => void> = {};
  const remove = vi.fn().mockResolvedValue(undefined);
  mocks.addListener.mockImplementation(async (kind, listener) => {
    listeners[kind] = listener;
    return { remove };
  });
  const onPause = vi.fn();
  const onBack = vi.fn();
  const dispose = await setupLifecycle({ onPause, onBack });
  listeners.appStateChange({ isActive: true });
  listeners.appStateChange({ isActive: false });
  listeners.backButton({ isActive: true });
  expect(onPause).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
  dispose();
  dispose();
  listeners.backButton({ isActive: true });
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(2);
});

it("tolerates rejected native APIs and optional feedback failures", async () => {
  mocks.native = true;
  mocks.addListener.mockRejectedValue(new Error("unsupported"));
  mocks.exitApp.mockRejectedValue(new Error("unsupported"));
  mocks.impact.mockRejectedValue(new Error("unsupported"));
  const dispose = await setupLifecycle({ onPause: vi.fn(), onBack: vi.fn() });
  dispose();
  await expect(exitApp()).resolves.toBeUndefined();
  expect(() => pulseHaptic("clear", DEFAULT_SETTINGS)).not.toThrow();
  mocks.native = false;
  vi.stubGlobal("navigator", {
    vibrate() {
      throw new Error("denied");
    },
  });
  expect(() => pulseHaptic("light", DEFAULT_SETTINGS)).not.toThrow();
  const constructor = vi.fn(() => {
    throw new Error("blocked");
  });
  vi.stubGlobal("AudioContext", constructor);
  playSound("move", { ...DEFAULT_SETTINGS, soundEnabled: false });
  expect(constructor).not.toHaveBeenCalled();
  expect(() => playSound("clear", DEFAULT_SETTINGS)).not.toThrow();
});
