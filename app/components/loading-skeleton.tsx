export function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6">
      <div className="flex items-center justify-center gap-4">
        <div className="h-10 w-10 rounded-full bg-zinc-700" />
        <div className="h-6 w-16 rounded bg-zinc-700" />
        <div className="h-10 w-10 rounded-full bg-zinc-700" />
      </div>
      <div className="mx-auto h-16 w-24 rounded-xl bg-zinc-700" />
      <div className="h-3 w-full rounded-full bg-zinc-700" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-zinc-700" />
        <div className="h-4 w-3/4 rounded bg-zinc-700" />
        <div className="h-4 w-1/2 rounded bg-zinc-700" />
      </div>
    </div>
  );
}
