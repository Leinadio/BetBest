"use client";

import { Match } from "@/lib/types";
import Image from "next/image";

interface MatchListProps {
  matches: Match[];
  selectedMatchId: number | null;
  onSelectMatch: (match: Match) => void;
  disabled?: boolean;
}

function formatDate(utcDate: string): string {
  return new Date(utcDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(utcDate: string): string {
  return new Date(utcDate).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDate(matches: Match[]): Map<string, Match[]> {
  const groups = new Map<string, Match[]>();
  for (const match of matches) {
    const dateKey = formatDate(match.utcDate);
    const group = groups.get(dateKey) ?? [];
    group.push(match);
    groups.set(dateKey, group);
  }
  return groups;
}

export function MatchList({
  matches,
  selectedMatchId,
  onSelectMatch,
  disabled,
}: MatchListProps) {
  const dateGroups = groupByDate(matches);

  return (
    <div className="space-y-4">
      {Array.from(dateGroups.entries()).map(([date, dateMatches]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-2">
            {date}
          </h3>
          <div className="space-y-2">
            {dateMatches.map((match) => {
              const isSelected = match.id === selectedMatchId;
              return (
                <button
                  key={match.id}
                  onClick={() => onSelectMatch(match)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-orange-500 bg-orange-500/10"
                      : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-500 hover:bg-zinc-800"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {/* Équipe domicile */}
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <span className="text-sm font-medium text-white truncate text-right">
                      {match.homeTeam.shortName}
                    </span>
                    <Image
                      src={match.homeTeam.crest}
                      alt={match.homeTeam.name}
                      width={24}
                      height={24}
                      className="shrink-0"
                    />
                  </div>

                  {/* Horaire */}
                  <div className="flex flex-col items-center shrink-0 w-16">
                    <span className="text-xs font-semibold text-orange-400">
                      {formatTime(match.utcDate)}
                    </span>
                    {match.status === "SCHEDULED" && (
                      <span className="text-[10px] text-zinc-500">non confirmé</span>
                    )}
                  </div>

                  {/* Équipe extérieur */}
                  <div className="flex items-center gap-2 flex-1">
                    <Image
                      src={match.awayTeam.crest}
                      alt={match.awayTeam.name}
                      width={24}
                      height={24}
                      className="shrink-0"
                    />
                    <span className="text-sm font-medium text-white truncate">
                      {match.awayTeam.shortName}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
