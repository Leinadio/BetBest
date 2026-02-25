import Anthropic from "@anthropic-ai/sdk";
import { HeadToHeadRecord, Injury, MatchContext, MatchOdds, NewsArticle, PlayerForm, Prediction, PredictionAnalysis, RefereeProfile, ScheduleFatigue, Standing, StatsScore, StrengthOfSchedule, TacticalProfile, Team, TeamElo, TeamPlayerAnalysis, TeamXG } from "./types";

const anthropic = new Anthropic();

interface AnalyzeParams {
  homeTeam: Team;
  awayTeam: Team;
  homeStanding: Standing;
  awayStanding: Standing;
  statsScore: StatsScore;
  leagueCode: string;
  homeInjuries?: Injury[];
  awayInjuries?: Injury[];
  homePlayerAnalysis?: TeamPlayerAnalysis;
  awayPlayerAnalysis?: TeamPlayerAnalysis;
  homePlayerForm?: PlayerForm[];
  awayPlayerForm?: PlayerForm[];
  homeNews?: NewsArticle[];
  awayNews?: NewsArticle[];
  homeTactics?: TacticalProfile | null;
  awayTactics?: TacticalProfile | null;
  headToHead?: HeadToHeadRecord;
  referee?: RefereeProfile | null;
  odds?: MatchOdds | null;
  fatigue?: ScheduleFatigue | null;
  matchContext?: MatchContext | null;
  homeXG?: TeamXG | null;
  awayXG?: TeamXG | null;
  homeElo?: TeamElo | null;
  awayElo?: TeamElo | null;
  homeSOS?: StrengthOfSchedule | null;
  awaySOS?: StrengthOfSchedule | null;
}

