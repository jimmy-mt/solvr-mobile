import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

export const DAILY_GOAL_OPTIONS = [5, 10, 25, 50, 100] as const;
export type DailyGoal = (typeof DAILY_GOAL_OPTIONS)[number];

const DEFAULT_DAILY_GOAL: DailyGoal = 10;
const DAILY_GOAL_KEY = 'daily_goal';

let initialized = false;
let settingsDbPromise: Promise<SQLiteDatabase> | null = null;

async function getSettingsDb() {
  if (!settingsDbPromise) {
    settingsDbPromise = openDatabaseAsync('solvr_settings.db');
  }
  return settingsDbPromise;
}

export async function ensureAppSettingsStore() {
  if (initialized) return;
  const db = await getSettingsDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  initialized = true;
}

export async function getDailyGoal(): Promise<DailyGoal> {
  await ensureAppSettingsStore();
  const db = await getSettingsDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [DAILY_GOAL_KEY],
  );
  const parsed = Number(row?.value);
  return isDailyGoal(parsed) ? parsed : DEFAULT_DAILY_GOAL;
}

export async function setDailyGoal(goal: DailyGoal) {
  await ensureAppSettingsStore();
  const db = await getSettingsDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [DAILY_GOAL_KEY, String(goal)],
  );
}

function isDailyGoal(value: number): value is DailyGoal {
  return DAILY_GOAL_OPTIONS.includes(value as DailyGoal);
}
