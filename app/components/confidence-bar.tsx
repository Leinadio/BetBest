interface ConfidenceBarProps {
  confidence: number;
}

export function ConfidenceBar({ confidence }: ConfidenceBarProps) {
  const color =
    confidence >= 75
      ? "bg-green-500"
      : confidence >= 60
        ? "bg-orange-500"
        : "bg-red-500";

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-400">Confiance</span>
        <span className="font-semibold text-white">{confidence}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-zinc-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${color}`}
          style={{ width: `${confidence}%` }}
        />
      </div>
    </div>
  );
}
