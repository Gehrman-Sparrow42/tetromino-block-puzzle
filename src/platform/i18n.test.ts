/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLanguage,
  getLocale,
  setLanguage,
  subscribeLanguage,
  t,
  TURKISH,
} from "./i18n";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { appTr } from "../locales/app.tr";
import { practiceTr } from "../locales/practice.tr";
import { onlineTr } from "../locales/online.tr";

afterEach(() => setLanguage("en"));
describe("instant English/Turkish language selection", () => {
  it("keeps English keys unchanged and provides Turkish without reloading", () => {
    expect(getLanguage()).toBe("en");
    expect(t("Test ad")).toBe("Test ad");
    setLanguage("tr");
    expect(t("Test ad")).toBe("Deneme reklamı");
    expect(getLocale()).toBe("tr-TR");
    setLanguage("en");
    expect(t("Test ad")).toBe("Test ad");
    expect(getLocale()).toBe("en-US");
  });
  it("replaces named values once while preserving user text and unknown fallback", () => {
    expect(t("Room {code}", { code: "{name}" })).toBe("Room {name}");
    setLanguage("tr");
    expect(t("unregistered {name}", { name: "Berkay <3" })).toBe(
      "unregistered Berkay <3",
    );
  });
  it("notifies only real changes and disposes subscriptions", () => {
    const notify = vi.fn();
    const dispose = subscribeLanguage(notify);
    setLanguage("tr");
    setLanguage("tr");
    expect(notify).toHaveBeenCalledTimes(1);
    dispose();
    setLanguage("en");
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it("preserves all named placeholders and nonempty translations", () => {
    const variables = (s: string) =>
      [...s.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort();
    for (const [source, translation] of Object.entries(TURKISH)) {
      expect(translation.trim(), source).not.toBe("");
      expect(variables(translation), source).toEqual(variables(source));
    }
  });
  it("covers every explicit English key and static UI marker", () => {
    for (const path of [
      "src/ui/app.ts",
      "src/ui/tutorial.ts",
      "src/ui/control-editor.ts",
      "src/ui/online-screen.ts",
      "src/ui/canvas-renderer.ts",
      "src/platform/rewarded-ads.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      const tree = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const check = (key: string) =>
        expect(TURKISH[key], `${path}: ${key}`).toBeDefined();
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "t" &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        )
          check(node.arguments[0].text);
        ts.forEachChild(node, visit);
      };
      visit(tree);
      for (const marker of source.matchAll(
        /data-i18n(?:-[a-z-]+)?="([^"$]+)"/g,
      ))
        check(marker[1]);
    }
  });
  it("uses consistent translations for shared labels", () => {
    const seen: Record<string, string> = {};
    for (const catalog of [appTr, practiceTr, onlineTr])
      for (const [key, value] of Object.entries(catalog)) {
        if (seen[key]) expect.soft(value, key).toBe(seen[key]);
        seen[key] = value;
      }
  });
});
