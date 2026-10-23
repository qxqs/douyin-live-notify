import initSqlJs, { Database as SqlJsDatabase, Statement as SqlJsStatement } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

// ============================================================
// SQL.js 包装 —— 提供类似 better-sqlite3 的同步 API
// ============================================================

let _db: SqlJsDatabase;

/**
 * 初始化数据库（异步加载 WASM）
 */
export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  // 尝试从磁盘加载已有数据库
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    _db = new SQL.Database(buffer);
    console.log('[DB] 已从磁盘加载数据库');
  } else {
    _db = new SQL.Database();
    console.log('[DB] 已创建新数据库');
  }

  // 建表
  _db.run(`PRAGMA foreign_keys = ON`);
  createTables();

  // 定时保存到磁盘
  setInterval(saveToDisk, 30_000);
}

function createTables() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS users (
      openid TEXT PRIMARY KEY,
      nickname TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      subscribe_time TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS bloggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      douyin_id TEXT NOT NULL,
      sec_uid TEXT DEFAULT '',           -- 用户唯一ID（从主页解析，比 room_id 更稳定）
      room_id TEXT DEFAULT '',
      nickname TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      live_status INTEGER DEFAULT 0,
      live_title TEXT DEFAULT '',
      last_checked_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  _db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bloggers_douyin_id ON bloggers(douyin_id)`);

  // 迁移：旧表可能没有 sec_uid 列
  try {
    _db.run(`ALTER TABLE bloggers ADD COLUMN sec_uid TEXT DEFAULT ''`);
  } catch {
    // 列已存在，忽略
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_openid TEXT NOT NULL,
      blogger_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_openid) REFERENCES users(openid),
      FOREIGN KEY (blogger_id) REFERENCES bloggers(id),
      UNIQUE(user_openid, blogger_id)
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_openid TEXT NOT NULL,
      blogger_id INTEGER NOT NULL,
      live_title TEXT DEFAULT '',
      sent_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_openid) REFERENCES users(openid),
      FOREIGN KEY (blogger_id) REFERENCES bloggers(id)
    )
  `);

  _db.run(`CREATE INDEX IF NOT EXISTS idx_notification_log_time ON notification_log(sent_at)`);
}

function saveToDisk() {
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.dbPath, buffer);
  } catch (err) {
    console.error('[DB] 保存数据库失败:', err);
  }
}

// ============================================================
// 包装方法 —— 模拟 better-sqlite3 API
// ============================================================

function bindParams(stmt: SqlJsStatement, params: any[]): boolean {
  if (params.length === 0) return true;
  // All project queries use positional placeholders, so bind in argument order.
  stmt.bind(params.map((value) => (value === undefined ? null : value)));
  return true;
}

function rowToObject(stmt: SqlJsStatement): Record<string, any> | undefined {
  const columns = stmt.getColumnNames();
  const values = stmt.get();
  if (!values || values.length === 0) return undefined;
  const obj: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = values[i];
  }
  return obj;
}

function rowsToArray(stmt: SqlJsStatement): Record<string, any>[] {
  const columns = stmt.getColumnNames();
  const results: Record<string, any>[] = [];
  while (stmt.step()) {
    const values = stmt.get();
    const obj: Record<string, any> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = values[i];
    }
    results.push(obj);
  }
  stmt.free();
  return results;
}

/**
 * 编译 SQL 并绑定参数
 */
function makeStmt(sql: string, params: any[] = []): { stmt: SqlJsStatement; columns: string[] } {
  const stmt = _db.prepare(sql);
  bindParams(stmt, params);
  return { stmt, columns: stmt.getColumnNames() };
}

// ============================================================
// 公开 API（模拟 better-sqlite3）
// ============================================================

interface StatementWrapper {
  run: (...params: any[]) => { changes: number; lastInsertRowid: number };
  get: (...params: any[]) => Record<string, any> | undefined;
  all: (...params: any[]) => Record<string, any>[];
}

function prepare(sql: string): StatementWrapper {
  return {
    run(...params: any[]) {
      const { stmt } = makeStmt(sql, params);
      stmt.step();
      const changes = _db.getRowsModified();
      // sql.js doesn't expose lastInsertRowid easily, approximate
      stmt.free();
      saveToDisk();
      return { changes, lastInsertRowid: 0 };
    },

    get(...params: any[]) {
      const { stmt } = makeStmt(sql, params);
      let result: Record<string, any> | undefined;
      if (stmt.step()) {
        result = rowToObject(stmt);
      }
      stmt.free();
      return result;
    },

    all(...params: any[]) {
      const { stmt } = makeStmt(sql, params);
      const results: Record<string, any>[] = [];
      while (stmt.step()) {
        const row = rowToObject(stmt);
        if (row) results.push(row);
      }
      stmt.free();
      return results;
    },
  };
}

function exec(sql: string) {
  _db.run(sql);
}

// 直接执行（INSERT/UPDATE/DELETE）
function run(sql: string, ...params: any[]) {
  const { stmt } = makeStmt(sql, params);
  stmt.step();
  stmt.free();
  saveToDisk();
}

// ============================================================
// 导出
// ============================================================

const db = {
  prepare,
  exec,
  run,
  pragma: (sql: string) => {
    _db.run(sql);
  },
};

export { saveToDisk };
export default db;
