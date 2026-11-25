import { readFileSync } from 'node:fs';

const DEFAULT_CLASS_LIST = {
  '701':['示例学生01', '示例学生02'],
  '702':['示例学生01', '示例学生02'],
};

function loadRoster() {
  try {
    const source = process.env.CLASS_LIST_JSON ?? readFileSync(
      process.env.ROSTER_PATH || new URL('../data/roster.json', import.meta.url), 'utf8',
    );
    const roster = JSON.parse(source);
    if (!roster || Array.isArray(roster) || typeof roster !== 'object' || !Object.keys(roster).length) {
      throw new Error('名单必须是非空对象。');
    }
    for (const names of Object.values(roster)) {
      if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string' || !name.trim()) || new Set(names).size !== names.length) {
        throw new Error('每班名单必须是非空、无重复的姓名数组。');
      }
    }
    return roster;
  } catch (error) {
    if (error.code === 'ENOENT' && !process.env.CLASS_LIST_JSON) return DEFAULT_CLASS_LIST;
    throw new Error(`班级名单配置无效：${error.message}`, { cause:error });
  }
}

export const CLASS_LIST = loadRoster();
