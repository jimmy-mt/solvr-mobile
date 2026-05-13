import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  bestAction,
  getActionFrequency,
  scenarioLabel,
  type SpotTypeFilter,
  type TrainerAction,
  type TrainerDeal,
} from './trainerDb';

export type PerformanceSession = {
  id: number;
  started_at: number;
  ended_at: number | null;
  spot_type_filter: SpotTypeFilter;
  position_filter: string;
  total_hands: number;
  correct_hands: number;
  accuracy: number;
  solvr_score_total: number;
  solvr_score_count: number;
  solvr_score: number;
};

export type SpotScoreSummary = {
  spot_key: string;
  spot_label: string;
  spot_type: Exclude<SpotTypeFilter, 'ANY'>;
  hero_position: string;
  opener_position: string | null;
  threebetter_position: string | null;
  fourbetter_position: string | null;
  total_hands: number;
  correct_hands: number;
  accuracy: number;
  solvr_score: number | null;
  last_played_at: number;
};

export type PerformanceDecision = {
  id: number;
  session_id: number;
  timestamp: number;
  node_id: number;
  spot_key: string;
  spot_label: string;
  spot_type: Exclude<SpotTypeFilter, 'ANY'>;
  hero_position: string;
  opener_position: string | null;
  threebetter_position: string | null;
  fourbetter_position: string | null;
  hand_class: string;
  action_taken: TrainerAction;
  was_correct: number;
  gto_fold: number;
  gto_call: number;
  gto_raise: number;
  gto_all_in: number;
  solvr_score: number | null;
  dominant_action: TrainerAction | null;
  dominant_freq: number;
  chosen_freq: number;
};

type DecisionInput = {
  deal: TrainerDeal;
  action: TrainerAction;
  wasCorrect: boolean;
  solvrScore: number;
};

let initialized = false;
let performanceDbPromise: Promise<SQLiteDatabase> | null = null;

async function getPerformanceDb() {
  if (!performanceDbPromise) {
    performanceDbPromise = openDatabaseAsync('solvr_performance.db');
  }
  return performanceDbPromise;
}

