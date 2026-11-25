import { createApp } from './app.mjs';
import { createDatabase } from './db.mjs';

const required = ['TEACHER_PASSWORD_HASH', 'SESSION_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`缺少环境变量：${key}`);
    process.exit(1);
  }
}

const db = createDatabase();
const app = createApp({
  db,
  passwordHash:process.env.TEACHER_PASSWORD_HASH,
  sessionSecret:process.env.SESSION_SECRET,
  secureCookies:process.env.NODE_ENV === 'production',
  trustProxy:process.env.TRUST_PROXY === '1',
});
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`作业登记服务已启动：http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
