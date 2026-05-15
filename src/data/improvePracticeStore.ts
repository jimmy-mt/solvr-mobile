import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const MAX_IMPROVE_HANDS = 250;

export type ImprovePracticeHand = {
  id: number;
  node_id: number;
  hand_class: string;
  queued_at: number;
};

let initialized = false;
let improveDbPromise: Promise<SQLiteDatabase> | null = null;

async function getImproveDb() {
  if (!improveDbPromise) {
    improveDbPromise = openDatabaseAsync('solvr_improve_practice.db');
  }
  return improveDbPromise;
}

export async function ensureImprovePracticeStore() {
  if (initialized) return;
  const db = await getImproveDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS improve_practice_hands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      hand_class TEXT NOT NULL,
      queued_at INTEGER NOT NULL,
      UNIQUE(node_id, hand_class)
    );

    CREATE INDEX IF NOT EXISTS idx_improve_practice_hands_queued
      ON improve_practice_hands(queued_at);
  `);
  initialized = true;
}

export async function getImprovePracticeCount() {
  await ensureImprovePracticeStore();
  const db = await getImproveDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM improve_practice_hands',
  );
  return Number(row?.count || 0);
}

export async function getRandomImprovePracticeHand() {
  await ensureImprovePracticeStore();
  const db = await getImproveDb();
  return db.getFirstAsync<ImprovePracticeHand>(
    `SELECT *
     FROM improve_practice_hands
     ORDER BY RANDOM()
     LIMIT 1`,
  );
}

export async function enqueueImprovePracticeHand(nodeId: number, handClass: string) {
  await ensureImprovePracticeStore();
  const db = await getImproveDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO improve_practice_hands (node_id, hand_class, queued_at)
     VALUES (?, ?, ?)`,
    [nodeId, handClass, Date.now()],
  );
  const count = await getImprovePracticeCount();
  const overflow = Math.max(0, count - MAX_IMPROVE_HANDS);
  if (overflow === 0) return;

  await db.runAsync(
    `DELETE FROM improve_practice_hands
     WHERE id IN (
       SELECT id
       FROM improve_practice_hands
       ORDER BY queued_at ASC, id ASC
       LIMIT ?
     )`,
    [overflow],
  );
}

export async function removeImprovePracticeHand(nodeId: number, handClass: string) {
  await ensureImprovePracticeStore();
  const db = await getImproveDb();
  await db.runAsync(
    'DELETE FROM improve_practice_hands WHERE node_id = ? AND hand_class = ?',
    [nodeId, handClass],
  );
}
