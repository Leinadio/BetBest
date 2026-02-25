"use client";

import { useState, useRef, useEffect } from "react";

interface InfoButtonProps {
  title: string;
  description: string;
}

export function InfoButton({ title, description }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-zinc-200 text-[9px] font-bold leading-none transition-colors ml-1.5 shrink-0"
        aria-label={`Info : ${title}`}
      >
        i
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-64 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl p-3 text-left">
          <div className="text-xs font-semibold text-zinc-200 mb-1">{title}</div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">{description}</p>
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-l border-t border-zinc-700 bg-zinc-900" />
        </div>
      )}
    </div>
  );
}
