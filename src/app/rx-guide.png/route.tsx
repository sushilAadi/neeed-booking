import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** The picture at the top of the bot's "type a prescription" message — a real table, so nothing misaligns. */
export const dynamic = "force-static";

const ROWS = [
  ["Augmentin 625", "1-0-1", "AF", "5d"],
  ["Pan 40", "1-0-0", "BF", "7d"],
];
const KEY = [
  ["Time", "Morning - Afternoon - Night   (1 = take, 0 = skip)"],
  ["AF / BF", "After Food / Before Food"],
  ["Days", "how many days   (5d = 5 days)"],
];
const INK = "#14201c";
const MUTED = "#5a6b65";
const GREEN = "#0f7a5c";
const LINE = "#dbe3df";
const COLS = [380, 200, 150, 150];

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "18px 0",
        borderBottom: `${head ? 3 : 1}px solid ${head ? INK : LINE}`,
        fontSize: head ? 30 : 38,
        fontWeight: head ? 700 : 400,
        color: head ? MUTED : INK,
      }}
    >
      {cells.map((c, k) => (
        <div key={COLS[k]} style={{ width: COLS[k], display: "flex" }}>
          {c}
        </div>
      ))}
    </div>
  );
}

// Same Inter as the prescription PDF.
const font = (w: number) =>
  readFile(join(process.cwd(), `src/lib/rx/fonts/inter-${w}.woff`));

export async function GET() {
  const [regular, bold] = await Promise.all([font(400), font(700)]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        padding: "56px 64px",
        fontFamily: "Inter",
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 700, color: GREEN }}>
        Type one medicine per line
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
        <Row head cells={["Medicine", "Time", "Food", "Days"]} />
        {ROWS.map((r) => (
          <Row key={r[0]} cells={r} />
        ))}
        <div
          style={{
            display: "flex",
            padding: "18px 0",
            fontSize: 38,
            color: INK,
          }}
        >
          Advice: drink water
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 24,
          padding: "24px 28px",
          background: "#e2f2ec",
          borderRadius: 16,
          gap: 12,
        }}
      >
        {KEY.map(([k, v]) => (
          <div key={k} style={{ display: "flex", fontSize: 30, color: INK }}>
            <div style={{ width: 170, fontWeight: 700, display: "flex" }}>
              {k}
            </div>
            <div style={{ display: "flex" }}>{v}</div>
          </div>
        ))}
      </div>
    </div>,
    {
      width: 1080,
      height: 700,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
