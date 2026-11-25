import { Router } from 'express';
import { CLASS_LIST } from './roster.mjs';
import {
  completeRecord, deleteRecord, finalizeRegistration, getRecord,
  listRecords, listRewards, upsertRecord,
} from './db.mjs';
import { drawReward } from './rewards.mjs';
import { drawInput, recordInput, sessionInput, validId } from './validation.mjs';
import { HttpError } from './errors.mjs';

export function createApiRouter(db) {
  const router = Router();

  router.get('/bootstrap', (req, res) => {
    res.json({ classList:CLASS_LIST, records:listRecords(db), rewards:listRewards(db) });
  });

  router.put('/records', (req, res) => {
    res.json({ record:upsertRecord(db, recordInput(req.body)) });
  });

  router.post('/registrations/finalize', (req, res) => {
    res.json({ records:finalizeRegistration(db, sessionInput(req.body)) });
  });

  router.patch('/records/:id', (req, res) => {
    const id = validId(req.params.id);
    if (req.body?.status !== 'pass') throw new HttpError(400, 'INVALID_INPUT', '完成操作只能将状态改为合格。');
    const record = completeRecord(db, id);
    if (!record) throw new HttpError(404, 'NOT_FOUND', '作业记录不存在。');
    res.json({ record });
  });

  router.delete('/records/:id', (req, res) => {
    const id = validId(req.params.id);
    if (!getRecord(db, id)) throw new HttpError(404, 'NOT_FOUND', '作业记录不存在。');
    deleteRecord(db, id);
    res.json({ ok:true });
  });

  router.post('/draws', (req, res) => {
    res.json(drawReward(db, drawInput(req.body)));
  });

  return router;
}
