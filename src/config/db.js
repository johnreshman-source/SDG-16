const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('./env');

const directory = path.dirname(dbPath);
if (!fs.existsSync(directory)) {
  fs.mkdirSync(directory, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onComplete(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

async function initializeDatabase() {
  await run('PRAGMA foreign_keys = ON;');

  await run(`
    CREATE TABLE IF NOT EXISTS administrators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_ref TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN (
        'Public Safety',
        'Corruption Concern',
        'Discrimination',
        'Access to Justice',
        'Human Rights Concern',
        'Other'
      )),
      description TEXT NOT NULL,
      anonymous INTEGER NOT NULL DEFAULT 1 CHECK (anonymous IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Under Review', 'Resolved')),
      duplicate_key_hash TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_updated_by INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (last_updated_by) REFERENCES administrators(id)
    );
  `);

  const reportColumns = await all('PRAGMA table_info(reports);');
  if (!reportColumns.some((column) => column.name === 'user_id')) {
    await run('ALTER TABLE reports ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;');
  }

  await run(`
    CREATE INDEX IF NOT EXISTS idx_reports_category_status
      ON reports (category, status, created_at DESC);
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_reports_user_id
      ON reports (user_id, created_at DESC);
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_reports_duplicate_key_hash
      ON reports (duplicate_key_hash, created_at DESC);
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
      ON sessions (expires_at);
  `);
}

module.exports = {
  db,
  run,
  get,
  all,
  initializeDatabase,
};
