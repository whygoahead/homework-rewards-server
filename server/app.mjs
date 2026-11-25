import express from 'express';
import cookieSession from 'cookie-session';
import { rateLimit } from 'express-rate-limit';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPassword } from './auth.mjs';
import { createApiRouter } from './routes.mjs';
import { HttpError } from './errors.mjs';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');

function requireApiAuth(req, res, next) {
  if (req.session?.teacher) return next();
  res.status(401).json({ error:{ code:'UNAUTHORIZED', message:'请先登录。' } });
}

export function createApp({ db, passwordHash, sessionSecret, secureCookies = false, trustProxy = false }) {
  if (!db) throw new Error('数据库未配置。');
  if (!passwordHash) throw new Error('TEACHER_PASSWORD_HASH 未配置。');
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET 至少需要 32 个字符。');

  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options':'nosniff',
      'X-Frame-Options':'DENY',
      'Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://media.doubao.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit:'64kb' }));
  app.use(cookieSession({
    name:'hw_session', keys:[sessionSecret], httpOnly:true, sameSite:'strict',
    secure:secureCookies, maxAge:8 * 60 * 60 * 1000,
  }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.get('origin')) return next();
    try {
      if (new URL(req.get('origin')).host !== req.get('host')) throw new Error();
      next();
    } catch {
      next(new HttpError(403, 'ORIGIN_REJECTED', '请求来源无效。'));
    }
  });

  const loginLimiter = rateLimit({
    windowMs:15 * 60 * 1000, limit:10, standardHeaders:'draft-8', legacyHeaders:false,
    handler:(req, res) => res.status(429).json({ error:{ code:'LOGIN_RATE_LIMITED', message:'登录尝试过多，请稍后再试。' } }),
  });
  app.post('/api/login', loginLimiter, (req, res) => {
    if (!verifyPassword(req.body?.password, passwordHash)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', '教师口令不正确。');
    }
    req.session.teacher = true;
    res.json({ ok:true });
  });
  app.post('/api/logout', (req, res) => {
    req.session = null;
    res.json({ ok:true });
  });
  app.get('/api/session', requireApiAuth, (req, res) => res.json({ authenticated:true }));
  app.use('/api', requireApiAuth, createApiRouter(db));
  app.use('/api', (req, res) => res.status(404).json({ error:{ code:'NOT_FOUND', message:'接口不存在。' } }));

  app.get('/healthz', (req, res) => res.json({ ok:true }));
  const publicPaths = new Set(['/login.html', '/login.mjs', '/styles.css', '/api.mjs']);
  app.use((req, res, next) => {
    if (publicPaths.has(req.path) || req.session?.teacher) return next();
    if (req.method === 'GET') return res.redirect('/login.html');
    res.status(401).json({ error:{ code:'UNAUTHORIZED', message:'请先登录。' } });
  });
  app.use(express.static(publicDir, { index:false, setHeaders:(res) => res.set('Cache-Control', 'no-store') }));
  app.get('/', (req, res) => res.sendFile(resolve(publicDir, 'index.html')));
  app.use((req, res) => res.status(404).send('Not Found'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
    const code = error.code || (status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR');
    const message = status >= 500 ? '服务端处理失败，请稍后重试。' : error.message;
    if (status >= 500) console.error(`请求处理失败：${req.method} ${req.path}`);
    res.status(status).json({ error:{ code, message } });
  });
  return app;
}
