import { analyzePrediction } from "@/lib/claude-analyzer";
import { getRecentForm, getStandings } from "@/lib/football-api";
import { findTeamInjuries, getInjuries } from "@/lib/injuries-api";
import { getTeamNews } from "@/lib/news-api";
import { buildTeamPlayerAnalysis, findTeamKeyPlayers, findTeamPlayerForm, getKeyPlayers, getRecentPlayerForm } from "@/lib/players-api";
import { calculateStats } from "@/lib/prediction-engine";
import { getLeagueTeamIds, getTeamTactics, resolveApiFootballTeamId } from "@/lib/tactics-api";
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
    const [standings, allInjuries, allKeyPlayers, formMap, allPlayerForms, teamIdMap] = await Promise.all([
      getStandings(league),
      getInjuries(league),
      getKeyPlayers(league),
      getRecentForm(league),
      getRecentPlayerForm(league),
      getLeagueTeamIds(league),
    ]);

    // Enrichir les standings avec la forme calculée
    for (const s of standings) {
      if (!s.form) {
        s.form = formMap.get(s.team.id) ?? null;
      }
    }

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

    const homePlayerForm = findTeamPlayerForm(allPlayerForms, homeStanding.team.name);
    const awayPlayerForm = findTeamPlayerForm(allPlayerForms, awayStanding.team.name);

    const homeApiId = resolveApiFootballTeamId(teamIdMap, homeStanding.team.name);
    const awayApiId = resolveApiFootballTeamId(teamIdMap, awayStanding.team.name);

    const [homeNews, awayNews, homeTactics, awayTactics] = await Promise.all([
      getTeamNews(homeStanding.team.name),
      getTeamNews(awayStanding.team.name),
      homeApiId ? getTeamTactics(homeApiId, league) : Promise.resolve(null),
      awayApiId ? getTeamTactics(awayApiId, league) : Promise.resolve(null),
    ]);

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
      homePlayerForm,
      awayPlayerForm,
      homeNews,
      awayNews,
      homeTactics,
      awayTactics,
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
