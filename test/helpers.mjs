import supertest from 'supertest';
import { createApp } from '../server/app.mjs';
import { createDatabase, upsertRecord } from '../server/db.mjs';
import { hashPassword } from '../server/auth.mjs';
import { CLASS_LIST } from '../server/roster.mjs';

export const TEST_PASSWORD = 'test-teacher-password-2026';
const passwordHash = hashPassword(TEST_PASSWORD);

export function createTestContext() {
  const db = createDatabase(':memory:');
  const app = createApp({
    db, passwordHash, sessionSecret:'test-session-secret-with-at-least-32-characters', secureCookies:false,
  });
  return { db, app, agent:supertest.agent(app) };
}

export async function login(agent) {
  await agent.post('/api/login').send({ password:TEST_PASSWORD }).expect(200);
}

export function seedRecord(db, overrides = {}) {
  return upsertRecord(db, {
    date:'2026-01-05', assign:'单元练习', cls:'701', name:CLASS_LIST['701'][0],
    status:'pass', note:'', ...overrides,
  });
}

export function seedPoints(db, count, status = 'pass', overrides = {}) {
  for (let index = 0; index < count; index++) {
    seedRecord(db, { date:`2026-02-${String(index + 1).padStart(2, '0')}`, assign:`积分测试 ${index}`, status, ...overrides });
  }
}