export async function analyzePrediction({
  homeTeam,
  awayTeam,
  homeStanding,
  awayStanding,
  statsScore,
  leagueCode,
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
}: AnalyzeParams): Promise<Prediction> {
  const formatInjuries = (injuries: Injury[] | undefined): string => {
    if (!injuries || injuries.length === 0) return "Aucune absence signalée";

    const isSuspension = (reason: string | undefined | null) => {
      const lower = (reason ?? "").toLowerCase();
      return (
        lower.includes("suspend") ||
        lower.includes("red card") ||
        lower.includes("yellow card") ||
        lower.includes("carton") ||
        lower.includes("expuls")
      );
    };

    const injured = injuries.filter((i) => !isSuspension(i.reason));
    const suspended = injuries.filter((i) => isSuspension(i.reason));

    const formatEntry = (i: Injury) => {
      const status = i.type || "Missing Fixture";
      const statusLabel =
        status === "Missing Fixture" ? "absent" :
        status === "Doubtful" ? "incertain" :
        status === "Questionable" ? "douteux" : status;
      return `- ${i.player} (${i.reason ?? "non précisé"}) [${statusLabel}]`;
    };

    const lines: string[] = [];
    if (injured.length > 0) {
      lines.push(`Blessés (${injured.length}) :`);
      lines.push(...injured.map(formatEntry));
    }
    if (suspended.length > 0) {
      lines.push(`Suspendus (${suspended.length}) :`);
      lines.push(...suspended.map(formatEntry));
    }
    return lines.join("\n");
  };

  const formatPlayerAnalysis = (
    teamName: string,
    analysis: TeamPlayerAnalysis | undefined
  ): string => {
    if (!analysis || analysis.keyPlayers.length === 0)
      return `${teamName} : Aucun joueur clé identifié dans les classements de la ligue`;

    const players = analysis.keyPlayers
      .map((p) => {
        const roleLabel =
          p.role === "both" ? "buteur+passeur" : p.role === "scorer" ? "buteur" : "passeur";
        return `- ${p.name} (${roleLabel}) : ${p.goals} buts, ${p.assists} passes, ${p.appearances} matchs`;
      })
      .join("\n");

    const absences =
      analysis.criticalAbsences.length > 0
        ? "\n  ABSENCES CRITIQUES :\n" +
          analysis.criticalAbsences
            .map(
              (a) =>
                `  ⚠ ${a.player.name} (${a.injury.reason}) - impact ${a.impact === "high" ? "FORT" : "MOYEN"}`
            )
            .join("\n")
        : "";

    return `${teamName} (score effectif: ${Math.round(analysis.squadQualityScore * 100)}%) :\n${players}${absences}`;
  };

  const formatRecentForm = (teamName: string, forms: PlayerForm[] | undefined): string => {
    if (!forms || forms.length === 0)
      return `${teamName} : Données indisponibles`;
    const total = forms[0].totalRecentMatches;
    const lines = forms.slice(0, 8).map((p) => {
      const parts: string[] = [];
      if (p.recentGoals > 0) parts.push(`${p.recentGoals} but${p.recentGoals > 1 ? "s" : ""}`);
      if (p.recentAssists > 0) parts.push(`${p.recentAssists} passe${p.recentAssists > 1 ? "s" : ""}`);
      return `- ${p.name} : ${parts.join(", ")} (actif ${p.matchesWithContribution}/${total} matchs)`;
    });
    return `${teamName} (${total} derniers matchs) :\n${lines.join("\n")}`;
  };

  const formatNews = (teamName: string, articles: NewsArticle[] | undefined): string => {
    if (!articles || articles.length === 0) return `${teamName} : Aucune actualité récente`;
    const lines = articles.map((a) => {
      const date = new Date(a.pubDate);
      const daysAgo = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const relative = daysAgo === 0 ? "aujourd'hui" : daysAgo === 1 ? "hier" : `il y a ${daysAgo} jours`;
      const src = a.source ? ` (${a.source}, ${relative})` : ` (${relative})`;
      return `- "${a.title}"${src}`;
    });
    return `${teamName} :\n${lines.join("\n")}`;
  };

  const formatTactics = (teamName: string, tactics: TacticalProfile | null | undefined): string => {
    if (!tactics) return `${teamName} : Données tactiques indisponibles`;

    const formations = tactics.formationUsage
      .slice(0, 3)
      .map((f) => `${f.formation}: ${f.played} matchs`)
      .join(", ");

    const periods = Object.entries(tactics.goalsForByPeriod)
      .map(([p, v]) => `${p}: ${v ?? 0}`)
      .join(", ");

    const periodsAgainst = Object.entries(tactics.goalsAgainstByPeriod)
      .map(([p, v]) => `${p}: ${v ?? 0}`)
      .join(", ");

    return `${teamName} :
- Formation préférée : ${tactics.preferredFormation} (${formations})
- Bilan domicile : ${tactics.homeRecord.wins}V ${tactics.homeRecord.draws}N ${tactics.homeRecord.losses}D (${tactics.homeRecord.played} matchs)
- Bilan extérieur : ${tactics.awayRecord.wins}V ${tactics.awayRecord.draws}N ${tactics.awayRecord.losses}D (${tactics.awayRecord.played} matchs)
- Moyenne buts marqués : ${tactics.goalsForAvg.home} (dom) / ${tactics.goalsForAvg.away} (ext) / ${tactics.goalsForAvg.total} (total)
- Moyenne buts encaissés : ${tactics.goalsAgainstAvg.home} (dom) / ${tactics.goalsAgainstAvg.away} (ext) / ${tactics.goalsAgainstAvg.total} (total)
- Buts marqués par période : ${periods}
- Buts encaissés par période : ${periodsAgainst}
- Clean sheets : ${tactics.cleanSheets.total} (${tactics.cleanSheets.home} dom, ${tactics.cleanSheets.away} ext)
- Matchs sans marquer : ${tactics.failedToScore.total} (${tactics.failedToScore.home} dom, ${tactics.failedToScore.away} ext)
- Meilleure série : ${tactics.biggestStreak.wins}V, ${tactics.biggestStreak.draws}N, ${tactics.biggestStreak.losses}D
- Penalties : ${tactics.penaltyRecord.scored} marqués, ${tactics.penaltyRecord.missed} ratés`;
  };

  const formatHeadToHead = (h2h: HeadToHeadRecord | undefined): string => {
    if (!h2h || h2h.matches.length === 0) return "Aucune confrontation directe cette saison";
    const lines = h2h.matches.map((m) => {
      const date = new Date(m.date).toLocaleDateString("fr-FR");
      return `- ${m.homeTeam} ${m.homeGoals}-${m.awayGoals} ${m.awayTeam} (${date})`;
    });
    return `${lines.join("\n")}\nBilan : ${h2h.team1Wins}V ${h2h.draws}N ${h2h.team2Wins}D`;
  };

  const formatReferee = (ref: RefereeProfile | null | undefined): string => {
    if (!ref) return "Arbitre : Données indisponibles";
    return `Arbitre : ${ref.name}
- Matchs arbitrés cette saison : ${ref.matchesOfficiated}
- Moyenne cartons jaunes/match : ${ref.avgYellowsPerMatch}
- Moyenne cartons rouges/match : ${ref.avgRedsPerMatch}
- Penalties sifflés : ${ref.penaltiesAwarded}`;
  };

  const formatOdds = (o: MatchOdds | null | undefined): string => {
    if (!o) return "Cotes : Données indisponibles";
    return `Cotes (${o.bookmaker}) : Domicile ${o.homeWin} | Nul ${o.draw} | Extérieur ${o.awayWin}`;
  };

  const formatFatigue = (f: ScheduleFatigue | null | undefined): string => {
    if (!f) return "Fatigue calendrier : Données indisponibles";
    const fmt = (label: string, t: typeof f.home) => {
      const parts: string[] = [];
      if (t.daysSinceLastMatch !== null) parts.push(`dernier match il y a ${t.daysSinceLastMatch}j`);
      if (t.daysUntilNextMatch !== null) parts.push(`prochain match dans ${t.daysUntilNextMatch}j`);
      parts.push(`${t.matchesLast30Days} matchs sur 30 jours`);
      return `${label} : ${parts.join(", ")}`;
    };
    return `${fmt(homeTeam.name, f.home)}\n${fmt(awayTeam.name, f.away)}`;
  };

  const stakesLabel: Record<string, string> = {
    title: "Course au titre",
    europe: "Course européenne",
    midtable: "Mi-tableau",
    relegation: "Lutte pour le maintien",
  };

  const formatMatchContext = (ctx: MatchContext | null | undefined): string => {
    if (!ctx) return "Contexte du match : Données indisponibles";
    const lines: string[] = [];
    lines.push(`${homeTeam.name} : ${stakesLabel[ctx.homeStakes] ?? ctx.homeStakes}`);
    lines.push(`${awayTeam.name} : ${stakesLabel[ctx.awayStakes] ?? ctx.awayStakes}`);
    if (ctx.isDerby) lines.push("Ce match est un DERBY (rivalité historique)");
    return lines.join("\n");
  };

  const systemPrompt = `Tu es un analyste football expert. Ta méthode est rigoureuse et reproductible : tu ne devines pas, tu déduis à partir des données. Si les données sont insuffisantes pour trancher, tu le dis et ta confiance reste basse (50-60). Tu réponds toujours en français.`;

  const prompt = `Match : ${homeTeam.name} (domicile) vs ${awayTeam.name} (extérieur)
Compétition : ${leagueCode}

══════════════════════════════════
DONNÉES DISPONIBLES
══════════════════════════════════

[RATINGS ELO (ClubElo.com)]
${homeTeam.name} : ${homeElo ? Math.round(homeElo.elo) : "N/A"}
${awayTeam.name} : ${awayElo ? Math.round(awayElo.elo) : "N/A"}
${homeElo && awayElo ? `Écart : ${Math.round(homeElo.elo - awayElo.elo)} points ELO (${Math.abs(Math.round(homeElo.elo - awayElo.elo)) < 50 ? "très serré" : Math.abs(Math.round(homeElo.elo - awayElo.elo)) < 100 ? "avantage modéré" : "écart significatif"})` : ""}

[xG — EXPECTED GOALS (Understat)]
${homeXG ? `${homeTeam.name} : ${homeXG.xGPerMatch} xG/match, ${homeXG.xGAPerMatch} xGA/match (${homeXG.matches}m) — diff réel vs xG: ${homeXG.xGDiff > 0 ? "+" : ""}${homeXG.xGDiff} (${homeXG.xGDiff > 2 ? "très malchanceux" : homeXG.xGDiff > 0 ? "sous-performe" : homeXG.xGDiff < -2 ? "très chanceux" : "sur-performe"})` : `${homeTeam.name} : Données xG indisponibles`}
${awayXG ? `${awayTeam.name} : ${awayXG.xGPerMatch} xG/match, ${awayXG.xGAPerMatch} xGA/match (${awayXG.matches}m) — diff réel vs xG: ${awayXG.xGDiff > 0 ? "+" : ""}${awayXG.xGDiff} (${awayXG.xGDiff > 2 ? "très malchanceux" : awayXG.xGDiff > 0 ? "sous-performe" : awayXG.xGDiff < -2 ? "très chanceux" : "sur-performe"})` : `${awayTeam.name} : Données xG indisponibles`}

[xG — MOMENTUM (5 derniers matchs)]
${homeXG?.recentXGPerMatch != null ? `${homeTeam.name} : ${homeXG.recentXGPerMatch} xG/m, ${homeXG.recentXGAPerMatch} xGA/m (récent) vs ${homeXG.xGPerMatch} xG/m, ${homeXG.xGAPerMatch} xGA/m (saison) — tendance: ${homeXG.xGTrend != null ? (homeXG.xGTrend > 0.05 ? `↑ EN PROGRESSION (+${homeXG.xGTrend.toFixed(2)})` : homeXG.xGTrend < -0.05 ? `↓ EN RÉGRESSION (${homeXG.xGTrend.toFixed(2)})` : `→ STABLE (${homeXG.xGTrend.toFixed(2)})`) : "N/A"}` : `${homeTeam.name} : Données momentum indisponibles`}
${awayXG?.recentXGPerMatch != null ? `${awayTeam.name} : ${awayXG.recentXGPerMatch} xG/m, ${awayXG.recentXGAPerMatch} xGA/m (récent) vs ${awayXG.xGPerMatch} xG/m, ${awayXG.xGAPerMatch} xGA/m (saison) — tendance: ${awayXG.xGTrend != null ? (awayXG.xGTrend > 0.05 ? `↑ EN PROGRESSION (+${awayXG.xGTrend.toFixed(2)})` : awayXG.xGTrend < -0.05 ? `↓ EN RÉGRESSION (${awayXG.xGTrend.toFixed(2)})` : `→ STABLE (${awayXG.xGTrend.toFixed(2)})`) : "N/A"}` : `${awayTeam.name} : Données momentum indisponibles`}

[DIFFICULTÉ DU CALENDRIER RÉCENT (SOS)]
${homeSOS ? `${homeTeam.name} : Position moyenne des 5 derniers adversaires: ${homeSOS.recentOpponentsAvgPosition} — PPM moyen adversaires: ${homeSOS.recentOpponentsAvgPPM} — Score SOS: ${homeSOS.sosScore} (${homeSOS.sosScore > 0.6 ? "calendrier difficile" : homeSOS.sosScore < 0.4 ? "calendrier facile" : "calendrier moyen"})` : `${homeTeam.name} : Données SOS indisponibles`}
${awaySOS ? `${awayTeam.name} : Position moyenne des 5 derniers adversaires: ${awaySOS.recentOpponentsAvgPosition} — PPM moyen adversaires: ${awaySOS.recentOpponentsAvgPPM} — Score SOS: ${awaySOS.sosScore} (${awaySOS.sosScore > 0.6 ? "calendrier difficile" : awaySOS.sosScore < 0.4 ? "calendrier facile" : "calendrier moyen"})` : `${awayTeam.name} : Données SOS indisponibles`}

[CLASSEMENT]
${homeTeam.name} : ${homeStanding.position}e — ${homeStanding.points} pts (${homeStanding.playedGames}J) — ${homeStanding.won}V ${homeStanding.draw}N ${homeStanding.lost}D — Buts: ${homeStanding.goalsFor}/${homeStanding.goalsAgainst} (diff: ${homeStanding.goalDifference > 0 ? "+" : ""}${homeStanding.goalDifference}) — Forme: ${homeStanding.form ?? "N/A"}
${awayTeam.name} : ${awayStanding.position}e — ${awayStanding.points} pts (${awayStanding.playedGames}J) — ${awayStanding.won}V ${awayStanding.draw}N ${awayStanding.lost}D — Buts: ${awayStanding.goalsFor}/${awayStanding.goalsAgainst} (diff: ${awayStanding.goalDifference > 0 ? "+" : ""}${awayStanding.goalDifference}) — Forme: ${awayStanding.form ?? "N/A"}

[BLESSURES / SUSPENSIONS]
${homeTeam.name} : ${formatInjuries(homeInjuries)}
${awayTeam.name} : ${formatInjuries(awayInjuries)}

[JOUEURS CLÉS]
${formatPlayerAnalysis(homeTeam.name, homePlayerAnalysis)}
${formatPlayerAnalysis(awayTeam.name, awayPlayerAnalysis)}

[FORME RÉCENTE DES JOUEURS]
${formatRecentForm(homeTeam.name, homePlayerForm)}
${formatRecentForm(awayTeam.name, awayPlayerForm)}

[ACTUALITÉS]
${formatNews(homeTeam.name, homeNews)}
${formatNews(awayTeam.name, awayNews)}

[TACTIQUE]
${formatTactics(homeTeam.name, homeTactics)}
${formatTactics(awayTeam.name, awayTactics)}

[CONFRONTATIONS DIRECTES]
${formatHeadToHead(headToHead)}

[ARBITRE]
${formatReferee(referee)}

[COTES DU MARCHÉ]
${formatOdds(odds)}

[FATIGUE / CALENDRIER]
${formatFatigue(fatigue)}

[ENJEUX]
${formatMatchContext(matchContext)}

[MODÈLE STATISTIQUE — 14 facteurs pondérés]
${statsScore.factors.map((f) => `${f.label} (${Math.round(f.weight * 100)}%) : ${f.homeValue} vs ${f.awayValue}`).join("\n")}
→ Résultat : 1=${statsScore.homeScore}% N=${statsScore.drawScore}% 2=${statsScore.awayScore}%

══════════════════════════════════
MÉTHODE D'ANALYSE (suis ces 5 étapes dans l'ordre)
══════════════════════════════════

ÉTAPE 1 — RAPPORT DE FORCE
En utilisant [CLASSEMENT] + [MODÈLE STATISTIQUE] :
- Qui est objectivement supérieur sur la saison ? (position, points/match, diff. buts)
- L'écart est-il large ou serré ?

ÉTAPE 2 — DYNAMIQUE RÉCENTE
En croisant [CLASSEMENT].forme + [xG MOMENTUM] + [SOS] + [FORME RÉCENTE DES JOUEURS] + [ACTUALITÉS] :
- Les 5 derniers résultats confirment-ils ou contredisent-ils le rapport de force ?
- Le momentum xG confirme-t-il la forme ? (une équipe qui gagne mais dont les xG baissent = régression probable, et inversement)
- Le SOS contextualise-t-il les résultats ? (5V contre des équipes mal classées ≠ 5V contre le top 6)
- Les joueurs clés sont-ils en forme ou en méforme ? (buts/passes récents vs stats saison)
- Y a-t-il des news impactantes (changement coach, tension vestiaire, série historique) ?

ÉTAPE 3 — CONFRONTATION TACTIQUE
En croisant [TACTIQUE] des deux équipes + [CONFRONTATIONS DIRECTES] :
- Comment la formation et le style de A interagissent-ils avec ceux de B ?
  (ex: 4-3-3 offensif vs 5-3-2 compact, équipe qui marque en fin de match vs équipe qui encaisse tôt)
- Les bilans dom/ext respectifs créent-ils un avantage ? (ex: fort à domicile vs faible à l'extérieur)
- Les confrontations directes révèlent-elles une domination ou des matchs serrés ?

ÉTAPE 4 — FACTEURS CONTEXTUELS
En croisant ENSEMBLE [BLESSURES] × [JOUEURS CLÉS] × [FATIGUE] × [ENJEUX] × [ARBITRE] :
- Quels facteurs CONVERGENT (pointent vers le même résultat) ?
  (ex: équipe A reposée + joueurs clés dispo + course au titre = forte motivation et moyens)
- Quels facteurs DIVERGENT (se contredisent) ?
  (ex: équipe B en forme mais fatiguée et sans son buteur principal)
- Un joueur clé absent change-t-il fondamentalement le rapport de force ?

ÉTAPE 5 — VERDICT FINAL
- Synthèse : sur la base des 4 étapes, quel résultat est le plus probable ?
- Compare ton verdict aux cotes du marché. Si tu diverges significativement, explique quelles données justifient cet écart.
- Ta confiance doit refléter la solidité des convergences : beaucoup de convergences = confiance haute (72-88), beaucoup de divergences = confiance basse (50-65). En football, une confiance >85 est exceptionnelle (réservée aux déséquilibres extrêmes).

══════════════════════════════════
FORMAT DE RÉPONSE
══════════════════════════════════

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans backticks) :
{
  "outcome": "1" ou "N" ou "2",
  "confidence": nombre entre 50 et 88,
  "analysis": {
    "powerBalance": "1-2 phrases sur le rapport de force brut",
    "momentum": "1-2 phrases sur la dynamique récente (forme + joueurs + news)",
    "tacticalEdge": "1-2 phrases sur la confrontation tactique (styles + bilans dom/ext + H2H)",
    "contextualFactors": "2-3 phrases : liste les convergences et divergences des facteurs contextuels (absences, fatigue, enjeux, arbitre)",
    "verdict": "2-3 phrases : synthèse finale avec résultat choisi, justification principale, et positionnement par rapport aux cotes"
  }
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  interface AnalysisResponse {
    outcome: "1" | "N" | "2";
    confidence: number;
    analysis: PredictionAnalysis;
  }

  let parsed: AnalysisResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: use stats-based prediction
    const maxScore = Math.max(statsScore.homeScore, statsScore.drawScore, statsScore.awayScore);
    let outcome: "1" | "N" | "2" = "1";
    if (maxScore === statsScore.drawScore) outcome = "N";
    else if (maxScore === statsScore.awayScore) outcome = "2";

    parsed = {
      outcome,
      confidence: Math.min(maxScore, 85),
      analysis: {
        powerBalance: "Analyse basée sur les statistiques disponibles.",
        momentum: "",
        tacticalEdge: "",
        contextualFactors: "",
        verdict: "Prédiction basée sur le modèle statistique.",
      },
    };
  }

  const a = parsed.analysis;
  const reasoning = [a.powerBalance, a.momentum, a.tacticalEdge, a.contextualFactors, a.verdict]
    .filter(Boolean)
    .join(" ");

  const defaultPlayerAnalysis = { keyPlayers: [], criticalAbsences: [], squadQualityScore: 0.5 };

  return {
    outcome: parsed.outcome,
    confidence: Math.max(50, Math.min(88, parsed.confidence)),
    reasoning,
    analysis: parsed.analysis,
    statsScore,
    homeTeam,
    awayTeam,
    league: leagueCode,
    injuries: {
      home: homeInjuries ?? [],
      away: awayInjuries ?? [],
    },
    playerAnalysis: {
      home: homePlayerAnalysis ?? defaultPlayerAnalysis,
      away: awayPlayerAnalysis ?? defaultPlayerAnalysis,
    },
    news: {
      home: homeNews ?? [],
      away: awayNews ?? [],
    },
    tactics: {
      home: homeTactics ?? null,
      away: awayTactics ?? null,
    },
    headToHead,
    referee: referee ?? undefined,
    odds: odds ?? undefined,
    fatigue: fatigue ?? undefined,
    matchContext: matchContext ?? undefined,
    xG: { home: homeXG ?? null, away: awayXG ?? null },
    elo: { home: homeElo ?? null, away: awayElo ?? null },
  };
}
