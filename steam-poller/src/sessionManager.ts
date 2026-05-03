import fs from "fs";
import path from "path";
import { ActiveSession, CompletedSession, SteamPlayer } from "./types";
import { isInGame } from "./steamApi";

const HEARTBEAT_PATH = path.join(process.cwd(), ".session-heartbeat.json");

// ─── Heartbeat (crash recovery) ───────────────────────────────────────────────

function writeHeartbeat(session: ActiveSession): void {
  fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(session, null, 2));
}

function clearHeartbeat(): void {
  if (fs.existsSync(HEARTBEAT_PATH)) fs.unlinkSync(HEARTBEAT_PATH);
}

export function recoverOrphanedSession(): CompletedSession | null {
  if (!fs.existsSync(HEARTBEAT_PATH)) return null;

  try {
    const raw = fs.readFileSync(HEARTBEAT_PATH, "utf-8");
    const orphan = JSON.parse(raw) as ActiveSession;
    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - orphan.startedAtMs) / 1000
    );

    clearHeartbeat();

    console.log(`\n⚠️  Recovered orphaned session from previous run:`);
    console.log(`   Game    : ${orphan.gameName}`);
    console.log(`   Started : ${new Date(orphan.startedAt).toLocaleTimeString()}`);
    console.log(`   Duration: ${formatDuration(durationSeconds)} (best-guess end time)\n`);

    return {
      appId: orphan.appId,
      gameName: orphan.gameName,
      startedAt: new Date(orphan.startedAt),
      endedAt,
      durationSeconds,
    };
  } catch {
    clearHeartbeat(); // corrupted — discard
    return null;
  }
}

// ─── Session Manager ──────────────────────────────────────────────────────────

export class SessionManager {
  private activeSession: ActiveSession | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  // Called on each poll tick
  processPoll(player: SteamPlayer): CompletedSession | null {
    const inGame = isInGame(player);
    const currentAppId = player.gameid ?? null;
    const currentGameName = player.gameextrainfo ?? null;

    // ── Case 1: No active session, not in a game — nothing to do
    if (!this.activeSession && !inGame) {
      return null;
    }

    // ── Case 2: Not in session, game just started — begin tracking
    if (!this.activeSession && inGame && currentAppId && currentGameName) {
      this.startSession(currentAppId, currentGameName);
      return null;
    }

    // ── Case 3: In session, same game still running — heartbeat only
    if (this.activeSession && inGame && currentAppId === this.activeSession.appId) {
      writeHeartbeat(this.activeSession);
      return null;
    }

    // ── Case 4: In session but switched games — end old, start new
    if (this.activeSession && inGame && currentAppId !== this.activeSession.appId && currentAppId && currentGameName) {
      const completed = this.endSession();
      this.startSession(currentAppId, currentGameName);
      return completed;
    }

    // ── Case 5: In session, game closed — end session
    if (this.activeSession && !inGame) {
      return this.endSession();
    }

    return null;
  }

  private startSession(appId: string, gameName: string): void {
    this.activeSession = {
      appId,
      gameName,
      startedAt: new Date(),
      startedAtMs: Date.now(),
    };
    writeHeartbeat(this.activeSession);
    console.log(`\n🎮 Session started`);
    console.log(`   Game   : ${gameName} (appId: ${appId})`);
    console.log(`   Started: ${this.activeSession.startedAt.toLocaleTimeString()}`);
  }

  private endSession(): CompletedSession {
    if (!this.activeSession) throw new Error("endSession called with no active session");

    const endedAt = new Date();
    const durationSeconds = Math.floor((Date.now() - this.activeSession.startedAtMs) / 1000);

    const completed: CompletedSession = {
      appId: this.activeSession.appId,
      gameName: this.activeSession.gameName,
      startedAt: this.activeSession.startedAt,
      endedAt,
      durationSeconds,
    };

    clearHeartbeat();
    this.activeSession = null;

    console.log(`\n🏁 Session ended`);
    console.log(`   Game    : ${completed.gameName}`);
    console.log(`   Duration: ${formatDuration(completed.durationSeconds)}`);
    console.log(`   From    : ${completed.startedAt.toLocaleTimeString()} → ${completed.endedAt.toLocaleTimeString()}`);

    return completed;
  }

  getCurrentSession(): ActiveSession | null {
    return this.activeSession;
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
