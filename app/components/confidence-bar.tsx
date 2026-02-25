import { InfoButton } from "./info-button";

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
        <span className="text-zinc-400 flex items-center">
          Confiance
          <InfoButton
            title="Indice de confiance"
            description="Indique à quel point le modèle est sûr de sa prédiction. 75%+ (vert) = forte conviction, 60-74% (orange) = conviction modérée, &lt;60% (rouge) = match incertain. Basé sur l'écart entre les probabilités des 3 issues."
          />
        </span>
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
