import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CLASS_LIST } from './roster.mjs';

export function createDatabase(filename = process.env.DATABASE_PATH || './data/homework.db') {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS homework_records (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      assign TEXT NOT NULL,
      cls TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pass','miss','redo','star')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(date, assign, cls, name)
    );
    CREATE INDEX IF NOT EXISTS idx_records_cls_date ON homework_records(cls, date);
    CREATE INDEX IF NOT EXISTS idx_records_cls_name ON homework_records(cls, name);

    CREATE TABLE IF NOT EXISTS reward_draws (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      cls TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      series TEXT NOT NULL,
      card TEXT NOT NULL,
      rar TEXT NOT NULL,
      img TEXT NOT NULL,
      no TEXT NOT NULL,
      client_request_id TEXT NOT NULL UNIQUE,
      legacy_id TEXT UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rewards_cls_name ON reward_draws(cls, name);

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO app_meta(key, value) VALUES('schema_version', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `);
  return db;
}

export function mapRecord(row) {
  if (!row) return null;
  return {
    ...row,
    miss: row.status === 'miss',
    redo: row.status === 'redo',
    star: row.status === 'star',
  };
}

export function mapReward(row) {
  if (!row) return null;
  return {
    id: row.id, date: row.date, cls: row.cls, name: row.name,
    kind: row.kind, series: row.series, card: row.card, rar: row.rar,
    img: row.img, no: row.no, created_at: row.created_at,
  };
}

export function listRecords(db) {
  return db.prepare('SELECT * FROM homework_records ORDER BY date, cls, assign, name').all().map(mapRecord);
}

export function listRewards(db) {
  return db.prepare('SELECT * FROM reward_draws ORDER BY created_at, id').all().map(mapReward);
}

export function getRecord(db, id) {
  return mapRecord(db.prepare('SELECT * FROM homework_records WHERE id = ?').get(id));
}

export function upsertRecord(db, input) {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO homework_records(id, date, assign, cls, name, status, note, created_at, updated_at)
    VALUES (@id, @date, @assign, @cls, @name, @status, @note, @now, @now)
    ON CONFLICT(date, assign, cls, name) DO UPDATE SET
      status = excluded.status, note = excluded.note, updated_at = excluded.updated_at
  `).run({ ...input, id, now });
  return mapRecord(db.prepare(`
    SELECT * FROM homework_records WHERE date = ? AND assign = ? AND cls = ? AND name = ?
  `).get(input.date, input.assign, input.cls, input.name));
}

const finalizeTransaction = (db, input) => db.transaction(() => {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO homework_records(id, date, assign, cls, name, status, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pass', '', ?, ?)
    ON CONFLICT(date, assign, cls, name) DO NOTHING
  `);
  for (const name of CLASS_LIST[input.cls]) {
    insert.run(randomUUID(), input.date, input.assign, input.cls, name, now, now);
  }
  return db.prepare('SELECT * FROM homework_records WHERE date = ? AND assign = ? AND cls = ?')
    .all(input.date, input.assign, input.cls).map(mapRecord);
});

export function finalizeRegistration(db, input) {
  return finalizeTransaction(db, input).immediate();
}

export function completeRecord(db, id) {
  const result = db.prepare("UPDATE homework_records SET status = 'pass', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
  return result.changes ? getRecord(db, id) : null;
}

export function deleteRecord(db, id) {
  return db.prepare('DELETE FROM homework_records WHERE id = ?').run(id).changes === 1;
}

export function pointsBalance(db, cls, name) {
  const earned = db.prepare(`
    SELECT COALESCE(SUM(CASE status WHEN 'pass' THEN 1 WHEN 'star' THEN 3 ELSE 0 END), 0) AS value
    FROM homework_records WHERE cls = ? AND name = ?
  `).get(cls, name).value;
  const redeemed = db.prepare('SELECT COUNT(*) AS value FROM reward_draws WHERE cls = ? AND name = ?').get(cls, name).value;
  return { earned, redeemed, left: earned - redeemed * 10 };
}

export function rewardByRequestId(db, requestId) {
  return db.prepare('SELECT * FROM reward_draws WHERE client_request_id = ?').get(requestId);
}
