import { appTr } from "../locales/app.tr";
import { practiceTr } from "../locales/practice.tr";
import { onlineTr } from "../locales/online.tr";

export type Language = "en" | "tr";
type Values = Readonly<Record<string, string | number>>;
export const LANGUAGES = ["en", "tr"] as const;
const platformTr: Record<string, string> = {
  "Test ad": "Deneme reklamı",
  "Preview only. No real ad is loaded.":
    "Yalnızca önizleme. Gerçek reklam yüklenmez.",
  "Complete test ad": "Deneme reklamını tamamla",
  "Cancel test ad": "Deneme reklamını iptal et",
};
export const TURKISH = { ...platformTr, ...practiceTr, ...onlineTr, ...appTr };
let language: Language = "en";
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return language;
}
export function getLocale(): "en-US" | "tr-TR" {
  return language === "tr" ? "tr-TR" : "en-US";
}
export function setLanguage(value: Language): void {
  const next = value === "tr" ? "tr" : "en";
  if (typeof document !== "undefined") document.documentElement.lang = next;
  if (language === next) return;
  language = next;
  for (const listener of listeners) listener();
}
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Source-English keys stay readable in code; variables are replaced once, never reinterpreted as keys. */
export function t(source: string, values: Values = {}): string {
  const template = language === "tr" ? (TURKISH[source] ?? source) : source;
  return template.replace(
    /\{([A-Za-z][A-Za-z0-9_]*)\}/g,
    (token, key: string) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? String(values[key])
        : token,
  );
}
