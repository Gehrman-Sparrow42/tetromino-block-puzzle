# English and Turkish

Settings contains an immediate English/Türkçe selector. Its `language` value is saved in the existing settings record. Legacy or unsupported values use English, preserving the previous default. Changing language refreshes authored labels and the current Settings sheet without reloading the app or resetting a run, theme, control layout, or server address. The theme disclosure, scroll position and language-field focus are retained.

`src/platform/i18n.ts` owns the selected language, locale and change subscriptions. English source phrases are readable keys. Turkish strings live in `src/locales/app.tr.ts`, `practice.tr.ts` and `online.tr.ts`; platform preview text is kept beside the translator. These are bundled with the app, so language changes require no network or translation service.

Use `t("Level {level}", { level })` with named variables rather than joining translated fragments. Keep variable names intact in each translation. User names, server addresses, room codes, theme identifiers, mode identifiers and protocol values are data, not translation keys. Existing DOM-safe rendering remains responsible for HTML escaping where needed. Main-app static labels have explicit translation markers; there is no document-wide text replacement or MutationObserver translator.

Numbers use the selected locale. The document's `lang` attribute follows the setting, including Turkish casing behavior. Both bundled fonts contain ÇĞİÖŞÜçğıöşü. Game mechanics such as T-spin, brands and language autonyms retain their names.

Catalog tests check named-variable parity, shared-label consistency and every literal translator call/static marker in the owned UI. Browser tests cover immediate switching, persistence, safe legacy migration, both complete playable tutorial tracks including T-spin, Story, editor, themes, records, help and Online errors. A live mixed-language room test checks that player names and protocol values stay unchanged while each client sees its own language. Shorten copy or adapt layout when Turkish wraps at compact phone sizes; do not shrink touch targets to fit a longer label.
