"use client";

import { useState } from "react";
import { GoalsByPeriod, HeadToHeadRecord, MatchContext, MatchOdds, NewsArticle, Prediction, RefereeProfile, ScheduleFatigue, TacticalProfile, TeamElo, TeamPlayerAnalysis, TeamXG } from "@/lib/types";
import Image from "next/image";

interface AnalysisBreakdownProps {
  prediction: Prediction;
}

function SectionUnavailable({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/20 px-4 py-3 text-[11px] text-zinc-500 italic">
      {label} &mdash; données indisponibles
    </div>
  );
}

function ProbabilityBar({
  homeScore,
  drawScore,
  awayScore,
  homeTla,
  awayTla,
  outcome,
}: {
  homeScore: number;
  drawScore: number;
  awayScore: number;
  homeTla: string;
  awayTla: string;
  outcome: "1" | "N" | "2";
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${
              outcome === "1" ? "text-green-400" : "text-zinc-400"
            }`}
          >
            {homeScore}%
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
            1 &middot; {homeTla}
          </div>
        </div>
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${
              outcome === "N" ? "text-zinc-200" : "text-zinc-500"
            }`}
          >
            {drawScore}%
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
            N &middot; Nul
          </div>
        </div>
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${
              outcome === "2" ? "text-blue-400" : "text-zinc-400"
            }`}
          >
            {awayScore}%
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
            2 &middot; {awayTla}
          </div>
        </div>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        <div
          className="bg-green-500 transition-all duration-700"
          style={{ width: `${homeScore}%` }}
        />
        <div
          className="bg-zinc-500 transition-all duration-700"
          style={{ width: `${drawScore}%` }}
        />
        <div
          className="bg-blue-500 transition-all duration-700"
          style={{ width: `${awayScore}%` }}
        />
      </div>
    </div>
  );
}

function FactorRow({
  label,
  homeValue,
  awayValue,
  weight,
}: {
  label: string;
  homeValue: string;
  awayValue: string;
  weight: number;
}) {
  const pct = Math.round(weight * 100);

  return (
    <div className="flex items-center gap-3 py-2 border-b border-zinc-800 last:border-0">
      <div className="w-[140px] shrink-0">
        <div className="text-xs text-zinc-300">{label}</div>
        <div className="mt-0.5 h-1 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-orange-500/60"
            style={{ width: `${pct * 5}%` }}
          />
        </div>
        <div className="text-[10px] text-zinc-600 mt-0.5">Poids {pct}%</div>
      </div>
      <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-medium text-green-400 text-right w-[90px] truncate">
          {homeValue}
        </span>
        <span className="text-zinc-700 text-[10px]">vs</span>
        <span className="text-xs font-medium text-blue-400 text-left w-[90px] truncate">
          {awayValue}
        </span>
      </div>
    </div>
  );
}

function SquadQualityComparison({
  homeAnalysis,
  awayAnalysis,
  homeTeamName,
  awayTeamName,
}: {
  homeAnalysis: TeamPlayerAnalysis;
  awayAnalysis: TeamPlayerAnalysis;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const homeAbsences = homeAnalysis.criticalAbsences;
  const awayAbsences = awayAnalysis.criticalAbsences;

  return (
    <div className="space-y-3">
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
        Qualité des effectifs
      </h5>
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            name: homeTeamName,
            analysis: homeAnalysis,
            color: "green" as const,
          },
          {
            name: awayTeamName,
            analysis: awayAnalysis,
            color: "blue" as const,
          },
        ].map(({ name, analysis, color }) => {
          const pct = Math.round(analysis.squadQualityScore * 100);
          const barColor =
            color === "green" ? "bg-green-500" : "bg-blue-500";
          const textColor =
            color === "green" ? "text-green-400" : "text-blue-400";
          return (
            <div key={name} className="rounded-lg bg-zinc-800/50 p-3">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs font-medium text-zinc-300">
                  {name}
                </span>
                <span className={`text-lg font-bold ${textColor}`}>
                  {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                <span>{analysis.keyPlayers.length} joueur(s) clé(s)</span>
                <span>
                  {analysis.keyPlayers.reduce(
                    (s, p) => s + p.goals + p.assists,
                    0
                  )}{" "}
                  contributions
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {(homeAbsences.length > 0 || awayAbsences.length > 0) && (
        <div className="space-y-1.5">
          {[
            ...homeAbsences.map((a) => ({ ...a, team: homeTeamName })),
            ...awayAbsences.map((a) => ({ ...a, team: awayTeamName })),
          ].map((a) => (
            <div
              key={a.player.playerId}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                a.impact === "high"
                  ? "bg-red-950/50 border border-red-900/50"
                  : "bg-orange-950/40 border border-orange-900/40"
              }`}
            >
              <Image
                src={a.player.photo}
                alt={a.player.name}
                width={20}
                height={20}
                className="rounded-full opacity-50 grayscale"
              />
              <span className="text-red-300 line-through">{a.player.name}</span>
              <span className="text-zinc-500">({a.team})</span>
              <span className="ml-auto text-zinc-500">
                {a.player.goals}B {a.player.assists}P
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  a.impact === "high"
                    ? "bg-red-900 text-red-300"
                    : "bg-orange-900 text-orange-300"
                }`}
              >
                {a.impact === "high" ? "Fort" : "Moyen"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyPlayersCompact({
  homeAnalysis,
  awayAnalysis,
  homeTeamName,
  awayTeamName,
}: {
  homeAnalysis: TeamPlayerAnalysis;
  awayAnalysis: TeamPlayerAnalysis;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const roleBadge = {
    scorer: { label: "B", color: "bg-green-800 text-green-200" },
    assister: { label: "P", color: "bg-blue-800 text-blue-200" },
    both: { label: "B+P", color: "bg-purple-800 text-purple-200" },
  };

  const renderTeam = (
    name: string,
    analysis: TeamPlayerAnalysis,
    align: "left" | "right"
  ) => {
    if (analysis.keyPlayers.length === 0) {
      return (
        <div>
          <div
            className={`text-xs font-medium text-zinc-400 mb-2 ${
              align === "right" ? "text-right" : ""
            }`}
          >
            {name}
          </div>
          <p className="text-[11px] text-zinc-600">Aucun dans le top ligue</p>
        </div>
      );
    }

    const absentIds = new Set(
      analysis.criticalAbsences.map((a) => a.player.playerId)
    );

    return (
      <div>
        <div
          className={`text-xs font-medium text-zinc-400 mb-2 ${
            align === "right" ? "text-right" : ""
          }`}
        >
          {name}
        </div>
        <div className="space-y-1">
          {analysis.keyPlayers.map((p) => {
            const isAbsent = absentIds.has(p.playerId);
            const badge = roleBadge[p.role];
            return (
              <div
                key={p.playerId}
                className={`flex items-center gap-2 ${
                  align === "right" ? "flex-row-reverse" : ""
                }`}
              >
                <Image
                  src={p.photo}
                  alt={p.name}
                  width={24}
                  height={24}
                  className={`rounded-full shrink-0 ${
                    isAbsent ? "opacity-40 grayscale" : ""
                  }`}
                />
                <span
                  className={`text-[11px] truncate ${
                    isAbsent
                      ? "text-red-400/70 line-through"
                      : "text-zinc-200"
                  }`}
                >
                  {p.name}
                </span>
                <span
                  className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${badge.color}`}
                >
                  {badge.label}
                </span>
                <span className="shrink-0 text-[10px] text-zinc-500">
                  {p.goals}b {p.assists}p
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Top buteurs / passeurs de la ligue
      </h5>
      <div className="grid grid-cols-2 gap-4">
        {renderTeam(homeTeamName, homeAnalysis, "left")}
        {renderTeam(awayTeamName, awayAnalysis, "right")}
      </div>
    </div>
  );
}

