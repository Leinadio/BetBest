#!/usr/bin/env tsx

/**
 * BetBest Backtesting Framework
 *
 * Usage: npx tsx scripts/backtest.ts [LEAGUE_CODE]
 * Example: npx tsx scripts/backtest.ts PL
 *
 * Tests the prediction engine against actual results from the current season.
 * Reconstructs standings at each matchday to avoid data leakage.
 *
 * API calls: 4 total (standings + finished matches + xG + ELO)
 */

import * as fs from "fs";
import * as path from "path";
import { getFinishedMatches, getStandings, computeStrengthOfSchedule } from "../lib/football-api";
import { getLeagueXG, findTeamXG } from "../lib/understat-api";
import { getAllEloRatings, findTeamElo } from "../lib/elo-api";
import { getMatchContext } from "../lib/match-context-api";
import { calculateStats } from "../lib/prediction-engine";
import { Standing, Team, HeadToHeadRecord, LEAGUES, StatsScore } from "../lib/types";

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local introuvable. Créez-le avec FOOTBALL_DATA_API_KEY=...");
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinishedMatch {
  utcDate: string;
  homeTeam: { id: number };
  awayTeam: { id: number };
  score: { fullTime: { home: number | null; away: number | null } };
}

interface TeamStats {
  team: Team;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  results: string[]; // Chronological W/D/L
}

interface MatchResult {
  homeTeam: string;
  awayTeam: string;
  predicted: { home: number; draw: number; away: number };
  predictedOutcome: "1" | "N" | "2";
  actual: "1" | "N" | "2";
  correct: boolean;
}

// ---------------------------------------------------------------------------
// Reconstruct standings from matches played BEFORE a given match
// ---------------------------------------------------------------------------

function buildStandings(
  matchesBefore: FinishedMatch[],
  teamMap: Map<number, Team>
): Standing[] {
  const stats = new Map<number, TeamStats>();

  for (const [id, team] of teamMap) {
    stats.set(id, {
      team,
      played: 0, won: 0, draw: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
      results: [],
    });
  }

  for (const m of matchesBefore) {
    const hg = m.score.fullTime.home;
    const ag = m.score.fullTime.away;
    if (hg === null || ag === null) continue;

    const homeId = m.homeTeam.id;
    const awayId = m.awayTeam.id;

    // Ensure both teams have an entry
    for (const tid of [homeId, awayId]) {
      if (!stats.has(tid)) {
        const team = teamMap.get(tid) ?? {
          id: tid, name: `Team ${tid}`, shortName: `T${tid}`, tla: "???", crest: "",
        };
        stats.set(tid, {
          team, played: 0, won: 0, draw: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, points: 0, results: [],
        });
      }
    }

    const home = stats.get(homeId)!;
    const away = stats.get(awayId)!;

    home.played++;
    away.played++;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;

    if (hg > ag) {
      home.won++; home.points += 3; away.lost++;
      home.results.push("W"); away.results.push("L");
    } else if (hg < ag) {
      away.won++; away.points += 3; home.lost++;
      home.results.push("L"); away.results.push("W");
    } else {
      home.draw++; away.draw++; home.points++; away.points++;
      home.results.push("D"); away.results.push("D");
    }
  }

  // Build sorted Standing[]
  const standings: Standing[] = [];
  for (const s of stats.values()) {
    if (s.played === 0) continue;
    standings.push({
      position: 0,
      team: s.team,
      playedGames: s.played,
      won: s.won,
      draw: s.draw,
      lost: s.lost,
      points: s.points,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalDifference: s.goalsFor - s.goalsAgainst,
      form: s.results.slice(-5).reverse().join(",") || null,
    });
  }

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.id - b.team.id;
  });

  standings.forEach((s, i) => (s.position = i + 1));
  return standings;
}

// ---------------------------------------------------------------------------
// Head-to-head from prior matches this season
// ---------------------------------------------------------------------------

