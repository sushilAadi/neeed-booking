/** Small line above a large light title, with optional actions on the right. */
export function PageHead(p: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="chrome sticky top-[calc(68px+env(safe-area-inset-top))] z-20 -mx-4 flex flex-wrap items-end justify-between gap-4 px-4 pt-2 pb-4 md:-mx-8 md:px-8">
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
