import { expect, test } from "vitest";
import { LANGS, TEXT, typedLang } from "./patient-text";

// WhatsApp rejects longer text: button 20, list row title 24, row description 72, list button 20.
test("every language fits WhatsApp's limits", () => {
  for (const l of LANGS) {
    const t = TEXT[l];
    const len = (x: string) => [...x].length;
    for (const b of [
      t.back,
      t.skip,
      t.bookAgain,
      t.menu,
      t.yesName("Ramesh K"),
    ])
      expect(len(b), `${l} button "${b}"`).toBeLessThanOrEqual(20);
    for (const b of [t.menuButton, t.chooseTime, t.selectAppt, t.chooseVisit])
      expect(len(b), `${l} list button "${b}"`).toBeLessThanOrEqual(20);
    for (const r of [t.book, t.mine, t.cancel, t.rx, t.chat, t.language]) {
      expect(len(r.title), `${l} "${r.title}"`).toBeLessThanOrEqual(24);
      expect(len(r.description), `${l} "${r.description}"`).toBeLessThanOrEqual(
        72,
      );
    }
    for (const p of Object.values(t.period))
      expect(len(`${p} (99)`), `${l} period "${p}"`).toBeLessThanOrEqual(20);
    expect(len(t.laterTimes)).toBeLessThanOrEqual(24);
  }
});

test("typed language answers", () => {
  expect(typedLang("1")).toBe("en");
  expect(typedLang("Hindi")).toBe("hi");
  expect(typedLang("नमस्ते")).toBe("hi");
  expect(typedLang("নমস্কাৰ")).toBe("as");
  expect(typedLang("hello")).toBe(null);
});
