import { randomInt, randomUUID } from 'node:crypto';
import { IMG, KIND_PROB, PRIVILEGES, RARITY_PROB, SERIES } from '../public/catalog.mjs';
import { mapReward, pointsBalance, rewardByRequestId } from './db.mjs';
import { HttpError } from './errors.mjs';

function randomUnit() {
  return randomInt(0, 1_000_000) / 1_000_000;
}

export function rollCard() {
  if (randomUnit() < KIND_PROB.priv) {
    const index = randomInt(0, PRIVILEGES.length);
    const privilege = PRIVILEGES[index];
    return { kind:'priv', theme:'priv', img:privilege.img, series:'体验特权', card:privilege.n, rar:privilege.r, no:`P${String(index + 1).padStart(2, '0')}` };
  }

  const seriesIndex = randomInt(0, SERIES.length);
  const series = SERIES[seriesIndex];
  const roll = randomUnit();
  let rarity = 'R';
  if (roll >= 1 - RARITY_PROB.UR) rarity = 'UR';
  else if (roll >= 1 - RARITY_PROB.UR - RARITY_PROB.SSR) rarity = 'SSR';
  else if (roll >= 1 - RARITY_PROB.UR - RARITY_PROB.SSR - RARITY_PROB.SR) rarity = 'SR';
  const pool = series.cards.filter(card => card.r === rarity);
  const card = pool[randomInt(0, pool.length)];
  const cardIndex = series.cards.indexOf(card);
  return {
    kind:'card', theme:series.theme, img:IMG[`${series.key}_${cardIndex + 1}`],
    series:series.name, card:card.n, rar:card.r,
    no:String(seriesIndex * 7 + cardIndex + 1).padStart(3, '0'),
  };
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function drawReward(db, input) {
  const transaction = db.transaction(() => {
    const existing = rewardByRequestId(db, input.clientRequestId);
    if (existing) {
      if (existing.cls !== input.cls || existing.name !== input.name) {
        throw new HttpError(409, 'REQUEST_ID_CONFLICT', '该抽卡请求标识已用于其他学生。');
      }
      return { reward:mapReward(existing), balance:pointsBalance(db, input.cls, input.name), idempotent:true };
    }

    const balance = pointsBalance(db, input.cls, input.name);
    if (balance.left < 10) {
      throw new HttpError(409, 'INSUFFICIENT_POINTS', '积分未满 10 分，暂不能抽卡。');
    }

    const card = rollCard();
    const row = {
      id:randomUUID(), date:shanghaiDate(), cls:input.cls, name:input.name,
      ...card, client_request_id:input.clientRequestId, created_at:new Date().toISOString(),
    };
    db.prepare(`
      INSERT INTO reward_draws(id, date, cls, name, kind, series, card, rar, img, no, client_request_id, created_at)
      VALUES (@id, @date, @cls, @name, @kind, @series, @card, @rar, @img, @no, @client_request_id, @created_at)
    `).run(row);
    return { reward:mapReward(row), balance:pointsBalance(db, input.cls, input.name), idempotent:false };
  });
  return transaction.immediate();
}
