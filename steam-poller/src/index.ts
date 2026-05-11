import "dotenv/config";
import { fetchPlayerStatus } from "./steamApi";
import { SessionManager, formatDuration, recoverOrphanedSession } from "./sessionManager";
import { CompletedSession } from "./types";
import {
  initDatabase,
  saveSession,
  getAllSessions,
  getStatsPerGame,
} from "./database";

// ─── Config ───────────────────────────────────────────────────────────────────

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID      = process.env.STEAM_ID;
const POLL_INTERVAL = 30_000;

if (!STEAM_API_KEY || !STEAM_ID) {
  console.error("❌ Missing STEAM_API_KEY or STEAM_ID in .env file");
  process.exit(1);
}

// ─── Session handling ─────────────────────────────────────────────────────────

function handleCompletedSession(session: CompletedSession): void {
  const id = saveSession(session);
  console.log(`\n💾 Session saved to local database (id: ${id})`);
  printSessionLog();
}

function printSessionLog(): void {
  const sessions = getAllSessions();
  const stats    = getStatsPerGame();

  console.log("\n─────────────────────────────────────────────────────");
  console.log("📋 Session Log (all time)");
  console.log("─────────────────────────────────────────────────────");

  if (sessions.length === 0) {
    console.log("   No sessions recorded yet.");
  } else {
    sessions.slice(0, 10).forEach((s, i) => {
      const date   = new Date(s.started_at).toLocaleDateString();
      const time   = new Date(s.started_at).toLocaleTimeString();
      const synced = s.synced_to_cloud ? "☁️" : "💾";
      console.log(
        `   ${String(i + 1).padStart(2)}. ${synced} ${s.game_name.padEnd(28)} ` +
        `${formatDuration(s.duration_s).padStart(12)}   ${date} ${time}`
      );
    });
    if (sessions.length > 10) console.log(`   ... and ${sessions.length - 10} more`);
  }

  if (stats.length > 0) {
    console.log("\n📊 Per-Game Totals");
    console.log("─────────────────────────────────────────────────────");
    stats.forEach((g) => {
      console.log(
        `   ${g.game_name.padEnd(28)} ` +
        `${String(g.session_count).padStart(3)} sessions   ` +
        `total: ${formatDuration(g.total_seconds).padStart(12)}   ` +
        `avg: ${formatDuration(Math.floor(g.avg_seconds))}`
      );
    });
  }

  console.log("─────────────────────────────────────────────────────\n");
}

// ─── Poll tick ────────────────────────────────────────────────────────────────

const manager = new SessionManager();

async function poll(): Promise<void> {
  const timestamp = new Date().toLocaleTimeString();
  try {
    const player = await fetchPlayerStatus(STEAM_API_KEY!, STEAM_ID!);
    if (!player) return;

    const current = manager.getCurrentSession();

    if (player.gameid) {
      const elapsed = current
        ? formatDuration(Math.floor((Date.now() - current.startedAtMs) / 1000))
        : "—";
      console.log(`[${timestamp}] 🎮 In game: ${player.gameextrainfo} — elapsed: ${elapsed}`);
    } else {
      console.log(`[${timestamp}] 💤 Not in game (${player.personaname})`);
    }

    const completed = manager.processPoll(player);
    if (completed) handleCompletedSession(completed);

  } catch (err) {
    console.error(`[${timestamp}] ⚠️  Poll error:`, (err as Error).message);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════╗");
  console.log("║      Steam Session Tracker v0.2        ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n🔑 Steam ID : ${STEAM_ID}`);
  console.log(`⏱️  Polling  : every ${POLL_INTERVAL / 1000}s`);

  await initDatabase();

  const recovered = recoverOrphanedSession();
  if (recovered) handleCompletedSession(recovered);

  printSessionLog();

  console.log("Starting poller... (Ctrl+C to stop)\n");
  await poll();
  setInterval(poll, POLL_INTERVAL);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down...");
  printSessionLog();
  console.log("Sessions are safely stored in sessions.db");
  process.exit(0);
});

main();
