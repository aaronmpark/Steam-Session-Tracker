import "dotenv/config";
import { fetchPlayerStatus } from "./steamApi";
import { SessionManager, formatDuration, recoverOrphanedSession } from "./sessionManager";
import { CompletedSession } from "./types";

// ─── Config ───────────────────────────────────────────────────────────────────

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID      = process.env.STEAM_ID;
const POLL_INTERVAL = 10_000; // 10 seconds in ms

if (!STEAM_API_KEY || !STEAM_ID) {
  console.error("❌ Missing STEAM_API_KEY or STEAM_ID in .env file");
  process.exit(1);
}

// ─── Session log (in-memory for now — will move to DB in Phase 3) ────────────

const sessionLog: CompletedSession[] = [];

function logSession(session: CompletedSession): void {
  sessionLog.push(session);
  printSessionLog();
}

function printSessionLog(): void {
  console.log("\n─────────────────────────────────────────");
  console.log("📋 Session Log");
  console.log("─────────────────────────────────────────");

  if (sessionLog.length === 0) {
    console.log("   No sessions recorded yet.");
  } else {
    sessionLog.forEach((s, i) => {
      console.log(
        `   ${i + 1}. ${s.gameName.padEnd(30)} ${formatDuration(s.durationSeconds).padStart(12)}` +
        `   (${s.startedAt.toLocaleDateString()} ${s.startedAt.toLocaleTimeString()})`
      );
    });
  }
  console.log("─────────────────────────────────────────\n");
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
    if (completed) {
      logSession(completed);
    }

  } catch (err) {
    console.error(`[${timestamp}] ⚠️  Poll error:`, (err as Error).message);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════╗");
  console.log("║      Steam Session Tracker v0.1        ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n🔑 Steam ID : ${STEAM_ID}`);
  console.log(`⏱️  Polling  : every ${POLL_INTERVAL / 1000}s`);
  console.log(`\nStarting poller... (Ctrl+C to stop)\n`);

  // Check for a crashed session from a previous run
  const recovered = recoverOrphanedSession();
  if (recovered) logSession(recovered);

  // Run immediately, then on interval
  await poll();
  setInterval(poll, POLL_INTERVAL);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down...");
  printSessionLog();
  console.log("Note: If a session was active, it will be recovered on next launch.");
  process.exit(0);
});

main();
