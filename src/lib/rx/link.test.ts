import { expect, test } from "vitest";
import { cleanRxPayload, signRxToken, verifyRxToken } from "./link";

const NOW = new Date("2026-07-30T09:00:00Z");
const ID = "5b039563-b504-41de-95a4-3508c01ba783";

test("a signed token verifies for 6 hours, then expires", () => {
  const t = signRxToken(ID, NOW, "secret");
  expect(verifyRxToken(t, NOW, "secret")).toBe(ID);
  expect(verifyRxToken(t, new Date(+NOW + 5.9 * 3600_000), "secret")).toBe(ID);
  expect(
    verifyRxToken(t, new Date(+NOW + 6.1 * 3600_000), "secret"),
  ).toBeNull();
});

test("tampered or foreign tokens fail", () => {
  const t = signRxToken(ID, NOW, "secret");
  expect(verifyRxToken(t, NOW, "other")).toBeNull();
  expect(verifyRxToken(`${t}x`, NOW, "secret")).toBeNull();
  expect(verifyRxToken("garbage", NOW, "secret")).toBeNull();
  expect(verifyRxToken(t, NOW, "")).toBeNull();
});

test("cleanRxPayload keeps valid medicines and rejects junk", () => {
  expect(
    cleanRxPayload({
      meds: [
        {
          name: "  Augmentin 625 ",
          dose: [1, 0, 1],
          food: "after",
          duration: "3 days",
        },
        {
          name: "Dolo 650",
          dose: null,
          sos: true,
          food: "any",
          duration: "Ongoing",
        },
        { name: "", dose: [1, 0, 0], food: "after", duration: "3 days" },
      ],
      advice: " Drink water ",
    }),
  ).toEqual({
    meds: [
      {
        name: "Augmentin 625",
        dose: [1, 0, 1],
        food: "after",
        duration: "3 days",
      },
      {
        name: "Dolo 650",
        dose: null,
        sos: true,
        food: "any",
        duration: "Ongoing",
      },
    ],
    advice: ["Drink water"],
  });
  expect(
    cleanRxPayload({
      meds: [{ name: "X", dose: [9, 0, 0], food: "after", duration: "3 days" }],
      advice: "",
    }),
  ).toBeNull();
  expect(
    cleanRxPayload({
      meds: [{ name: "X", dose: [1, 0, 0], food: "lunch", duration: "3 days" }],
      advice: "",
    }),
  ).toBeNull();
  expect(cleanRxPayload({ meds: [], advice: "" })).toBeNull();
  expect(cleanRxPayload(null)).toBeNull();
  expect(
    cleanRxPayload({
      meds: Array.from({ length: 21 }, () => ({
        name: "X",
        dose: null,
        food: null,
        duration: null,
      })),
      advice: "",
    }),
  ).toBeNull();
});
