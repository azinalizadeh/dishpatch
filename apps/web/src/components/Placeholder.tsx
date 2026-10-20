/** Temporary screen body until each screen is built in its milestone. */
export function Placeholder({ title, milestone }: { title: string; milestone: string }) {
  return (
    <main className="mx-auto max-w-[1200px] p-s6">
      <h1 className="font-heading text-[40px] leading-[1.1] text-ink">{title}</h1>
      <p className="mt-s2 text-muted">Coming in {milestone}.</p>
    </main>
  );
}