function formatRelativeDate(pubDate: string): string {
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return "";
  const daysAgo = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (daysAgo === 0) return "Aujourd'hui";
  if (daysAgo === 1) return "Hier";
  return `Il y a ${daysAgo}j`;
}

function NewsCompact({
  homeNews,
  awayNews,
  homeTeamName,
  awayTeamName,
}: {
  homeNews: NewsArticle[];
  awayNews: NewsArticle[];
  homeTeamName: string;
  awayTeamName: string;
}) {
  const renderList = (name: string, articles: NewsArticle[]) => (
    <div>
      <div className="text-xs font-medium text-zinc-400 mb-1.5">{name}</div>
      {articles.length === 0 ? (
        <p className="text-[11px] text-zinc-600">Aucune actualité récente</p>
      ) : (
        <div className="space-y-1.5">
          {articles.map((article, i) => (
            <a
              key={i}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <div className="text-[11px] text-zinc-300 group-hover:text-zinc-100 transition-colors line-clamp-2 leading-tight">
                {article.title}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {article.source && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
                    {article.source}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600">
                  {formatRelativeDate(article.pubDate)}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Actualités récentes
      </h5>
      <div className="grid grid-cols-2 gap-4">
        {renderList(homeTeamName, homeNews)}
        {renderList(awayTeamName, awayNews)}
      </div>
    </div>
  );
}

const PERIOD_LABELS = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90"] as const;

function GoalsPeriodHeatmap({
  goals,
  label,
  color,
}: {
  goals: GoalsByPeriod;
  label: string;
  color: "green" | "blue" | "red";
}) {
  const values = PERIOD_LABELS.map((p) => goals[p] ?? 0);
  const max = Math.max(...values, 1);
  const bgMap = { green: "bg-green-500", blue: "bg-blue-500", red: "bg-red-500" };
  const bg = bgMap[color];

  return (
    <div>
      <div className="text-[10px] text-zinc-500 mb-1">{label}</div>
      <div className="flex gap-0.5">
        {PERIOD_LABELS.map((period, i) => {
          const opacity = values[i] > 0 ? 0.2 + (values[i] / max) * 0.8 : 0.05;
          return (
            <div key={period} className="flex-1 group relative">
              <div
                className={`h-5 rounded-sm ${bg}`}
                style={{ opacity }}
              />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[9px] text-zinc-300 whitespace-nowrap z-10">
                {period}: {values[i]}
              </div>
              <div className="text-[8px] text-zinc-600 text-center mt-0.5">{period.split("-")[0]}&apos;</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TacticsCompact({
  homeTactics,
  awayTactics,
  homeTeamName,
  awayTeamName,
}: {
  homeTactics: TacticalProfile | null;
  awayTactics: TacticalProfile | null;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const renderTeam = (
    name: string,
    tactics: TacticalProfile | null,
    color: "green" | "blue"
  ) => {
    if (!tactics) {
      return (
        <div>
          <div className="text-xs font-medium text-zinc-400 mb-1.5">{name}</div>
          <p className="text-[11px] text-zinc-600">Données indisponibles</p>
        </div>
      );
    }

    const avgFor = parseFloat(tactics.goalsForAvg.total) || 0;
    const avgAgainst = parseFloat(tactics.goalsAgainstAvg.total) || 0;

    const styleBadges: { label: string; color: string }[] = [];
    if (avgFor >= 2.0) styleBadges.push({ label: "Offensif", color: "bg-green-900 text-green-300" });
    if (avgAgainst <= 1.0) styleBadges.push({ label: "Solide", color: "bg-blue-900 text-blue-300" });
    if (avgFor < 1.0) styleBadges.push({ label: "Peu prolifique", color: "bg-orange-900 text-orange-300" });
    if (avgAgainst >= 2.0) styleBadges.push({ label: "Perméable", color: "bg-red-900 text-red-300" });

    const formationColor = color === "green" ? "bg-green-800 text-green-200" : "bg-blue-800 text-blue-200";

    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-zinc-400 mb-1.5">{name}</div>

        {/* Formation */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${formationColor}`}>
            {tactics.preferredFormation}
          </span>
          {tactics.formationUsage.slice(1, 3).map((f) => (
            <span key={f.formation} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500">
              {f.formation} ({f.played})
            </span>
          ))}
        </div>

        {/* Bilan dom/ext */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded bg-zinc-800/60 px-2 py-1">
            <div className="text-[9px] text-zinc-500 uppercase">Dom</div>
            <div className="text-[11px] text-zinc-300">
              {tactics.homeRecord.wins}V {tactics.homeRecord.draws}N {tactics.homeRecord.losses}D
            </div>
          </div>
          <div className="rounded bg-zinc-800/60 px-2 py-1">
            <div className="text-[9px] text-zinc-500 uppercase">Ext</div>
            <div className="text-[11px] text-zinc-300">
              {tactics.awayRecord.wins}V {tactics.awayRecord.draws}N {tactics.awayRecord.losses}D
            </div>
          </div>
        </div>

        {/* Moyennes buts */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-zinc-500">Moy. buts :</span>
          <span className="text-green-400">{tactics.goalsForAvg.total} M</span>
          <span className="text-zinc-600">/</span>
          <span className="text-red-400">{tactics.goalsAgainstAvg.total} E</span>
        </div>

        {/* Heatmap buts par période */}
        <GoalsPeriodHeatmap goals={tactics.goalsForByPeriod} label="Buts marqués par période" color={color} />
        <GoalsPeriodHeatmap goals={tactics.goalsAgainstByPeriod} label="Buts encaissés par période" color="red" />

        {/* Stats badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">
            CS: {tactics.cleanSheets.total}
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">
            0 but: {tactics.failedToScore.total}
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">
            Série: {tactics.biggestStreak.wins}V
          </span>
        </div>

        {/* Style badges */}
        {styleBadges.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {styleBadges.map((b) => (
              <span key={b.label} className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${b.color}`}>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Profil tactique
      </h5>
      <div className="grid grid-cols-2 gap-4">
        {renderTeam(homeTeamName, homeTactics, "green")}
        {renderTeam(awayTeamName, awayTactics, "blue")}
      </div>
    </div>
  );
}

function HeadToHeadCompact({
  h2h,
  homeTeamName,
  awayTeamName,
}: {
  h2h: HeadToHeadRecord;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const total = h2h.team1Wins + h2h.draws + h2h.team2Wins;

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Confrontations directes
      </h5>

      {/* Bilan résumé */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-center">
          <div className="text-lg font-bold text-green-400">{h2h.team1Wins}</div>
          <div className="text-[10px] text-zinc-500">{homeTeamName}</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-zinc-400">{h2h.draws}</div>
          <div className="text-[10px] text-zinc-500">Nuls</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-blue-400">{h2h.team2Wins}</div>
          <div className="text-[10px] text-zinc-500">{awayTeamName}</div>
        </div>
      </div>

      {/* Barre visuelle */}
      {total > 0 && (
        <div className="flex h-2 w-full overflow-hidden rounded-full mb-3">
          <div
            className="bg-green-500 transition-all duration-700"
            style={{ width: `${(h2h.team1Wins / total) * 100}%` }}
          />
          <div
            className="bg-zinc-500 transition-all duration-700"
            style={{ width: `${(h2h.draws / total) * 100}%` }}
          />
          <div
            className="bg-blue-500 transition-all duration-700"
            style={{ width: `${(h2h.team2Wins / total) * 100}%` }}
          />
        </div>
      )}

      {/* Liste des matchs */}
      <div className="space-y-1">
        {h2h.matches.map((m, i) => {
          const date = new Date(m.date).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          const homeWin = m.homeGoals > m.awayGoals;
          const awayWin = m.awayGoals > m.homeGoals;

          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md bg-zinc-800/40 px-3 py-1.5 text-[11px]"
            >
              <span className="text-zinc-600 w-[70px] shrink-0">{date}</span>
              <span className={`text-right flex-1 truncate ${homeWin ? "text-green-400 font-medium" : "text-zinc-400"}`}>
                {m.homeTeam}
              </span>
              <span className="font-bold text-zinc-200 shrink-0">
                {m.homeGoals} - {m.awayGoals}
              </span>
              <span className={`flex-1 truncate ${awayWin ? "text-blue-400 font-medium" : "text-zinc-400"}`}>
                {m.awayTeam}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchContextCompact({
  context,
  homeTeamName,
  awayTeamName,
}: {
  context: MatchContext;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const stakesConfig: Record<string, { label: string; color: string }> = {
    title: { label: "Course au titre", color: "bg-yellow-900 text-yellow-300" },
    europe: { label: "Course européenne", color: "bg-blue-900 text-blue-300" },
    midtable: { label: "Mi-tableau", color: "bg-zinc-700 text-zinc-300" },
    relegation: { label: "Maintien", color: "bg-red-900 text-red-300" },
  };

  const home = stakesConfig[context.homeStakes] ?? stakesConfig.midtable;
  const away = stakesConfig[context.awayStakes] ?? stakesConfig.midtable;

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Contexte du match
      </h5>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-400">{homeTeamName}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${home.color}`}>
            {home.label}
          </span>
        </div>
        <span className="text-zinc-700 text-[10px]">vs</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-400">{awayTeamName}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${away.color}`}>
            {away.label}
          </span>
        </div>
        {context.isDerby && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-orange-900 text-orange-300">
            Derby
          </span>
        )}
      </div>
    </div>
  );
}

function RefereeCompact({ referee }: { referee: RefereeProfile }) {
  const avgYellows = referee.avgYellowsPerMatch;
  const severity = avgYellows >= 5 ? "Sévère" : avgYellows >= 3.5 ? "Moyen" : "Permissif";
  const severityColor =
    severity === "Sévère"
      ? "bg-red-900 text-red-300"
      : severity === "Moyen"
      ? "bg-yellow-900 text-yellow-300"
      : "bg-green-900 text-green-300";

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Arbitre
      </h5>
      <div className="rounded-lg bg-zinc-800/40 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-200">{referee.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${severityColor}`}>
            {severity}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-yellow-400">{referee.avgYellowsPerMatch}</div>
            <div className="text-[10px] text-zinc-500">Jaunes/match</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-400">{referee.avgRedsPerMatch}</div>
            <div className="text-[10px] text-zinc-500">Rouges/match</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-zinc-300">{referee.penaltiesAwarded}</div>
            <div className="text-[10px] text-zinc-500">Penalties</div>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-zinc-500 text-center">
          {referee.matchesOfficiated} matchs arbitrés cette saison
        </div>
      </div>
    </div>
  );
}

function OddsCompact({
  odds,
  statsScore,
  homeTla,
  awayTla,
}: {
  odds: MatchOdds;
  statsScore: { homeScore: number; drawScore: number; awayScore: number };
  homeTla: string;
  awayTla: string;
}) {
  // Convert odds to implied probabilities
  const total = 1 / odds.homeWin + 1 / odds.draw + 1 / odds.awayWin;
  const impliedHome = Math.round((1 / odds.homeWin / total) * 100);
  const impliedDraw = Math.round((1 / odds.draw / total) * 100);
  const impliedAway = Math.round((1 / odds.awayWin / total) * 100);

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Cotes du marché
      </h5>
      <div className="rounded-lg bg-zinc-800/40 px-4 py-3 space-y-3">
        {/* Cotes brutes */}
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <div className="text-lg font-bold text-green-400">{odds.homeWin}</div>
            <div className="text-[10px] text-zinc-500">1 · {homeTla}</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-lg font-bold text-zinc-300">{odds.draw}</div>
            <div className="text-[10px] text-zinc-500">N · Nul</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-lg font-bold text-blue-400">{odds.awayWin}</div>
            <div className="text-[10px] text-zinc-500">2 · {awayTla}</div>
          </div>
        </div>

        {/* Barre de probabilité implicite */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-1">Probabilité implicite (marché)</div>
          <div className="flex h-2 w-full overflow-hidden rounded-full">
            <div className="bg-green-500" style={{ width: `${impliedHome}%` }} />
            <div className="bg-zinc-500" style={{ width: `${impliedDraw}%` }} />
            <div className="bg-blue-500" style={{ width: `${impliedAway}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
            <span>{impliedHome}%</span>
            <span>{impliedDraw}%</span>
            <span>{impliedAway}%</span>
          </div>
        </div>

        {/* Comparaison modèle vs marché */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-1">Modèle vs Marché</div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            {[
              { label: homeTla, model: statsScore.homeScore, market: impliedHome },
              { label: "Nul", model: statsScore.drawScore, market: impliedDraw },
              { label: awayTla, model: statsScore.awayScore, market: impliedAway },
            ].map(({ label, model, market }) => {
              const diff = model - market;
              const diffColor = Math.abs(diff) < 5 ? "text-zinc-400" : diff > 0 ? "text-green-400" : "text-red-400";
              return (
                <div key={label}>
                  <span className="text-zinc-400">{label}</span>
                  <span className={`block font-medium ${diffColor}`}>
                    {diff > 0 ? "+" : ""}{diff}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-[10px] text-zinc-600 text-center">
          Source : {odds.bookmaker}
        </div>
      </div>
    </div>
  );
}

function FatigueCompact({
  fatigue,
  homeTeamName,
  awayTeamName,
}: {
  fatigue: ScheduleFatigue;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const renderTeam = (name: string, data: ScheduleFatigue["home"], color: "green" | "blue") => {
    const restColor =
      data.daysSinceLastMatch !== null && data.daysSinceLastMatch <= 3
        ? "text-red-400"
        : data.daysSinceLastMatch !== null && data.daysSinceLastMatch <= 5
        ? "text-yellow-400"
        : "text-green-400";

    const loadColor =
      data.matchesLast30Days >= 10
        ? "text-red-400"
        : data.matchesLast30Days >= 7
        ? "text-yellow-400"
        : "text-green-400";

    const barColor = color === "green" ? "bg-green-500" : "bg-blue-500";
    const loadPct = Math.min(data.matchesLast30Days / 12, 1) * 100;

    return (
      <div className="rounded-lg bg-zinc-800/40 px-3 py-2.5">
        <div className="text-xs font-medium text-zinc-400 mb-2">{name}</div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">Repos</span>
            <span className={`font-medium ${restColor}`}>
              {data.daysSinceLastMatch !== null ? `${data.daysSinceLastMatch}j` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">Prochain</span>
            <span className="text-zinc-300">
              {data.daysUntilNextMatch !== null ? `dans ${data.daysUntilNextMatch}j` : "—"}
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Charge (30j)</span>
              <span className={`font-medium ${loadColor}`}>{data.matchesLast30Days} matchs</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden mt-1">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${loadPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Fatigue / Calendrier
      </h5>
      <div className="grid grid-cols-2 gap-3">
        {renderTeam(homeTeamName, fatigue.home, "green")}
        {renderTeam(awayTeamName, fatigue.away, "blue")}
      </div>
    </div>
  );
}

function isSuspension(reason: string | undefined | null): boolean {
  const lower = (reason ?? "").toLowerCase();
  return (
    lower.includes("suspend") ||
    lower.includes("red card") ||
    lower.includes("yellow card") ||
    lower.includes("carton") ||
    lower.includes("expuls")
  );
}

function InjuriesCompact({
  homeInjuries,
  awayInjuries,
  homeTeamName,
  awayTeamName,
}: {
  homeInjuries: { player: string; type: string; reason: string }[];
  awayInjuries: { player: string; type: string; reason: string }[];
  homeTeamName: string;
  awayTeamName: string;
}) {
  const renderList = (
    name: string,
    injuries: { player: string; type: string; reason: string }[]
  ) => {
    const suspended = injuries.filter((inj) => isSuspension(inj.reason));
    const injured = injuries.filter((inj) => !isSuspension(inj.reason));

    return (
      <div>
        <div className="text-xs font-medium text-zinc-400 mb-1.5">{name}</div>
        {injuries.length === 0 ? (
          <p className="text-[11px] text-zinc-600">Aucune absence</p>
        ) : (
          <div className="space-y-2">
            {injured.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px]">&#x1F3E5;</span>
                  <span className="text-[10px] font-medium text-red-400 uppercase tracking-wide">
                    Blessés ({injured.length})
                  </span>
                </div>
                <div className="space-y-0.5">
                  {injured.map((inj, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-red-500 text-[10px]">&#x2716;</span>
                      <span className="text-zinc-300">{inj.player}</span>
                      <span className="text-zinc-600">({inj.reason})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {suspended.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px]">&#x1F7E5;</span>
                  <span className="text-[10px] font-medium text-yellow-400 uppercase tracking-wide">
                    Suspendus ({suspended.length})
                  </span>
                </div>
                <div className="space-y-0.5">
                  {suspended.map((inj, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-yellow-500 text-[10px]">&#x26A0;</span>
                      <span className="text-zinc-300">{inj.player}</span>
                      <span className="text-zinc-600">({inj.reason})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Blessures / Suspensions
      </h5>
      <div className="grid grid-cols-2 gap-4">
        {renderList(homeTeamName, homeInjuries)}
        {renderList(awayTeamName, awayInjuries)}
      </div>
    </div>
  );
}

function EloCompact({
  homeElo,
  awayElo,
  homeTeamName,
  awayTeamName,
}: {
  homeElo: TeamElo | null;
  awayElo: TeamElo | null;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const homeVal = homeElo ? Math.round(homeElo.elo) : null;
  const awayVal = awayElo ? Math.round(awayElo.elo) : null;
  const diff = homeVal && awayVal ? homeVal - awayVal : null;
  const absDiff = diff !== null ? Math.abs(diff) : 0;
  const label = absDiff < 50 ? "Très serré" : absDiff < 100 ? "Avantage modéré" : "Écart significatif";
  const labelColor = absDiff < 50 ? "text-zinc-400" : absDiff < 100 ? "text-yellow-400" : "text-orange-400";

  // Bar proportions (min 1200, max ~2100)
  const min = 1200;
  const max = 2100;
  const homePct = homeVal ? ((homeVal - min) / (max - min)) * 100 : 0;
  const awayPct = awayVal ? ((awayVal - min) / (max - min)) * 100 : 0;

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Ratings ELO
      </h5>
      <div className="rounded-lg bg-zinc-800/40 px-4 py-3 space-y-3">
        <div className="space-y-2">
          {[
            { name: homeTeamName, val: homeVal, pct: homePct, color: "bg-green-500", textColor: "text-green-400" },
            { name: awayTeamName, val: awayVal, pct: awayPct, color: "bg-blue-500", textColor: "text-blue-400" },
          ].map(({ name, val, pct, color, textColor }) => (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-zinc-400">{name}</span>
                <span className={`text-sm font-bold ${textColor}`}>{val ?? "N/A"}</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-700 overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        {diff !== null && (
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className={`text-[11px] font-medium ${labelColor}`}>{label}</span>
            <span className="text-[10px] text-zinc-500">
              ({diff > 0 ? "+" : ""}{diff} pts)
            </span>
          </div>
        )}
        <div className="text-[10px] text-zinc-600 text-center">Source : ClubElo.com</div>
      </div>
    </div>
  );
}

function XGCompact({
  homeXG,
  awayXG,
  homeTeamName,
  awayTeamName,
}: {
  homeXG: TeamXG | null;
  awayXG: TeamXG | null;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const renderTeam = (name: string, xg: TeamXG | null, color: "green" | "blue") => {
    if (!xg) {
      return (
        <div className="rounded-lg bg-zinc-800/60 px-3 py-2.5">
          <div className="text-xs font-medium text-zinc-400 mb-1">{name}</div>
          <p className="text-[11px] text-zinc-600">Données xG indisponibles</p>
        </div>
      );
    }

    const attackColor = xg.xGPerMatch >= 1.8 ? "text-green-400" : xg.xGPerMatch >= 1.2 ? "text-zinc-300" : "text-red-400";
    const defenseColor = xg.xGAPerMatch <= 1.0 ? "text-green-400" : xg.xGAPerMatch <= 1.4 ? "text-zinc-300" : "text-red-400";
    const luckLabel = xg.xGDiff > 2 ? "Malchanceux" : xg.xGDiff > 0 ? "Sous-performe" : xg.xGDiff < -2 ? "Chanceux" : "Sur-performe";
    const luckColor = xg.xGDiff > 0 ? "bg-red-900 text-red-300" : "bg-green-900 text-green-300";
    const barColor = color === "green" ? "bg-green-500" : "bg-blue-500";

    return (
      <div className="rounded-lg bg-zinc-800/60 px-3 py-2.5 space-y-2">
        <div className="text-xs font-medium text-zinc-400">{name}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center">
            <div className={`text-lg font-bold ${attackColor}`}>{xg.xGPerMatch}</div>
            <div className="text-[9px] text-zinc-500 uppercase">xG / match</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${defenseColor}`}>{xg.xGAPerMatch}</div>
            <div className="text-[9px] text-zinc-500 uppercase">xGA / match</div>
          </div>
        </div>
        {/* xG bar */}
        <div>
          <div className="text-[9px] text-zinc-500 mb-0.5">Attaque</div>
          <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(xg.xGPerMatch / 2.5, 1) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500 mb-0.5">Solidité défensive</div>
          <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(1 - xg.xGAPerMatch / 2.5, 0) * 100}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${luckColor}`}>{luckLabel}</span>
          <span className="text-[10px] text-zinc-500">{xg.matches} matchs</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        Expected Goals (xG)
      </h5>
      <div className="grid grid-cols-2 gap-3">
        {renderTeam(homeTeamName, homeXG, "green")}
        {renderTeam(awayTeamName, awayXG, "blue")}
      </div>
      <div className="text-[10px] text-zinc-600 text-center mt-2">Source : Understat</div>
    </div>
  );
}

export function AnalysisBreakdown({ prediction }: AnalysisBreakdownProps) {
  const [open, setOpen] = useState(false);

  const { statsScore, homeTeam, awayTeam, playerAnalysis, injuries, news, tactics, headToHead, referee, odds, fatigue, matchContext, xG, elo } =
    prediction;

  return (
    <div className="rounded-xl border border-zinc-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors"
      >
        <span>Analyse détaillée</span>
        <span
          className={`text-xs transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          &#9660;
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-6">
          {/* 1. Probability scores */}
          <ProbabilityBar
            homeScore={statsScore.homeScore}
            drawScore={statsScore.drawScore}
            awayScore={statsScore.awayScore}
            homeTla={homeTeam.tla}
            awayTla={awayTeam.tla}
            outcome={prediction.outcome}
          />

          {/* 2. Factors breakdown */}
          <div>
            <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
              Facteurs de prédiction
            </h5>
            <div className="rounded-lg bg-zinc-800/40 px-3 py-1">
              {statsScore.factors.map((f) => (
                <FactorRow
                  key={f.label}
                  label={f.label}
                  homeValue={f.homeValue}
                  awayValue={f.awayValue}
                  weight={f.weight}
                />
              ))}
            </div>
          </div>

          {/* 2b. ELO Ratings */}
          {elo && (elo.home || elo.away) ? (
            <EloCompact
              homeElo={elo.home}
              awayElo={elo.away}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Ratings ELO" />
          )}

          {/* 2c. xG */}
          {xG && (xG.home || xG.away) ? (
            <XGCompact
              homeXG={xG.home}
              awayXG={xG.away}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Expected Goals (xG)" />
          )}

          {/* 3. Squad quality */}
          {playerAnalysis.home.keyPlayers.length > 0 ||
          playerAnalysis.away.keyPlayers.length > 0 ? (
            <SquadQualityComparison
              homeAnalysis={playerAnalysis.home}
              awayAnalysis={playerAnalysis.away}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Qualité des effectifs" />
          )}

          {/* 4. Key players */}
          {playerAnalysis.home.keyPlayers.length > 0 ||
          playerAnalysis.away.keyPlayers.length > 0 ? (
            <KeyPlayersCompact
              homeAnalysis={playerAnalysis.home}
              awayAnalysis={playerAnalysis.away}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Top buteurs / passeurs" />
          )}

          {/* 5. News */}
          {news && (news.home.length > 0 || news.away.length > 0) ? (
            <NewsCompact
              homeNews={news.home}
              awayNews={news.away}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Actualités récentes" />
          )}

          {/* 5b. Tactics */}
          {tactics && (tactics.home || tactics.away) ? (
            <TacticsCompact
              homeTactics={tactics.home}
              awayTactics={tactics.away}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Profil tactique" />
          )}

          {/* 6. Head-to-head */}
          {headToHead && headToHead.matches.length > 0 ? (
            <HeadToHeadCompact
              h2h={headToHead}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Confrontations directes" />
          )}

          {/* 7. Match context */}
          {matchContext ? (
            <MatchContextCompact
              context={matchContext}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Contexte du match" />
          )}

          {/* 8. Referee */}
          {referee ? (
            <RefereeCompact referee={referee} />
          ) : (
            <SectionUnavailable label="Arbitre" />
          )}

          {/* 9. Odds */}
          {odds ? (
            <OddsCompact
              odds={odds}
              statsScore={statsScore}
              homeTla={homeTeam.tla}
              awayTla={awayTeam.tla}
            />
          ) : (
            <SectionUnavailable label="Cotes du marché" />
          )}

          {/* 10. Fatigue */}
          {fatigue ? (
            <FatigueCompact
              fatigue={fatigue}
              homeTeamName={homeTeam.shortName}
              awayTeamName={awayTeam.shortName}
            />
          ) : (
            <SectionUnavailable label="Fatigue / Calendrier" />
          )}

          {/* 11. Injuries */}
          <InjuriesCompact
            homeInjuries={injuries.home}
            awayInjuries={injuries.away}
            homeTeamName={homeTeam.shortName}
            awayTeamName={awayTeam.shortName}
          />

          {/* 7. Methodology note */}
          <div className="rounded-lg bg-zinc-800/30 px-4 py-3 text-[11px] text-zinc-500 leading-relaxed">
            <span className="font-medium text-zinc-400">Méthodologie :</span>{" "}
            Moteur statistique (12 facteurs pondérés : ELO, xG, points/match,
            forme récente, bilans dom/ext, diff. buts, blessures, effectif,
            fatigue, H2H, solidité défensive, cotes du marché) +
            analyse des joueurs clés croisée avec les absences +
            profils tactiques + confrontations directes + contexte du match +
            raisonnement Claude IA en 5 étapes. Les probabilités reflètent le
            score composite avant ajustement IA.
          </div>
        </div>
      )}
    </div>
  );
}
