const session = require('express-session');
const { get, run } = require('./db');

class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    get('SELECT data, expires_at FROM sessions WHERE sid = ?;', [sid])
      .then((row) => {
        if (!row || row.expires_at <= Date.now()) {
          callback(null, null);
          return;
        }

        callback(null, JSON.parse(row.data));
      })
      .catch(callback);
  }

  set(sid, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie?.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + (sessionData.cookie?.maxAge || 0);

    run(
      `INSERT INTO sessions (sid, data, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at;`,
      [sid, JSON.stringify(sessionData), expiresAt]
    )
      .then(() => run('DELETE FROM sessions WHERE expires_at <= ?;', [Date.now()]))
      .then(() => callback())
      .catch(callback);
  }

  touch(sid, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie?.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + (sessionData.cookie?.maxAge || 0);

    run('UPDATE sessions SET expires_at = ? WHERE sid = ?;', [expiresAt, sid])
      .then(() => callback())
      .catch(callback);
  }

  destroy(sid, callback = () => {}) {
    run('DELETE FROM sessions WHERE sid = ?;', [sid])
      .then(() => callback())
      .catch(callback);
  }
}

module.exports = SQLiteSessionStore;
