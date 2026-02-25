"use client";

import { useState, useEffect, useRef } from "react";
import { Match, Prediction } from "@/lib/types";
import { LeagueSelector } from "./league-selector";
import { MatchList } from "./match-list";
import { PredictionCard } from "./prediction-card";
import { LoadingSkeleton } from "./loading-skeleton";

interface MatchdayGroup {
  matchday: number;
  matches: Match[];
}

interface MatchesApiResponse {
  currentMatchday: number;
  matchdays: MatchdayGroup[];
}

export function PredictionForm() {
  const [league, setLeague] = useState("");
  const [matchdays, setMatchdays] = useState<MatchdayGroup[]>([]);
  const [activeMatchday, setActiveMatchday] = useState<number>(0);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!league) {
      setMatchdays([]);
      setActiveMatchday(0);
      setSelectedMatch(null);
      return;
    }

    setMatchesLoading(true);
    setSelectedMatch(null);
    setPrediction(null);
    setError(null);

    fetch(`/api/matches?league=${league}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erreur de chargement");
        return res.json() as Promise<MatchesApiResponse>;
      })
      .then((data) => {
        setMatchdays(data.matchdays);
        setActiveMatchday(data.currentMatchday);
      })
      .catch(() => setError("Impossible de charger les matchs"))
      .finally(() => setMatchesLoading(false));
  }, [league]);

  const abortRef = useRef<AbortController | null>(null);

  async function handleSelectMatch(match: Match) {
    // Abort any in-flight prediction request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout

    setSelectedMatch(match);
    setLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          matchDate: match.utcDate,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMsg = "Erreur de prédiction";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch { /* response wasn't JSON (timeout, proxy error, etc.) */ }
        throw new Error(errorMsg);
      }

      const data: Prediction = await res.json();
      setPrediction(data);
    } catch (err) {
      // Only update state if this controller is still the active one (avoids race condition)
      if (abortRef.current !== controller) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("L'analyse a pris trop de temps. Réessayez.");
      } else {
        setError(err instanceof Error ? err.message : "Erreur inattendue");
      }
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }

  const activeMatches =
    matchdays.find((md) => md.matchday === activeMatchday)?.matches ?? [];

  return (
    <div className="space-y-6">
      <LeagueSelector
        value={league}
        onChange={setLeague}
        disabled={loading}
      />

      {matchesLoading && (
        <p className="text-sm text-zinc-400 animate-pulse">
          Chargement des matchs...
        </p>
      )}

      {/* Onglets journées */}
      {matchdays.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {matchdays.map((md) => (
            <button
              key={md.matchday}
              onClick={() => {
                setActiveMatchday(md.matchday);
                setSelectedMatch(null);
                setPrediction(null);
                setError(null);
              }}
              disabled={loading}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                md.matchday === activeMatchday
                  ? "bg-orange-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              J{md.matchday}
            </button>
          ))}
        </div>
      )}

      {/* Un seul matchday : afficher le titre */}
      {matchdays.length === 1 && (
        <h2 className="text-sm font-semibold text-zinc-400">
          Journée {matchdays[0].matchday}
        </h2>
      )}

      {/* Liste des matchs */}
      {activeMatches.length > 0 && (
        <MatchList
          matches={activeMatches}
          selectedMatchId={selectedMatch?.id ?? null}
          onSelectMatch={handleSelectMatch}
          disabled={loading}
        />
      )}

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {prediction && <PredictionCard prediction={prediction} />}
    </div>
  );
}
