/** PNG, JPEG or WebP by magic bytes (never trust a file name or browser-sent type). */
export function imageType(
  b: Uint8Array,
): { ext: "png" | "jpg" | "webp"; mime: string } | null {
  const at = (sig: number[], off = 0) => sig.every((x, i) => b[off + i] === x);
  if (at([0x89, 0x50, 0x4e, 0x47])) return { ext: "png", mime: "image/png" };
  if (at([0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8))
    return { ext: "webp", mime: "image/webp" };
  return null;
}
