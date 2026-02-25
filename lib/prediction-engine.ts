import { CalculateStatsInput, CriticalAbsence, Injury, Stakes, StatsScore } from "./types";

/** Retourne fallback si value est null, undefined ou NaN. */
function safeNum(value: number | null | undefined, fallback: number): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return value;
}

function formScore(form: string | null): number {
  if (!form) return 0.5;
  const results = form.split(",").map((r) => r.trim());
  if (results.length === 0) return 0.5;

  // Recency weights: first result = most recent = heaviest weight
  const weights = [0.30, 0.25, 0.20, 0.15, 0.10];
  let weighted = 0;
  let totalWeight = 0;

  for (let i = 0; i < results.length; i++) {
    const w = weights[i] ?? 0.10;
    const pts = results[i] === "W" ? 1 : results[i] === "D" ? 0.4 : 0;
    weighted += pts * w;
    totalWeight += w;
  }

  return totalWeight > 0 ? weighted / totalWeight : 0.5;
}

/** Points-per-match from a record (wins*3 + draws) / played, normalized to [0,1]. */
function recordPPM(record: { played: number; wins: number; draws: number } | undefined): number {
  if (!record || record.played === 0) return 0.5;
  return (record.wins * 3 + record.draws) / (record.played * 3);
}

/** Convert ELO to a 0-1 score. Top 5 leagues range ~1350-2100. */
function eloToScore(elo: number): number {
  return Math.max(0, Math.min(1, (elo - 1350) / 750));
}

/** Convert bookmaker odds to implied probability. */
function oddsToProb(odds: number): number {
  return odds > 0 ? 1 / odds : 0;
}

