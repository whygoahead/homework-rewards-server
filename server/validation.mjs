import { CLASS_LIST } from './roster.mjs';
import { HttpError } from './errors.mjs';

const STATUSES = new Set(['pass', 'miss', 'redo', 'star']);

function bad(message) {
  throw new HttpError(400, 'INVALID_INPUT', message);
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) bad('日期格式应为 YYYY-MM-DD。');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) bad('日期无效。');
  return value;
}

export function validClass(cls) {
  if (!Object.hasOwn(CLASS_LIST, cls)) bad('班级无效。');
  return cls;
}

export function validStudent(cls, name) {
  validClass(cls);
  if (typeof name !== 'string' || !CLASS_LIST[cls].includes(name)) bad('学生不在班级名单中。');
  return name;
}

export function validAssignment(value) {
  const assign = (typeof value === 'string' ? value.trim() : '') || '(未命名作业)';
  if (assign.length > 200) bad('作业内容不能超过 200 个字符。');
  return assign;
}

export function validNote(value = '') {
  if (typeof value !== 'string') bad('备注格式无效。');
  const note = value.trim();
  if (note.length > 1000) bad('备注不能超过 1000 个字符。');
  return note;
}

export function validStatus(value) {
  if (!STATUSES.has(value)) bad('作业状态无效。');
  return value;
}

export function recordInput(body) {
  const cls = validClass(body?.cls);
  return {
    date: validDate(body?.date),
    assign: validAssignment(body?.assign),
    cls,
    name: validStudent(cls, body?.name),
    status: validStatus(body?.status),
    note: validNote(body?.note),
  };
}

export function sessionInput(body) {
  return {
    date: validDate(body?.date),
    assign: validAssignment(body?.assign),
    cls: validClass(body?.cls),
  };
}

export function drawInput(body) {
  const cls = validClass(body?.cls);
  const clientRequestId = body?.clientRequestId;
  if (typeof clientRequestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(clientRequestId)) {
    bad('抽卡请求标识无效。');
  }
  return { cls, name: validStudent(cls, body?.name), clientRequestId };
}

export function validId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) bad('记录标识无效。');
  return value;
}
