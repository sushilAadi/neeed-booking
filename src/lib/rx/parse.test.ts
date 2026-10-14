import { expect, test } from "vitest";
import { parseRx } from "./parse";

test("shorthand lines become structured medicines", () => {
  const rx = parseRx(`Tablet Augmentin 625 1-0-1 after food 3 days
Erinac P 100mg/500mg Tablet 1-0-1 AF 3d
Montair LC 5mg/10mg Tablet 0-0-1 after food 5 days
Pan D Tablet 1-0-1 BF 5 days
Advice: Drink plenty of water. Review after 5 days if symptoms persist.`);
  expect(rx.meds).toEqual([
    {
      name: "Tablet Augmentin 625",
      dose: [1, 0, 1],
      food: "after",
      duration: "3 days",
    },
    {
      name: "Erinac P 100mg/500mg Tablet",
      dose: [1, 0, 1],
      food: "after",
      duration: "3 days",
    },
    {
      name: "Montair LC 5mg/10mg Tablet",
      dose: [0, 0, 1],
      food: "after",
      duration: "5 days",
    },
    {
      name: "Pan D Tablet",
      dose: [1, 0, 1],
      food: "before",
      duration: "5 days",
    },
  ]);
  expect(rx.advice).toEqual([
    "Drink plenty of water. Review after 5 days if symptoms persist.",
  ]);
});

test("Latin abbreviations and other separators", () => {
  expect(parseRx("Cetirizine 10mg - HS - 5 days").meds[0]).toEqual({
    name: "Cetirizine 10mg",
    dose: [0, 0, 1],
    food: null,
    duration: "5 days",
  });
  expect(parseRx("Dolo 650 | TDS | after meal | 1 week").meds[0]).toEqual({
    name: "Dolo 650",
    dose: [1, 1, 1],
    food: "after",
    duration: "1 week",
  });
  expect(parseRx("Vitamin D3 OD empty stomach 2 weeks").meds[0]).toMatchObject({
    dose: [1, 0, 0],
    food: "before",
    duration: "2 weeks",
  });
  expect(parseRx("Syrup Benadryl 2-2-2 5ml").meds[0]).toMatchObject({
    name: "Syrup Benadryl 5ml",
    dose: [2, 2, 2],
  });
  expect(parseRx("Paracetamol 500mg BD").meds[0]).toMatchObject({
    dose: [1, 0, 1],
  });
});

test("a line with no schedule is kept as a plain medicine; blank lines ignored", () => {
  expect(parseRx("Steam inhalation\n\n  ").meds).toEqual([
    { name: "Steam inhalation", dose: null, food: null, duration: null },
  ]);
});

test("advice variants", () => {
  expect(parseRx("advice - rest at home\nAdv: no cold drinks").advice).toEqual([
    "rest at home",
    "no cold drinks",
  ]);
});
