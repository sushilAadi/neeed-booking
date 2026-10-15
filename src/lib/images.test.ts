import { expect, test } from "vitest";
import { imageType } from "./images";

test("imageType trusts the bytes, not the name", () => {
  expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]))).toEqual({
    ext: "png",
    mime: "image/png",
  });
  expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
    ext: "jpg",
    mime: "image/jpeg",
  });
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  expect(imageType(webp)).toEqual({ ext: "webp", mime: "image/webp" });
  expect(imageType(new TextEncoder().encode("<svg"))).toBe(null);
  expect(imageType(new Uint8Array([]))).toBe(null);
});
