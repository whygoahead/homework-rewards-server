import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/db.mjs';
import { importLegacy } from '../server/legacy.mjs';
import { CLASS_LIST } from '../server/roster.mjs';
import { IMG } from '../public/catalog.mjs';

const student = CLASS_LIST['701'][0];
const legacyRecord = {
  id:1760000000000.123, date:'2026-01-01', assign:'旧作业', cls:'701', name:student,
  miss:false, redo:false, star:true, note:'旧备注',
};
const legacyReward = {
  id:1760000000001.456, date:'2026-01-02', cls:'701', name:student, kind:'card',
  series:'光之英雄', card:'烈焰勇者', rar:'R', img:IMG.hero_1, no:'001',
};

test('旧数据导入可重复执行且不会重复增加记录', t => {
  const db = createDatabase(':memory:');
  t.after(() => db.close());
  const first = importLegacy(db, [legacyRecord, legacyRecord], [legacyReward, legacyReward]);
  assert.deepEqual(first, { insertedRecords:1, skippedRecords:0, insertedRewards:1, skippedRewards:0 });
  const second = importLegacy(db, [legacyRecord], [legacyReward]);
  assert.deepEqual(second, { insertedRecords:0, skippedRecords:1, insertedRewards:0, skippedRewards:1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM homework_records').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reward_draws').get().count, 1);
});

test('同一作业自然键的状态冲突会中止整个迁移', t => {
  const db = createDatabase(':memory:');
  t.after(() => db.close());
  assert.throws(() => importLegacy(db, [legacyRecord, { ...legacyRecord, star:false, miss:true }], [legacyReward]), /状态/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM homework_records').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reward_draws').get().count, 0);
});
