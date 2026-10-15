/** Status donut (waiting / done / cancelled) with a legend. */
export function Ring(p: { waiting: number; done: number; cancelled: number }) {
  const total = p.waiting + p.done + p.cancelled;
  const parts = [
    { label: "Waiting", n: p.waiting, color: "var(--wait-fill)" },
    { label: "Done", n: p.done, color: "var(--done-fill)" },
    { label: "Cancelled", n: p.cancelled, color: "var(--danger)" },
  ];
  // SVG ring: one stroked circle per part, offset along the circumference.
  const C = 2 * Math.PI * 42;
  let at = 0;
  return (
    <div className="flex items-center gap-5">
      <svg
        viewBox="0 0 100 100"
        className="size-28 shrink-0 -rotate-90"
        role="img"
        aria-label={`${p.done} done, ${p.waiting} waiting, ${p.cancelled} cancelled`}
      >
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="var(--sunk)"
          strokeWidth="12"
        />
        {total > 0 &&
          parts.map((x) => {
            const len = (x.n / total) * C;
            const el = (
              <circle
                key={x.label}
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={x.color}
                strokeWidth="12"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-at}
              />
            );
            at += len;
            return el;
          })}
      </svg>
      <ul className="grid gap-2 text-sm">
        {parts.map((x) => (
          <li key={x.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: x.color }}
            />
            {x.label}
            <span className="font-semibold">{x.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
