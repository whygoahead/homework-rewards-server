import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, login, seedPoints, seedRecord } from './helpers.mjs';
import { CLASS_LIST } from '../server/roster.mjs';
import { pointsBalance } from '../server/db.mjs';

const student = CLASS_LIST['701'][0];

test('未认证不能读取名单或数据，登录后才可以访问', async t => {
  const { db, agent } = createTestContext();
  t.after(() => db.close());
  await agent.get('/api/bootstrap').expect(401);
  await agent.get('/').expect(302).expect('location', '/login.html');
  await agent.post('/api/login').send({ password:'wrong-password' }).expect(401);
  await login(agent);
  const response = await agent.get('/api/bootstrap').expect(200);
  assert.deepEqual(Object.keys(response.body.classList), ['701', '702']);
  assert.equal(response.body.records.length, 0);
  await agent.post('/api/logout').expect(200);
  await agent.get('/api/bootstrap').expect(401);
});

test('作业点选、备注、整场保存、完成和删除均正确落库', async t => {
  const { db, agent } = createTestContext();
  t.after(() => db.close());
  await login(agent);
  const input = { date:'2026-03-01', assign:'第一课', cls:'701', name:student, status:'star', note:'课堂表现好' };
  const saved = await agent.put('/api/records').send(input).expect(200);
  assert.equal(saved.body.record.status, 'star');
  assert.equal(saved.body.record.star, true);
  const updated = await agent.put('/api/records').send({ ...input, note:'已面谈' }).expect(200);
  assert.equal(updated.body.record.id, saved.body.record.id);
  assert.equal(updated.body.record.note, '已面谈');

  const session = { date:input.date, assign:input.assign, cls:input.cls };
  await agent.post('/api/registrations/finalize').send(session).expect(200);
  await agent.post('/api/registrations/finalize').send(session).expect(200);
  let bootstrap = await agent.get('/api/bootstrap').expect(200);
  const sessionRecords = bootstrap.body.records.filter(record => record.date === input.date && record.assign === input.assign && record.cls === input.cls);
  assert.equal(sessionRecords.length, CLASS_LIST['701'].length);
  assert.equal(sessionRecords.find(record => record.name === student).note, '已面谈');

  await agent.patch(`/api/records/${saved.body.record.id}`).send({ status:'pass' }).expect(200);
  assert.equal(pointsBalance(db, '701', student).earned, 1);
  await agent.delete(`/api/records/${saved.body.record.id}`).expect(200);
  await agent.delete(`/api/records/${saved.body.record.id}`).expect(404);
  assert.equal(pointsBalance(db, '701', student).earned, 0);

  await agent.put('/api/records').send({ ...input, name:'不存在的学生' }).expect(400);
  await agent.put('/api/records').send({ ...input, status:'unknown' }).expect(400);
  await agent.post('/api/registrations/finalize').set('Origin', 'https://evil.example').send(session).expect(403);
});

test('抽卡服务端验分，重复请求返回同一奖励且不会重复扣积分', async t => {
  const { db, agent } = createTestContext();
  t.after(() => db.close());
  seedPoints(db, 4, 'star');
  assert.equal(pointsBalance(db, '701', student).left, 12);
  await login(agent);
  const first = await agent.post('/api/draws').send({ cls:'701', name:student, clientRequestId:'draw-request-0001' }).expect(200);
  assert.equal(first.body.balance.left, 2);
  assert.equal(first.body.idempotent, false);
  const repeated = await agent.post('/api/draws').send({ cls:'701', name:student, clientRequestId:'draw-request-0001' }).expect(200);
  assert.equal(repeated.body.reward.id, first.body.reward.id);
  assert.equal(repeated.body.idempotent, true);
  await agent.post('/api/draws').send({ cls:'701', name:student, clientRequestId:'draw-request-0002' }).expect(409);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reward_draws').get().count, 1);
  assert.equal(pointsBalance(db, '701', student).left, 2);
});

test('恰好 10 分可以抽卡，两个不同并发请求不会透支', async t => {
  const { db, agent } = createTestContext();
  t.after(() => db.close());
  seedPoints(db, 10);
  await login(agent);
  const responses = await Promise.all([
    agent.post('/api/draws').send({ cls:'701', name:student, clientRequestId:'concurrent-draw-a' }),
    agent.post('/api/draws').send({ cls:'701', name:student, clientRequestId:'concurrent-draw-b' }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reward_draws').get().count, 1);
  assert.equal(pointsBalance(db, '701', student).left, 0);
});

test('完成和删除操作会按现有规则重新计算积分', async t => {
  const { db } = createTestContext();
  t.after(() => db.close());
  const missing = seedRecord(db, { status:'miss' });
  seedRecord(db, { date:'2026-01-06', status:'star' });
  assert.equal(pointsBalance(db, '701', student).earned, 3);
  const { completeRecord, deleteRecord } = await import('../server/db.mjs');
  completeRecord(db, missing.id);
  assert.equal(pointsBalance(db, '701', student).earned, 4);
  deleteRecord(db, missing.id);
  assert.equal(pointsBalance(db, '701', student).earned, 3);
});