function computeH2H(
  matchesBefore: FinishedMatch[],
  team1Id: number,
  team2Id: number,
  teamMap: Map<number, Team>
): HeadToHeadRecord {
  const h2hMatches = matchesBefore.filter((m) => {
    const ids = [m.homeTeam.id, m.awayTeam.id];
    return ids.includes(team1Id) && ids.includes(team2Id);
  });

  let team1Wins = 0;
  let draws = 0;
  let team2Wins = 0;

  const matches = h2hMatches
    .filter((m) => m.score.fullTime.home !== null && m.score.fullTime.away !== null)
    .map((m) => {
      const hg = m.score.fullTime.home!;
      const ag = m.score.fullTime.away!;

      if (hg === ag) {
        draws++;
      } else {
        const winnerId = hg > ag ? m.homeTeam.id : m.awayTeam.id;
        if (winnerId === team1Id) team1Wins++;
        else team2Wins++;
      }

      return {
        date: m.utcDate,
        homeTeam: teamMap.get(m.homeTeam.id)?.name ?? `Team ${m.homeTeam.id}`,
        awayTeam: teamMap.get(m.awayTeam.id)?.name ?? `Team ${m.awayTeam.id}`,
        homeGoals: hg,
        awayGoals: ag,
      };
    });

  return { matches, team1Wins, draws, team2Wins };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface CalibrationBucket {
  label: string;
  min: number;
  max: number;
  sumPredicted: number;
  sumActual: number;
  count: number;
}

function computeMetrics(results: MatchResult[]) {
  const n = results.length;
  if (n === 0) return null;

  // Accuracy
  const correct = results.filter((r) => r.correct).length;
  const accuracy = correct / n;

  // Brier score & log-loss
  let brierSum = 0;
  let logLossSum = 0;
  const eps = 1e-6;

  for (const r of results) {
    const pH = r.predicted.home / 100;
    const pD = r.predicted.draw / 100;
    const pA = r.predicted.away / 100;
    const aH = r.actual === "1" ? 1 : 0;
    const aD = r.actual === "N" ? 1 : 0;
    const aA = r.actual === "2" ? 1 : 0;

    brierSum += (pH - aH) ** 2 + (pD - aD) ** 2 + (pA - aA) ** 2;
    logLossSum -= aH * Math.log(Math.max(eps, pH))
      + aD * Math.log(Math.max(eps, pD))
      + aA * Math.log(Math.max(eps, pA));
  }

  const brierScore = brierSum / n;
  const logLoss = logLossSum / n;

  // Per-outcome accuracy
  const homeResults = results.filter((r) => r.actual === "1");
  const drawResults = results.filter((r) => r.actual === "N");
  const awayResults = results.filter((r) => r.actual === "2");

  const homeCorrect = homeResults.filter((r) => r.correct).length;
  const drawCorrect = drawResults.filter((r) => r.correct).length;
  const awayCorrect = awayResults.filter((r) => r.correct).length;

  // Calibration buckets
  const bucketDefs = [
    { label: "0-20%", min: 0, max: 20 },
    { label: "20-30%", min: 20, max: 30 },
    { label: "30-40%", min: 30, max: 40 },
    { label: "40-50%", min: 40, max: 50 },
    { label: "50-60%", min: 50, max: 60 },
    { label: "60%+", min: 60, max: 100 },
  ];

  const buckets: CalibrationBucket[] = bucketDefs.map((d) => ({
    ...d, sumPredicted: 0, sumActual: 0, count: 0,
  }));

  for (const r of results) {
    const entries = [
      { prob: r.predicted.home, hit: r.actual === "1" ? 1 : 0 },
      { prob: r.predicted.draw, hit: r.actual === "N" ? 1 : 0 },
      { prob: r.predicted.away, hit: r.actual === "2" ? 1 : 0 },
    ];

    for (const { prob, hit } of entries) {
      const bucket = buckets.find((b) => prob >= b.min && prob < b.max)
        ?? buckets[buckets.length - 1];
      bucket.sumPredicted += prob;
      bucket.sumActual += hit;
      bucket.count++;
    }
  }

  return {
    total: n,
    accuracy,
    brierScore,
    logLoss,
    homeAccuracy: homeResults.length > 0 ? homeCorrect / homeResults.length : 0,
    drawAccuracy: drawResults.length > 0 ? drawCorrect / drawResults.length : 0,
    awayAccuracy: awayResults.length > 0 ? awayCorrect / awayResults.length : 0,
    homeCount: homeResults.length,
    drawCount: drawResults.length,
    awayCount: awayResults.length,
    homeCorrect,
    drawCorrect,
    awayCorrect,
    calibration: buckets,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnv();

  const leagueCode = process.argv[2] ?? "PL";
  const league = LEAGUES.find((l) => l.code === leagueCode);
  if (!league) {
    console.error(`❌ Ligue inconnue: ${leagueCode}. Options: ${LEAGUES.map((l) => l.code).join(", ")}`);
    process.exit(1);
  }

  const startTime = Date.now();
  console.log(`\n═══ BetBest Backtest — ${league.name} ${league.flag} ═══\n`);
  console.log("Chargement des données...");

  // 4 API calls in parallel
  const [currentStandings, finishedMatches, allXG, allElo] = await Promise.all([
    getStandings(leagueCode),
    getFinishedMatches(leagueCode),
    getLeagueXG(leagueCode),
    getAllEloRatings(),
  ]);

  // Team ID → Team mapping (from current standings)
  const teamMap = new Map<number, Team>();
  for (const s of currentStandings) {
    teamMap.set(s.team.id, s.team);
  }

  // Valid matches sorted chronologically
  const validMatches: FinishedMatch[] = finishedMatches
    .filter((m) => m.score.fullTime.home !== null && m.score.fullTime.away !== null)
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());

  const hasXG = Object.keys(allXG).length > 0;
  const hasELO = allElo.length > 0;

  console.log(`  ${validMatches.length} matchs terminés`);
  console.log(`  xG: ${hasXG ? `${Object.keys(allXG).length} équipes` : "✗"}`);
  console.log(`  ELO: ${hasELO ? "✓" : "✗"}`);
  console.log(`\nBacktest en cours...\n`);

  const results: MatchResult[] = [];
  const MIN_MATCHES = 5;

  for (let i = 0; i < validMatches.length; i++) {
    const match = validMatches[i];
    const matchesBefore = validMatches.slice(0, i);

    // Skip if either team hasn't played enough matches yet
    const homePlayedBefore = matchesBefore.filter(
      (m) => m.homeTeam.id === match.homeTeam.id || m.awayTeam.id === match.homeTeam.id
    ).length;
    const awayPlayedBefore = matchesBefore.filter(
      (m) => m.homeTeam.id === match.awayTeam.id || m.awayTeam.id === match.awayTeam.id
    ).length;

    if (homePlayedBefore < MIN_MATCHES || awayPlayedBefore < MIN_MATCHES) {
      continue;
    }

    // Reconstruct standings from prior matches
    const standings = buildStandings(matchesBefore, teamMap);
    const homeStanding = standings.find((s) => s.team.id === match.homeTeam.id);
    const awayStanding = standings.find((s) => s.team.id === match.awayTeam.id);
    if (!homeStanding || !awayStanding) continue;

    const homeTeamName = homeStanding.team.name;
    const awayTeamName = awayStanding.team.name;

    // xG (season snapshot — known limitation)
    const homeXG = findTeamXG(allXG, homeTeamName);
    const awayXG = findTeamXG(allXG, awayTeamName);

    // ELO (snapshot — known limitation)
    const homeElo = findTeamElo(allElo, homeTeamName);
    const awayElo = findTeamElo(allElo, awayTeamName);

    // SOS from prior matches
    const homeSOS = computeStrengthOfSchedule(match.homeTeam.id, matchesBefore, standings);
    const awaySOS = computeStrengthOfSchedule(match.awayTeam.id, matchesBefore, standings);

    // H2H from prior matches this season
    const headToHead = computeH2H(matchesBefore, match.homeTeam.id, match.awayTeam.id, teamMap);

    // Match context
    const matchContext = getMatchContext(homeStanding, awayStanding, standings.length);

    // Run prediction engine
    const statsScore: StatsScore = calculateStats({
      homeStanding,
      awayStanding,
      headToHead: headToHead.matches.length > 0 ? headToHead : undefined,
      homeXG,
      awayXG,
      homeElo,
      awayElo,
      homeSOS,
      awaySOS,
      matchContext,
      // Not available: odds, injuries, tactics, fatigue, referee, squadQuality
    });

    // Actual result
    const hg = match.score.fullTime.home!;
    const ag = match.score.fullTime.away!;
    const actual: "1" | "N" | "2" = hg > ag ? "1" : hg < ag ? "2" : "N";

    // Predicted outcome
    const { homeScore, drawScore, awayScore } = statsScore;
    let predictedOutcome: "1" | "N" | "2";
    if (homeScore >= drawScore && homeScore >= awayScore) predictedOutcome = "1";
    else if (awayScore >= homeScore && awayScore >= drawScore) predictedOutcome = "2";
    else predictedOutcome = "N";

    results.push({
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      predicted: { home: homeScore, draw: drawScore, away: awayScore },
      predictedOutcome,
      actual,
      correct: predictedOutcome === actual,
    });

    if (results.length % 50 === 0) {
      process.stdout.write(`  ${results.length} matchs testés...\r`);
    }
  }

  // ---------------------------------------------------------------------------
  // Display results
  // ---------------------------------------------------------------------------

  const metrics = computeMetrics(results);
  if (!metrics) {
    console.error("❌ Aucun match testé.");
    process.exit(1);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`═══ RÉSULTATS ═══\n`);
  console.log(`Matchs testés : ${metrics.total}`);
  console.log(`Données : xG ${hasXG ? "✓" : "✗"}  ELO ${hasELO ? "✓" : "✗"}  Cotes ✗  Injuries ✗  Tactics ✗  Referee ✗\n`);
  console.log(`  Accuracy :     ${(metrics.accuracy * 100).toFixed(1)}% (baseline: 33.3%)`);
  console.log(`  Brier Score :  ${metrics.brierScore.toFixed(3)} (baseline: 0.667)`);
  console.log(`  Log-Loss :     ${metrics.logLoss.toFixed(3)}\n`);

  console.log(`PAR OUTCOME`);
  console.log(`  Home (1) :  ${(metrics.homeAccuracy * 100).toFixed(1)}% accuracy (${metrics.homeCorrect}/${metrics.homeCount} victoires dom.)`);
  console.log(`  Draw (N) :  ${(metrics.drawAccuracy * 100).toFixed(1)}% accuracy (${metrics.drawCorrect}/${metrics.drawCount} nuls)`);
  console.log(`  Away (2) :  ${(metrics.awayAccuracy * 100).toFixed(1)}% accuracy (${metrics.awayCorrect}/${metrics.awayCount} victoires ext.)\n`);

  console.log(`CALIBRATION`);
  for (const b of metrics.calibration) {
    if (b.count === 0) continue;
    const avgPred = (b.sumPredicted / b.count).toFixed(1);
    const avgActual = ((b.sumActual / b.count) * 100).toFixed(1);
    console.log(`  ${b.label.padEnd(7)} prédit ~${avgPred}% → réel ${avgActual}% (n=${b.count})`);
  }

  console.log(`\nDurée : ${duration}s`);
}

main().catch((err) => {
  console.error("❌ Erreur:", err);
  process.exit(1);
});
