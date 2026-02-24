"use client";

import { LEAGUES } from "@/lib/types";

interface LeagueSelectorProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}

export function LeagueSelector({ value, onChange, disabled }: LeagueSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-2">
        Compétition
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
      >
        <option value="">Sélectionner une ligue</option>
        {LEAGUES.map((league) => (
          <option key={league.code} value={league.code}>
            {league.flag} {league.name} — {league.country}
          </option>
        ))}
      </select>
    </div>
  );
}
