// ─── Steam API Response Types ─────────────────────────────────────────────────

export interface SteamPlayer {
  steamid: string;
  personaname: string;       // display name
  profileurl: string;
  avatar: string;
  personastate: number;      // 0=offline, 1=online, 2=busy, etc.
  gameid?: string;           // present only when in a game
  gameextrainfo?: string;    // human-readable game name
}

export interface SteamApiResponse {
  response: {
    players: SteamPlayer[];
  };
}

// ─── Session Types ────────────────────────────────────────────────────────────

export interface ActiveSession {
  appId: string;
  gameName: string;
  startedAt: Date;
  startedAtMs: number;       // Date.now() at start — used for precise duration
}

export interface CompletedSession {
  appId: string;
  gameName: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
}
