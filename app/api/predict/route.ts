import { analyzePrediction } from "@/lib/claude-analyzer";
import { getStandings } from "@/lib/football-api";
import { findTeamInjuries, getInjuries } from "@/lib/injuries-api";
import { buildTeamPlayerAnalysis, findTeamKeyPlayers, getKeyPlayers } from "@/lib/players-api";
import { calculateStats } from "@/lib/prediction-engine";
import { LEAGUES } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body: { league: string; homeTeamId: number; awayTeamId: number };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { league, homeTeamId, awayTeamId } = body;

  if (!league || !LEAGUES.some((l) => l.code === league)) {
    return NextResponse.json({ error: "Ligue invalide" }, { status: 400 });
  }

  if (!homeTeamId || !awayTeamId) {
    return NextResponse.json({ error: "Équipes manquantes" }, { status: 400 });
  }

  if (homeTeamId === awayTeamId) {
    return NextResponse.json(
      { error: "Les deux équipes doivent être différentes" },
      { status: 400 }
    );
  }

  try {
    const [standings, allInjuries, allKeyPlayers] = await Promise.all([
      getStandings(league),
      getInjuries(league),
      getKeyPlayers(league),
    ]);

    const homeStanding = standings.find((s) => s.team.id === homeTeamId);
    const awayStanding = standings.find((s) => s.team.id === awayTeamId);

    if (!homeStanding || !awayStanding) {
      return NextResponse.json(
        { error: "Équipe introuvable dans le classement" },
        { status: 404 }
      );
    }

    const homeInjuries = findTeamInjuries(allInjuries, homeStanding.team.name);
    const awayInjuries = findTeamInjuries(allInjuries, awayStanding.team.name);

    const homeKeyPlayers = findTeamKeyPlayers(allKeyPlayers, homeStanding.team.name);
    const awayKeyPlayers = findTeamKeyPlayers(allKeyPlayers, awayStanding.team.name);

    const homePlayerAnalysis = buildTeamPlayerAnalysis(homeKeyPlayers, homeInjuries);
    const awayPlayerAnalysis = buildTeamPlayerAnalysis(awayKeyPlayers, awayInjuries);

    const statsScore = calculateStats(
      homeStanding,
      awayStanding,
      standings.length,
      homeInjuries,
      awayInjuries,
      homePlayerAnalysis.squadQualityScore,
      awayPlayerAnalysis.squadQualityScore
    );

    const prediction = await analyzePrediction({
      homeTeam: homeStanding.team,
      awayTeam: awayStanding.team,
      homeStanding,
      awayStanding,
      statsScore,
      leagueCode: league,
      homeInjuries,
      awayInjuries,
      homePlayerAnalysis,
      awayPlayerAnalysis,
    });

    return NextResponse.json(prediction);
  } catch (error) {
    console.error("Prediction error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la prédiction" },
      { status: 500 }
    );
  }
}
