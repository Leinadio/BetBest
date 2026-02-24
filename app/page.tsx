import { PredictionForm } from "./components/prediction-form";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-white">
            Bet<span className="text-orange-500">Best</span>
          </h1>
          <p className="mt-2 text-zinc-400">
            Prédictions de matchs de football propulsées par l&apos;IA
          </p>
        </header>

        <PredictionForm />

        <footer className="mt-12 text-center text-xs text-zinc-600">
          Données fournies par football-data.org — Analyse par Claude (Anthropic)
        </footer>
      </div>
    </div>
  );
}