export async function ensurePerformanceStore() {
  if (initialized) return;
  const db = await getPerformanceDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS performance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      spot_type_filter TEXT NOT NULL,
      position_filter TEXT NOT NULL,
      total_hands INTEGER NOT NULL DEFAULT 0,
      correct_hands INTEGER NOT NULL DEFAULT 0,
      accuracy REAL NOT NULL DEFAULT 0,
      solvr_score_total REAL NOT NULL DEFAULT 0,
      solvr_score_count INTEGER NOT NULL DEFAULT 0,
      solvr_score REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS performance_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      node_id INTEGER NOT NULL,
      spot_key TEXT NOT NULL,
      spot_label TEXT NOT NULL,
      spot_type TEXT NOT NULL,
      hero_position TEXT NOT NULL,
      opener_position TEXT,
      threebetter_position TEXT,
      fourbetter_position TEXT,
      hand_class TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      was_correct INTEGER NOT NULL,
      gto_fold REAL NOT NULL,
      gto_call REAL NOT NULL,
      gto_raise REAL NOT NULL,
      gto_all_in REAL NOT NULL,
      solvr_score REAL,
      dominant_action TEXT,
      dominant_freq REAL NOT NULL,
      chosen_freq REAL NOT NULL,
      FOREIGN KEY(session_id) REFERENCES performance_sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_performance_sessions_started
      ON performance_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_performance_decisions_session
      ON performance_decisions(session_id);
    CREATE INDEX IF NOT EXISTS idx_performance_decisions_spot
      ON performance_decisions(spot_key);
  `);
  initialized = true;
}

export async function startPerformanceSession(
  filters: { spotTypeFilter: SpotTypeFilter; positionFilter: string[] },
) {
  await ensurePerformanceStore();
  const db = await getPerformanceDb();
  const result = await db.runAsync(
    `INSERT INTO performance_sessions (
      started_at,
      ended_at,
      spot_type_filter,
      position_filter,
      total_hands,
      correct_hands,
      accuracy,
      solvr_score_total,
      solvr_score_count,
      solvr_score
    ) VALUES (?, NULL, ?, ?, 0, 0, 0, 0, 0, 0)`,
    [
      Date.now(),
      filters.spotTypeFilter,
      JSON.stringify(filters.positionFilter),
    ],
  );
  return result.lastInsertRowId;
}

export async function endPerformanceSession(sessionId: number | null) {
  if (!sessionId) return;
  await ensurePerformanceStore();
  const db = await getPerformanceDb();
  await db.runAsync(
    'UPDATE performance_sessions SET ended_at = ? WHERE id = ?',
    [Date.now(), sessionId],
  );
}

export async function savePerformanceDecision(
  sessionId: number,
  input: DecisionInput,
) {
  await ensurePerformanceStore();
  const db = await getPerformanceDb();
  const { deal, action, wasCorrect, solvrScore } = input;
  const now = Date.now();
  const dominantAction = bestAction(deal.handFreq);
  const chosenFreq = getActionFrequency(action, deal.handFreq);
  const dominantFreq = getActionFrequency(dominantAction, deal.handFreq);
  const spotKey = String(deal.spot.nodeId);
  const spotLabel = scenarioLabel(deal.spot);

  await db.runAsync(
    `INSERT INTO performance_decisions (
      session_id,
      timestamp,
      node_id,
      spot_key,
      spot_label,
      spot_type,
      hero_position,
      opener_position,
      threebetter_position,
      fourbetter_position,
      hand_class,
      action_taken,
      was_correct,
      gto_fold,
      gto_call,
      gto_raise,
      gto_all_in,
      solvr_score,
      dominant_action,
      dominant_freq,
      chosen_freq
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      now,
      deal.spot.nodeId,
      spotKey,
      spotLabel,
      deal.spot.type,
      deal.spot.hero,
      deal.spot.opener,
      deal.spot.threebetter,
      deal.spot.fourbetter,
      deal.hand,
      action,
      wasCorrect ? 1 : 0,
      deal.handFreq.fold_freq,
      deal.handFreq.call_freq,
      deal.handFreq.raise_freq,
      deal.handFreq.all_in_freq,
      solvrScore,
      dominantAction,
      dominantFreq,
      chosenFreq,
    ],
  );

  const session = await db.getFirstAsync<PerformanceSession>(
    'SELECT * FROM performance_sessions WHERE id = ?',
    [sessionId],
  );
  if (!session) return;

  const totalHands = Number(session.total_hands || 0) + 1;
  const correctHands = Number(session.correct_hands || 0) + (wasCorrect ? 1 : 0);
  const scoreTotal = Number(session.solvr_score_total || 0) + solvrScore;
  const scoreCount = Number(session.solvr_score_count || 0) + 1;
  await db.runAsync(
    `UPDATE performance_sessions
     SET total_hands = ?,
         correct_hands = ?,
         accuracy = ?,
         solvr_score_total = ?,
         solvr_score_count = ?,
         solvr_score = ?
     WHERE id = ?`,
    [
      totalHands,
      correctHands,
      totalHands > 0 ? correctHands / totalHands : 0,
      scoreTotal,
      scoreCount,
      scoreCount > 0 ? scoreTotal / scoreCount : 0,
      sessionId,
    ],
  );
}

export async function getSpotScoreSummaries() {
  await ensurePerformanceStore();
  const db = await getPerformanceDb();
  return db.getAllAsync<SpotScoreSummary>(
    `SELECT
      spot_key,
      MAX(spot_label) AS spot_label,
      MAX(spot_type) AS spot_type,
      MAX(hero_position) AS hero_position,
      MAX(opener_position) AS opener_position,
      MAX(threebetter_position) AS threebetter_position,
      MAX(fourbetter_position) AS fourbetter_position,
      COUNT(*) AS total_hands,
      SUM(was_correct) AS correct_hands,
      CAST(SUM(was_correct) AS REAL) / COUNT(*) AS accuracy,
      AVG(solvr_score) AS solvr_score,
      MAX(timestamp) AS last_played_at
     FROM performance_decisions
     GROUP BY spot_key
     ORDER BY last_played_at DESC`,
  );
}

export async function getPerformanceDecisions() {
  await ensurePerformanceStore();
  const db = await getPerformanceDb();
  return db.getAllAsync<PerformanceDecision>(
    `SELECT *
     FROM performance_decisions
     ORDER BY timestamp DESC`,
  );
}

export async function getPerformanceSessions() {
  await ensurePerformanceStore();
  const db = await getPerformanceDb();
  return db.getAllAsync<PerformanceSession>(
    `SELECT *
     FROM performance_sessions
     ORDER BY started_at DESC`,
  );
}
