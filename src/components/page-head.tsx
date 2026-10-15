/** Small line above a large light title, with optional actions on the right. */
export function PageHead(p: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{p.eyebrow}</p>
        <h1 className="page-title display mt-1">{p.title}</h1>
      </div>
      {p.children && (
        <div className="flex flex-wrap items-center gap-2">{p.children}</div>
      )}
    </div>
  );
}
