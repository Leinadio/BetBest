import { analyzePrediction } from "@/lib/claude-analyzer";
import { getAllEloRatings, findTeamElo } from "@/lib/elo-api";
import { computeStrengthOfSchedule, getFinishedMatches, getHeadToHead, getMatchScheduleData, getRecentForm, getStandings } from "@/lib/football-api";
import { findTeamInjuries, getInjuries } from "@/lib/injuries-api";
import { getTeamNews } from "@/lib/news-api";
import { buildTeamPlayerAnalysis, findTeamKeyPlayers, findTeamPlayerForm, getKeyPlayers, getRecentPlayerForm } from "@/lib/players-api";
import { calculateStats } from "@/lib/prediction-engine";
import { getMatchContext, getMatchOdds, getRefereeStats } from "@/lib/match-context-api";
import { getLeagueTeamIds, getTeamTactics, resolveApiFootballTeamId } from "@/lib/tactics-api";
import { LEAGUES } from "@/lib/types";
import { getLeagueXG, findTeamXG } from "@/lib/understat-api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body: { league: string; homeTeamId: number; awayTeamId: number; matchDate?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { league, homeTeamId, awayTeamId, matchDate } = body;

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
    // Non-critical calls: failures return fallback instead of crashing the entire prediction
    async function safeCall<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
      try { return await fn(); } catch (err) {
        console.warn(`[predict] Non-critical call failed (${label}):`, err);
        return fallback;
      }
    }

    const emptyH2H = { matches: [] as { date: string; homeTeam: string; awayTeam: string; homeGoals: number; awayGoals: number }[], team1Wins: 0, draws: 0, team2Wins: 0 };

    const [standings, allInjuries, allKeyPlayers, formMap, allPlayerForms, teamIdMap, headToHead, leagueXG, allElo, finishedMatches] = await Promise.all([
      getStandings(league), // Critical — no standings = no prediction
      safeCall(() => getInjuries(league), {}, "injuries"),
      safeCall(() => getKeyPlayers(league), {}, "keyPlayers"),
      safeCall(() => getRecentForm(league), new Map<number, string>(), "recentForm"),
      safeCall(() => getRecentPlayerForm(league), {}, "playerForms"),
      safeCall(() => getLeagueTeamIds(league), new Map<string, number>(), "teamIds"),
      safeCall(() => getHeadToHead(league, homeTeamId, awayTeamId), emptyH2H, "h2h"),
      safeCall(() => getLeagueXG(league), {}, "xG"),
      safeCall(() => getAllEloRatings(), [], "elo"),
      safeCall(() => getFinishedMatches(league), [], "finishedMatches"),
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

    const homePlayerForm = findTeamPlayerForm(allPlayerForms, homeStanding.team.name);
    const awayPlayerForm = findTeamPlayerForm(allPlayerForms, awayStanding.team.name);

    const homeApiId = resolveApiFootballTeamId(teamIdMap, homeStanding.team.name);
    const awayApiId = resolveApiFootballTeamId(teamIdMap, awayStanding.team.name);

    const homeXG = findTeamXG(leagueXG, homeStanding.team.name);
    const awayXG = findTeamXG(leagueXG, awayStanding.team.name);
    const homeElo = findTeamElo(allElo, homeStanding.team.name);
    const awayElo = findTeamElo(allElo, awayStanding.team.name);
    const homeSOS = computeStrengthOfSchedule(homeTeamId, finishedMatches, standings);
    const awaySOS = computeStrengthOfSchedule(awayTeamId, finishedMatches, standings);

    const matchContext = getMatchContext(homeStanding, awayStanding, standings.length);

    const defaultSchedule = { fatigue: null as import("@/lib/types").ScheduleFatigue | null, refereeName: null as string | null };
    const [homeNews, awayNews, homeTactics, awayTactics, scheduleData, odds] = await Promise.all([
      safeCall(() => getTeamNews(homeStanding.team.name), [], "homeNews"),
      safeCall(() => getTeamNews(awayStanding.team.name), [], "awayNews"),
      safeCall(() => homeApiId ? getTeamTactics(homeApiId, league) : Promise.resolve(null), null, "homeTactics"),
      safeCall(() => awayApiId ? getTeamTactics(awayApiId, league) : Promise.resolve(null), null, "awayTactics"),
      safeCall(() => getMatchScheduleData(league, homeTeamId, awayTeamId), defaultSchedule, "scheduleData"),
      safeCall(() => getMatchOdds(league, homeStanding.team.name, awayStanding.team.name), null, "odds"),
    ]);

    const fatigue = scheduleData.fatigue;

    // Referee: name from football-data.org, stats from API-Football (previous season)
    const referee = scheduleData.refereeName
      ? await safeCall(() => getRefereeStats(league, scheduleData.refereeName!), null, "referee")
      : null;

    // Data quality logging — flag missing major sources
    const missing: string[] = [];
    if (!homeXG) missing.push(`xG(${homeStanding.team.name})`);
    if (!awayXG) missing.push(`xG(${awayStanding.team.name})`);
    if (!homeElo) missing.push(`ELO(${homeStanding.team.name})`);
    if (!awayElo) missing.push(`ELO(${awayStanding.team.name})`);
    if (!odds) missing.push("Cotes");
    if (!homeTactics) missing.push(`Tactique(${homeStanding.team.name})`);
    if (!awayTactics) missing.push(`Tactique(${awayStanding.team.name})`);
    if (!referee) missing.push("Arbitre");
    if (missing.length > 0) {
      console.warn(`[predict] Données manquantes pour ${homeStanding.team.name} vs ${awayStanding.team.name}: ${missing.join(", ")}`);
    }

    // Calculate stats AFTER tactics & fatigue are available
    const statsScore = calculateStats({
      homeStanding,
      awayStanding,
      homeInjuries,
      awayInjuries,
      homeSquadQuality: homePlayerAnalysis.squadQualityScore,
      awaySquadQuality: awayPlayerAnalysis.squadQualityScore,
      headToHead,
      homeTactics,
      awayTactics,
      fatigue,
      homeXG,
      awayXG,
      homeElo,
      awayElo,
      odds,
      homeSOS,
      awaySOS,
      homeCriticalAbsences: homePlayerAnalysis.criticalAbsences,
      awayCriticalAbsences: awayPlayerAnalysis.criticalAbsences,
      matchContext,
      referee,
    });

    const prediction = await analyzePrediction({
      homeTeam: homeStanding.team,
      awayTeam: awayStanding.team,
      homeStanding,
      awayStanding,
      statsScore,
      leagueCode: league,
      matchDate,
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
      headToHead,
      referee,
      odds,
      fatigue,
      matchContext,
      homeXG,
      awayXG,
      homeElo,
      awayElo,
      homeSOS,
      awaySOS,
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
