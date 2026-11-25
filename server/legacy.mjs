import { createHash, randomUUID } from 'node:crypto';
import { MEDAL_IMG } from '../public/catalog.mjs';
import { mapRecord, mapReward } from './db.mjs';
import { recordInput, validDate, validStudent } from './validation.mjs';

function legacyError(message) {
  throw new Error(`旧数据校验失败：${message}`);
}

function legacyStatus(record) {
  if (record.miss) return 'miss';
  if (record.redo) return 'redo';
  if (record.star) return 'star';
  return 'pass';
}

function legacyId(value, payload) {
  return String(value ?? createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
}

function normalizeRecords(records) {
  if (!Array.isArray(records)) legacyError('作业记录文件必须是数组。');
  const unique = new Map();
  for (const raw of records) {
    let record;
    try {
      record = recordInput({ ...raw, status:legacyStatus(raw) });
    } catch (error) {
      legacyError(error.message);
    }
    const key = JSON.stringify([record.date, record.assign, record.cls, record.name]);
    const previous = unique.get(key);
    if (previous && (previous.status !== record.status || previous.note !== record.note)) {
      legacyError('同一学生同一场作业存在多个不同状态，请先人工核对。');
    }
    unique.set(key, record);
  }
  return [...unique.values()];
}

function safeText(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) legacyError(`${label}无效。`);
  return value.trim();
}

function normalizeRewards(rewards) {
  if (!Array.isArray(rewards)) legacyError('奖励记录文件必须是数组。');
  const unique = new Map();
  for (const raw of rewards) {
    const cls = raw.cls;
    try { validStudent(cls, raw.name); } catch (error) { legacyError(error.message); }
    const kind = raw.kind;
    if (!['card', 'priv'].includes(kind)) legacyError('奖励类型无效。');
    if (!['R', 'SR', 'SSR', 'UR', 'PR', 'PS'].includes(raw.rar)) legacyError('奖励稀有度无效。');
    const img = raw.img || MEDAL_IMG;
    try {
      const url = new URL(img);
      if (url.protocol !== 'https:' || url.hostname !== 'media.doubao.com') legacyError('奖励图片地址无效。');
    } catch (error) {
      if (error.message.startsWith('旧数据校验失败')) throw error;
      legacyError('奖励图片地址无效。');
    }
    const reward = {
      legacy_id:legacyId(raw.id, raw),
      date:validDate(raw.date), cls, name:raw.name, kind,
      series:safeText(raw.series, '奖励分类', 50),
      card:safeText(raw.card, '奖励名称', 100),
      rar:raw.rar, img, no:safeText(String(raw.no ?? ''), '奖励编号', 20),
    };
    const previous = unique.get(reward.legacy_id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(reward)) legacyError('相同奖励标识对应不同内容。');
    unique.set(reward.legacy_id, reward);
  }
  return [...unique.values()];
}

export function importLegacy(db, rawRecords, rawRewards) {
  const recordsToImport = normalizeRecords(rawRecords);
  const rewardsToImport = normalizeRewards(rawRewards);
  const result = { insertedRecords:0, skippedRecords:0, insertedRewards:0, skippedRewards:0 };

  const transaction = db.transaction(() => {
    const findRecord = db.prepare('SELECT * FROM homework_records WHERE date = ? AND assign = ? AND cls = ? AND name = ?');
    const insertRecord = db.prepare(`INSERT INTO homework_records(id, date, assign, cls, name, status, note, created_at, updated_at)
      VALUES (@id, @date, @assign, @cls, @name, @status, @note, @now, @now)`);
    for (const record of recordsToImport) {
      const existing = findRecord.get(record.date, record.assign, record.cls, record.name);
      if (existing) {
        if (existing.status !== record.status || existing.note !== record.note) {
          legacyError('数据库中同一作业记录的状态或备注不同，未执行任何导入。');
        }
        result.skippedRecords++;
        continue;
      }
      const now = new Date().toISOString();
      insertRecord.run({ ...record, id:randomUUID(), now });
      result.insertedRecords++;
    }

    const findReward = db.prepare('SELECT * FROM reward_draws WHERE legacy_id = ?');
    const insertReward = db.prepare(`INSERT INTO reward_draws(id, date, cls, name, kind, series, card, rar, img, no, client_request_id, legacy_id, created_at)
      VALUES (@id, @date, @cls, @name, @kind, @series, @card, @rar, @img, @no, @client_request_id, @legacy_id, @created_at)`);
    for (const reward of rewardsToImport) {
      const existing = findReward.get(reward.legacy_id);
      if (existing) {
        const comparable = mapReward(existing);
        const expected = mapReward({ ...reward, id:existing.id, created_at:existing.created_at });
        if (JSON.stringify(comparable) !== JSON.stringify(expected)) legacyError('相同旧奖励标识在数据库中对应不同内容。');
        result.skippedRewards++;
        continue;
      }
      const requestHash = createHash('sha256').update(reward.legacy_id).digest('hex');
      insertReward.run({
        ...reward, id:randomUUID(), client_request_id:`legacy-${requestHash}`, created_at:new Date().toISOString(),
      });
      result.insertedRewards++;
    }
    db.prepare(`INSERT INTO app_meta(key, value) VALUES('last_legacy_import', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify({ at:new Date().toISOString(), ...result }));
  });
  transaction.immediate();
  return result;
}

export function legacyRecordSnapshot(db, natural) {
  return mapRecord(db.prepare('SELECT * FROM homework_records WHERE date = ? AND assign = ? AND cls = ? AND name = ?')
    .get(natural.date, natural.assign, natural.cls, natural.name));
}
