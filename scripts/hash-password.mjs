import { hashPassword } from '../server/auth.mjs';

const password = process.env.TEACHER_PASSWORD;
if (!password || password.length < 12) {
  console.error('请通过 TEACHER_PASSWORD 提供至少 12 个字符的教师口令。');
  process.exit(1);
}
console.log(hashPassword(password));
