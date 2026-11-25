import { readFileSync } from 'node:fs';
import { createDatabase } from '../server/db.mjs';
import { importLegacy } from '../server/legacy.mjs';

const [recordsPath, rewardsPath] = process.argv.slice(2);
if (!recordsPath || !rewardsPath) {
  console.error('用法：npm run import-legacy -- records.json boxes.json');
  console.error('两个文件由 scripts/export-legacy.browser.js 从原浏览器导出。');
  process.exit(1);
}

const records = JSON.parse(readFileSync(recordsPath, 'utf8'));
const rewards = JSON.parse(readFileSync(rewardsPath, 'utf8'));
const db = createDatabase();
try {
  const result = importLegacy(db, records, rewards);
  console.log(`作业记录：新增 ${result.insertedRecords}，跳过 ${result.skippedRecords}`);
  console.log(`奖励记录：新增 ${result.insertedRewards}，跳过 ${result.skippedRewards}`);
} finally {
  db.close();
}
