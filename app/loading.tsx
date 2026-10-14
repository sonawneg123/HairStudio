export default function Loading() {
  return (
    <section
      aria-label="Loading"
      className="flex flex-1 items-center justify-center py-20"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="size-8 animate-spin rounded-full border-4 border-border border-t-primary"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </section>
  );
}
