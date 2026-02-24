"use client";

import { useState } from "react";
import { GoalsByPeriod, NewsArticle, Prediction, TacticalProfile, TeamPlayerAnalysis } from "@/lib/types";
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
  const colorMap = {
    green: { bg: "bg-green-500", text: "text-green-400" },
    blue: { bg: "bg-blue-500", text: "text-blue-400" },
    red: { bg: "bg-red-500", text: "text-red-400" },
  };
  const c = colorMap[color];

  return (
    <div>
      <div className="text-[10px] text-zinc-500 mb-1">{label}</div>
      <div className="flex gap-0.5">
        {PERIOD_LABELS.map((period, i) => {
          const opacity = values[i] > 0 ? 0.2 + (values[i] / max) * 0.8 : 0.05;
          return (
            <div key={period} className="flex-1 group relative">
              <div
                className={`h-5 rounded-sm ${c.bg}`}
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
    const record = color === "green" ? tactics.homeRecord : tactics.awayRecord;
    const recordLabel = color === "green" ? "Dom" : "Ext";

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

export function AnalysisBreakdown({ prediction }: AnalysisBreakdownProps) {
  const [open, setOpen] = useState(false);

  const { statsScore, homeTeam, awayTeam, playerAnalysis, injuries, news, tactics } =
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

          {/* 6. Injuries */}
          <InjuriesCompact
            homeInjuries={injuries.home}
            awayInjuries={injuries.away}
            homeTeamName={homeTeam.shortName}
            awayTeamName={awayTeam.shortName}
          />

          {/* 7. Methodology note */}
          <div className="rounded-lg bg-zinc-800/30 px-4 py-3 text-[11px] text-zinc-500 leading-relaxed">
            <span className="font-medium text-zinc-400">Méthodologie :</span>{" "}
            Moteur statistique (7 facteurs pondérés) + analyse des joueurs clés
            (top buteurs/passeurs de la ligue) croisée avec les blessures +
            profils tactiques (formations, bilans dom/ext, distribution des buts) +
            raisonnement Claude IA. Les probabilités reflètent le score composite
            avant ajustement IA.
          </div>
        </div>
      )}
    </div>
  );
}
