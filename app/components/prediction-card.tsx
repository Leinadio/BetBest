import { Prediction } from "@/lib/types";
import { AnalysisBreakdown } from "./analysis-breakdown";
import { ConfidenceBar } from "./confidence-bar";
import Image from "next/image";

interface PredictionCardProps {
  prediction: Prediction;
}

const outcomeConfig = {
  "1": { label: "Victoire domicile", color: "bg-green-600", text: "1" },
  N: { label: "Match nul", color: "bg-zinc-500", text: "N" },
  "2": { label: "Victoire extérieur", color: "bg-blue-600", text: "2" },
};

export function PredictionCard({ prediction }: PredictionCardProps) {
  const config = outcomeConfig[prediction.outcome];

  return (
    <div className="space-y-5 rounded-xl border border-zinc-700 bg-zinc-900 p-6">
      {/* Teams */}
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <Image
            src={prediction.homeTeam.crest}
            alt={prediction.homeTeam.name}
            width={40}
            height={40}
          />
          <span className="font-semibold text-white">
            {prediction.homeTeam.shortName}
          </span>
        </div>
        <span className="text-zinc-500 text-sm">vs</span>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">
            {prediction.awayTeam.shortName}
          </span>
          <Image
            src={prediction.awayTeam.crest}
            alt={prediction.awayTeam.name}
            width={40}
            height={40}
          />
        </div>
      </div>

      {/* Outcome badge */}
      <div className="flex flex-col items-center gap-2">
        <div
          className={`${config.color} rounded-xl px-6 py-3 text-center`}
        >
          <div className="text-3xl font-bold text-white">{config.text}</div>
          <div className="text-xs text-white/80">{config.label}</div>
        </div>
      </div>

      {/* Fallback warning */}
      {prediction.isFallback && (
        <div className="rounded-lg bg-amber-900/30 border border-amber-700 px-4 py-2 text-xs text-amber-300">
          Analyse basée sur le modèle statistique uniquement (l'IA n'a pas pu générer d'analyse détaillée).
        </div>
      )}

      {/* Confidence */}
      <ConfidenceBar confidence={prediction.confidence} />

      {/* Structured Analysis */}
      {prediction.analysis ? (
        <div className="space-y-3">
          {[
            { key: "powerBalance" as const, title: "Rapport de force" },
            { key: "momentum" as const, title: "Dynamique récente" },
            { key: "tacticalEdge" as const, title: "Confrontation tactique" },
            { key: "contextualFactors" as const, title: "Facteurs contextuels" },
            { key: "verdict" as const, title: "Verdict" },
          ].map(({ key, title }) => {
            const text = prediction.analysis![key];
            if (!text) return null;
            return (
              <div key={key} className={`rounded-lg p-3 ${key === "verdict" ? "bg-zinc-700 border border-zinc-600" : "bg-zinc-800"}`}>
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">{title}</h4>
                <p className="text-sm text-zinc-200 leading-relaxed">{text}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg bg-zinc-800 p-4">
          <h4 className="text-sm font-medium text-zinc-400 mb-2">Analyse IA</h4>
          <p className="text-sm text-zinc-200 leading-relaxed">
            {prediction.reasoning}
          </p>
        </div>
      )}

      {/* Detailed analysis (collapsible) */}
      <AnalysisBreakdown prediction={prediction} />
    </div>
  );
}
