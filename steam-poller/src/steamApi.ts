import { SteamApiResponse, SteamPlayer } from "./types";

const STEAM_API_BASE = "https://api.steampowered.com";

// ─── Fetch current player status from Steam ───────────────────────────────────

export async function fetchPlayerStatus(
  apiKey: string,
  steamId: string
): Promise<SteamPlayer | null> {
  const url =
    `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/` +
    `?key=${apiKey}&steamids=${steamId}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Steam API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as SteamApiResponse;
  const players = data?.response?.players;

  if (!players || players.length === 0) {
    throw new Error("No player data returned — check your STEAM_ID");
  }

  return players[0];
}

// ─── Helper: is the player currently in a game? ───────────────────────────────

export function isInGame(player: SteamPlayer): boolean {
  return !!player.gameid && !!player.gameextrainfo;
}