export function calculateStats(input: CalculateStatsInput): StatsScore {
  const {
    homeStanding, awayStanding, homeInjuries, awayInjuries,
    homeSquadQuality, awaySquadQuality, headToHead,
    homeTactics, awayTactics, fatigue, homeXG, awayXG,
    homeElo, awayElo, odds, homeSOS, awaySOS,
    homeCriticalAbsences, awayCriticalAbsences,
    matchContext, referee,
  } = input;

  const factors: StatsScore["factors"] = [];

  // ====== CORE FACTORS ======

  // 1. ELO Rating (7%)
  const homeEloScore = homeElo ? eloToScore(safeNum(homeElo.elo, 1650)) : 0.5;
  const awayEloScore = awayElo ? eloToScore(safeNum(awayElo.elo, 1650)) : 0.5;
  factors.push({
    label: "Rating ELO",
    homeValue: homeElo ? `${Math.round(homeElo.elo)}` : "N/A",
    awayValue: awayElo ? `${Math.round(awayElo.elo)}` : "N/A",
    weight: 0.07,
  });

  // 2. xG Performance (12%) — recent 5-match, threshold 3.0, 40% attack / 60% defense
  let homeXGScore = 0.5;
  let awayXGScore = 0.5;
  let homeXGLabel = "N/A";
  let awayXGLabel = "N/A";

  if (homeXG) {
    const xgpm = safeNum(homeXG.recentXGPerMatch, safeNum(homeXG.xGPerMatch, 1.2));
    const xgapm = safeNum(homeXG.recentXGAPerMatch, safeNum(homeXG.xGAPerMatch, 1.2));
    const attackScore = Math.min(xgpm / 2.5, 1);
    const defenseScore = Math.max(0, 1 - xgapm / 2.5);
    homeXGScore = attackScore * 0.4 + defenseScore * 0.6;
    homeXGLabel = `${xgpm.toFixed(2)} xG, ${xgapm.toFixed(2)} xGA (5m)`;
  }

  if (awayXG) {
    const xgpm = safeNum(awayXG.recentXGPerMatch, safeNum(awayXG.xGPerMatch, 1.2));
    const xgapm = safeNum(awayXG.recentXGAPerMatch, safeNum(awayXG.xGAPerMatch, 1.2));
    const attackScore = Math.min(xgpm / 2.5, 1);
    const defenseScore = Math.max(0, 1 - xgapm / 2.5);
    awayXGScore = attackScore * 0.4 + defenseScore * 0.6;
    awayXGLabel = `${xgpm.toFixed(2)} xG, ${xgapm.toFixed(2)} xGA (5m)`;
  }

  factors.push({
    label: "xG récent (5 matchs)",
    homeValue: homeXGLabel,
    awayValue: awayXGLabel,
    weight: 0.12,
  });

  // 3. Form - last 5 matches (8%)
  const homeFormScore = formScore(homeStanding.form);
  const awayFormScore = formScore(awayStanding.form);
  factors.push({
    label: "Forme récente (5 matchs)",
    homeValue: homeStanding.form ?? "N/A",
    awayValue: awayStanding.form ?? "N/A",
    weight: 0.08,
  });

  // ====== CONTEXTUAL FACTORS ======

  // 4. Home/Away performance (10%)
  let homeVenueScore: number;
  let awayVenueScore: number;
  let homeVenueLabel: string;
  let awayVenueLabel: string;

  if (homeTactics?.homeRecord && homeTactics.homeRecord.played > 0) {
    homeVenueScore = recordPPM(homeTactics.homeRecord);
    const r = homeTactics.homeRecord;
    homeVenueLabel = `${r.wins}V ${r.draws}N ${r.losses}D (dom)`;
  } else {
    // Modern home advantage is ~46% win rate (PL 2022-2025), calibrated fallback
    homeVenueScore = 0.55;
    homeVenueLabel = "Domicile";
  }

  if (awayTactics?.awayRecord && awayTactics.awayRecord.played > 0) {
    awayVenueScore = recordPPM(awayTactics.awayRecord);
    const r = awayTactics.awayRecord;
    awayVenueLabel = `${r.wins}V ${r.draws}N ${r.losses}D (ext)`;
  } else {
    awayVenueScore = 0.45;
    awayVenueLabel = "Extérieur";
  }

  factors.push({
    label: "Bilan dom/ext",
    homeValue: homeVenueLabel,
    awayValue: awayVenueLabel,
    weight: 0.10,
  });

  // 5. xG Trend (5%) — momentum indicator
  const homeXGTrendScore = homeXG?.xGTrend != null ? (safeNum(homeXG.xGTrend, 0) + 1) / 2 : 0.5;
  const awayXGTrendScore = awayXG?.xGTrend != null ? (safeNum(awayXG.xGTrend, 0) + 1) / 2 : 0.5;
  const fmtTrend = (t: number | undefined | null) => {
    if (t == null) return "N/A";
    const arrow = t > 0.05 ? "↑" : t < -0.05 ? "↓" : "→";
    return `${arrow} ${t > 0 ? "+" : ""}${t.toFixed(2)}`;
  };
  factors.push({
    label: "Tendance xG",
    homeValue: fmtTrend(homeXG?.xGTrend),
    awayValue: fmtTrend(awayXG?.xGTrend),
    weight: 0.05,
  });

  // 6. Injuries (8%) — role-weighted using critical absences
  const computeInjuryPenalty = (
    injuries: Injury[] | undefined,
    criticals: CriticalAbsence[] | undefined
  ): number => {
    let penalty = 0;

    // NFD normalize: strip diacritics for cross-source player name matching (Mbappé→mbappe)
    const nfdLower = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const criticalPlayerNames = (criticals ?? []).map((c) => nfdLower(c.player.name));
    const isCriticalPlayer = (injName: string): boolean => {
      const injNorm = nfdLower(injName);
      return criticalPlayerNames.some((critNorm) => {
        if (injNorm.includes(critNorm) || critNorm.includes(injNorm)) return true;
        const injParts = injNorm.split(" ");
        const critParts = critNorm.split(" ");
        if (injParts.length >= 2 && critParts.length >= 2) {
          const lastMatch = injParts[injParts.length - 1] === critParts[critParts.length - 1];
          const firstInitial = injParts[0][0] === critParts[0][0];
          return lastMatch && firstInitial;
        }
        return false;
      });
    };

    for (const ca of criticals ?? []) {
      const contributions = ca.player.goals + ca.player.assists;
      const productivityFactor = Math.min(contributions / 15, 1);
      const rolePenalty =
        ca.player.role === "both" ? 0.20 :
        ca.player.role === "scorer" ? 0.15 : 0.10;
      penalty += rolePenalty * productivityFactor;
    }

    const nonCriticalCount = (injuries ?? []).filter(
      (inj) => !isCriticalPlayer(inj.player)
    ).length;
    penalty += nonCriticalCount * 0.03;

    return Math.min(penalty, 0.8);
  };

  const homeInjPenalty = computeInjuryPenalty(homeInjuries, homeCriticalAbsences);
  const awayInjPenalty = computeInjuryPenalty(awayInjuries, awayCriticalAbsences);
  const homeInjScore = 1 - homeInjPenalty;
  const awayInjScore = 1 - awayInjPenalty;

  const homeInjCount = homeInjuries?.length ?? 0;
  const awayInjCount = awayInjuries?.length ?? 0;
  const homeCritCount = homeCriticalAbsences?.length ?? 0;
  const awayCritCount = awayCriticalAbsences?.length ?? 0;
  factors.push({
    label: "Joueurs absents",
    homeValue: homeCritCount > 0 ? `${homeInjCount} (${homeCritCount} clés)` : `${homeInjCount} absent${homeInjCount !== 1 ? "s" : ""}`,
    awayValue: awayCritCount > 0 ? `${awayInjCount} (${awayCritCount} clés)` : `${awayInjCount} absent${awayInjCount !== 1 ? "s" : ""}`,
    weight: 0.08,
  });

  // 7. Squad quality (4%)
  const homeSquadScore = safeNum(homeSquadQuality, 0.5);
  const awaySquadScore = safeNum(awaySquadQuality, 0.5);
  factors.push({
    label: "Qualité effectif",
    homeValue: `${Math.round(homeSquadScore * 100)}%`,
    awayValue: `${Math.round(awaySquadScore * 100)}%`,
    weight: 0.04,
  });

  // 8. Schedule fatigue (6%)
  let homeFatigueScore = 0.5;
  let awayFatigueScore = 0.5;
  let homeFatigueLabel = "N/A";
  let awayFatigueLabel = "N/A";

  if (fatigue) {
    const fatigueScoreFn = (t: typeof fatigue.home) => {
      let restScore = 0.5;
      if (t.daysSinceLastMatch !== null) {
        const d = t.daysSinceLastMatch;
        restScore = d <= 1 ? 0.2 : d === 2 ? 0.4 : d <= 4 ? 0.6 : 0.8;
      }
      const loadScore = Math.max(0, 1 - safeNum(t.matchesLast30Days, 4) / 12);
      return restScore * 0.6 + loadScore * 0.4;
    };

    homeFatigueScore = fatigueScoreFn(fatigue.home);
    awayFatigueScore = fatigueScoreFn(fatigue.away);

    const fmtFatigue = (t: typeof fatigue.home) => {
      const parts: string[] = [];
      if (t.daysSinceLastMatch !== null) parts.push(`${t.daysSinceLastMatch}j repos`);
      parts.push(`${t.matchesLast30Days}m/30j`);
      return parts.join(", ");
    };
    homeFatigueLabel = fmtFatigue(fatigue.home);
    awayFatigueLabel = fmtFatigue(fatigue.away);
  }

  factors.push({
    label: "Fatigue calendrier",
    homeValue: homeFatigueLabel,
    awayValue: awayFatigueLabel,
    weight: 0.06,
  });

  // 9. Head-to-head (2%) — PPM-style: draws count as 1/3 victory
  const h2hTotal = headToHead ? headToHead.team1Wins + headToHead.draws + headToHead.team2Wins : 0;
  const homeH2HScore = h2hTotal > 0
    ? (headToHead!.team1Wins * 3 + headToHead!.draws) / (h2hTotal * 3)
    : 0.5;
  const awayH2HScore = h2hTotal > 0
    ? (headToHead!.team2Wins * 3 + headToHead!.draws) / (h2hTotal * 3)
    : 0.5;
  factors.push({
    label: "Confrontations directes",
    homeValue: h2hTotal > 0 ? `${headToHead!.team1Wins}V ${headToHead!.draws}N ${headToHead!.team2Wins}D` : "N/A",
    awayValue: h2hTotal > 0 ? `${headToHead!.team2Wins}V ${headToHead!.draws}N ${headToHead!.team1Wins}D` : "N/A",
    weight: 0.02,
  });

  // 10. Defensive solidity (2%)
  let homeDefScore = 0.5;
  let awayDefScore = 0.5;
  let homeDefLabel = "N/A";
  let awayDefLabel = "N/A";

  if (homeTactics) {
    const csRate = homeTactics.homeRecord.played > 0
      ? homeTactics.cleanSheets.home / homeTactics.homeRecord.played
      : 0;
    const parsedGA = parseFloat(homeTactics.goalsAgainstAvg.home);
    const gaAvg = Number.isNaN(parsedGA) ? 1.5 : parsedGA;
    homeDefScore = csRate * 0.5 + Math.max(0, 1 - gaAvg / 3) * 0.5;
    homeDefLabel = `${homeTactics.cleanSheets.home} CS, ${homeTactics.goalsAgainstAvg.home} enc/m`;
  }

  if (awayTactics) {
    const csRate = awayTactics.awayRecord.played > 0
      ? awayTactics.cleanSheets.away / awayTactics.awayRecord.played
      : 0;
    const parsedGA = parseFloat(awayTactics.goalsAgainstAvg.away);
    const gaAvg = Number.isNaN(parsedGA) ? 1.5 : parsedGA;
    awayDefScore = csRate * 0.5 + Math.max(0, 1 - gaAvg / 3) * 0.5;
    awayDefLabel = `${awayTactics.cleanSheets.away} CS, ${awayTactics.goalsAgainstAvg.away} enc/m`;
  }

  factors.push({
    label: "Solidité défensive",
    homeValue: homeDefLabel,
    awayValue: awayDefLabel,
    weight: 0.02,
  });

  // 11. Strength of Schedule (5%)
  const homeSOSScore = homeSOS ? safeNum(homeSOS.sosScore, 0.5) : 0.5;
  const awaySOSScore = awaySOS ? safeNum(awaySOS.sosScore, 0.5) : 0.5;
  factors.push({
    label: "Difficulté calendrier",
    homeValue: homeSOS ? `Top ${Math.round((1 - homeSOS.sosScore) * 100)}% (avg pos ${homeSOS.recentOpponentsAvgPosition})` : "N/A",
    awayValue: awaySOS ? `Top ${Math.round((1 - awaySOS.sosScore) * 100)}% (avg pos ${awaySOS.recentOpponentsAvgPosition})` : "N/A",
    weight: 0.05,
  });

  // 12. Match Context / Stakes (4%)
  let homeContextScore = 0.5;
  let awayContextScore = 0.5;

  const stakesValue: Record<Stakes, number> = {
    title: 0.65,
    europe: 0.58,
    midtable: 0.50,
    relegation: 0.55,
  };
  const stakeLabels: Record<Stakes, string> = {
    title: "Titre",
    europe: "Europe",
    midtable: "Mi-tableau",
    relegation: "Maintien",
  };

  if (matchContext) {
    homeContextScore = stakesValue[matchContext.homeStakes];
    awayContextScore = stakesValue[matchContext.awayStakes];

    if (matchContext.isDerby) {
      homeContextScore = homeContextScore * 0.85 + 0.5 * 0.15;
      awayContextScore = awayContextScore * 0.85 + 0.5 * 0.15;
    }
  }

  factors.push({
    label: "Enjeux du match",
    homeValue: matchContext ? `${stakeLabels[matchContext.homeStakes]}${matchContext.isDerby ? " (Derby)" : ""}` : "N/A",
    awayValue: matchContext ? `${stakeLabels[matchContext.awayStakes]}${matchContext.isDerby ? " (Derby)" : ""}` : "N/A",
    weight: 0.04,
  });

  // 13. Referee profile (2%)
  let homeRefScore = 0.5;
  let awayRefScore = 0.5;
  let refLabel = "N/A";

  if (referee && referee.matchesOfficiated >= 3) {
    const severityScore = Math.min(1, (safeNum(referee.avgYellowsPerMatch, 3.5) - 2) / 4);
    const penaltyRate = safeNum(referee.penaltiesAwarded, 0) / Math.max(1, safeNum(referee.matchesOfficiated, 1));
    const penaltyFactor = Math.min(1, penaltyRate / 0.4);
    const baseRefScore = Math.max(0.2, Math.min(0.8, 0.5 - severityScore * 0.05 + penaltyFactor * 0.03));
    homeRefScore = baseRefScore;
    awayRefScore = baseRefScore;
    refLabel = `${referee.name} (${referee.avgYellowsPerMatch} j/m)`;
  }

  factors.push({
    label: "Profil arbitre",
    homeValue: refLabel,
    awayValue: refLabel,
    weight: 0.02,
  });

  // ====== MARKET ANCHOR (25%) ======

  // 14. Bookmaker odds (25%) — the market is the strongest single predictor
  let homeOddsScore = 0.5;
  let awayOddsScore = 0.5;
  let homeOddsLabel = "N/A";
  let awayOddsLabel = "N/A";

  if (odds) {
    const homeProb = oddsToProb(odds.homeWin);
    const drawProb = oddsToProb(odds.draw);
    const awayProb = oddsToProb(odds.awayWin);
    const totalProb = homeProb + drawProb + awayProb;
    const normHome = homeProb / totalProb;
    const normAway = awayProb / totalProb;
    homeOddsScore = normHome;
    awayOddsScore = normAway;
    homeOddsLabel = `${odds.homeWin} (${Math.round(normHome * 100)}%)`;
    awayOddsLabel = `${odds.awayWin} (${Math.round(normAway * 100)}%)`;
  }

  factors.push({
    label: "Cotes du marché",
    homeValue: homeOddsLabel,
    awayValue: awayOddsLabel,
    weight: 0.25,
  });

  // ====== WEIGHTED COMPOSITE (proportional redistribution) ======
  // When odds are absent, redistribute their 25% weight proportionally to each factor's
  // original weight rather than uniformly. This avoids over-amplifying weak signals (SOS, H2H).
  const oddsAvailable = !!odds;

  const baseWeights = {
    odds: 0.25, xG: 0.12, venue: 0.10, form: 0.08, elo: 0.07, injuries: 0.08,
    xGTrend: 0.05, sos: 0.05, fatigue: 0.06, squad: 0.04, h2h: 0.02, def: 0.02,
    context: 0.04, referee: 0.02,
  };

  const nonOddsSum = 1 - baseWeights.odds; // 0.75
  const w = oddsAvailable
    ? baseWeights
    : {
        odds: 0,
        xG: baseWeights.xG / nonOddsSum,
        venue: baseWeights.venue / nonOddsSum,
        form: baseWeights.form / nonOddsSum,
        elo: baseWeights.elo / nonOddsSum,
        injuries: baseWeights.injuries / nonOddsSum,
        xGTrend: baseWeights.xGTrend / nonOddsSum,
        sos: baseWeights.sos / nonOddsSum,
        fatigue: baseWeights.fatigue / nonOddsSum,
        squad: baseWeights.squad / nonOddsSum,
        h2h: baseWeights.h2h / nonOddsSum,
        def: baseWeights.def / nonOddsSum,
        context: baseWeights.context / nonOddsSum,
        referee: baseWeights.referee / nonOddsSum,
      };

  const homeTotal =
    homeOddsScore * w.odds +
    homeXGScore * w.xG +
    homeVenueScore * w.venue +
    homeFormScore * w.form +
    homeEloScore * w.elo +
    homeInjScore * w.injuries +
    homeXGTrendScore * w.xGTrend +
    homeSOSScore * w.sos +
    homeFatigueScore * w.fatigue +
    homeSquadScore * w.squad +
    homeH2HScore * w.h2h +
    homeDefScore * w.def +
    homeContextScore * w.context +
    homeRefScore * w.referee;

  const awayTotal =
    awayOddsScore * w.odds +
    awayXGScore * w.xG +
    awayVenueScore * w.venue +
    awayFormScore * w.form +
    awayEloScore * w.elo +
    awayInjScore * w.injuries +
    awayXGTrendScore * w.xGTrend +
    awaySOSScore * w.sos +
    awayFatigueScore * w.fatigue +
    awaySquadScore * w.squad +
    awayH2HScore * w.h2h +
    awayDefScore * w.def +
    awayContextScore * w.context +
    awayRefScore * w.referee;

  const diff = homeTotal - awayTotal;

  // Draw probability: Gaussian centered on diff=0
  // Peak 0.38 gives max draw ~0.356 without odds (after 80/20 prior), above 1/3 threshold.
  // Steepness -10 narrows the bell so draw drops fast when teams are unequal.
  let drawScore = Math.max(0.05, 0.38 * Math.exp(-10 * diff * diff));

  // Blend with bookmaker draw probability: 40% model / 60% market (market estimates draws better)
  if (odds) {
    const drawProb = oddsToProb(odds.draw);
    const totalProb = oddsToProb(odds.homeWin) + drawProb + oddsToProb(odds.awayWin);
    const drawImplied = drawProb / totalProb;
    drawScore = drawScore * 0.4 + drawImplied * 0.6;
  } else {
    // Bayesian prior: blend model estimate with league base draw rate (~26% in top leagues)
    // 80/20 blend keeps max draw at ~0.34 (above 1/3 threshold) while stabilizing extremes
    drawScore = drawScore * 0.8 + 0.26 * 0.2;
  }

  // Context-driven draw adjustments
  if (matchContext) {
    const { homeStakes, awayStakes, isDerby } = matchContext;
    if (homeStakes === "relegation" && awayStakes === "relegation") {
      drawScore += 0.05;
    } else if (homeStakes === "title" && awayStakes === "title") {
      drawScore += 0.02;
    }
    if (isDerby) {
      drawScore += 0.03;
    }
  }

  // Strict referee micro-boost for draw
  if (referee && referee.matchesOfficiated >= 3) {
    const severityScore = Math.min(1, (safeNum(referee.avgYellowsPerMatch, 3.5) - 2) / 4);
    if (severityScore > 0.6) {
      drawScore += 0.01;
    }
  }

  // Remaining probability split using tanh — balanced slope + spread for accuracy/draw tradeoff
  const remaining = 1 - drawScore;
  const favorBias = Math.tanh(diff * 3.4);
  let homeScore = remaining * (0.5 + favorBias * 0.44);
  let awayScore = remaining * (0.5 - favorBias * 0.44);

  // Safety clamp (tighter when odds are absent — less reliable model)
  const maxClamp = oddsAvailable ? 0.85 : 0.80;
  homeScore = Math.max(0.03, Math.min(maxClamp, homeScore));
  awayScore = Math.max(0.03, Math.min(maxClamp, awayScore));
  drawScore = Math.max(0.05, Math.min(0.55, drawScore));

  // Renormalize
  const sum = homeScore + drawScore + awayScore;
  homeScore /= sum;
  drawScore /= sum;
  awayScore /= sum;

  // Final NaN safety net — if anything slipped through, return neutral prediction
  if (Number.isNaN(homeScore) || Number.isNaN(drawScore) || Number.isNaN(awayScore)) {
    console.error("[prediction-engine] NaN detected — returning neutral prediction");
    return { homeScore: 40, drawScore: 25, awayScore: 35, factors };
  }

  // Largest remainder method — guarantees sum = 100
  const rawH = homeScore * 100;
  const rawD = drawScore * 100;
  const rawA = awayScore * 100;
  let rH = Math.floor(rawH);
  let rD = Math.floor(rawD);
  let rA = Math.floor(rawA);
  let deficit = 100 - (rH + rD + rA);
  const remainders: { key: string; rem: number }[] = [
    { key: "h", rem: rawH - rH },
    { key: "d", rem: rawD - rD },
    { key: "a", rem: rawA - rA },
  ];
  remainders.sort((a, b) => b.rem - a.rem);
  for (const r of remainders) {
    if (deficit <= 0) break;
    if (r.key === "h") rH++;
    else if (r.key === "d") rD++;
    else rA++;
    deficit--;
  }

  return {
    homeScore: rH,
    drawScore: rD,
    awayScore: rA,
    factors,
  };
}
