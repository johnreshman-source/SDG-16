const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdg16-tests-'));
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'isolated-test-session-secret';
process.env.DB_PATH = path.join(testDirectory, 'reports.sqlite');

const { createApp } = require('../src/app');
const { db, run, get, all, initializeDatabase } = require('../src/config/db');

const app = createApp();
const reportDescription = 'A local streetlight near the bus stand remains broken and the area feels unsafe after sunset. Residents have reported repeated concerns and the issue has not been resolved.';

async function getToken(agent) {
  const response = await agent.get('/api/csrf-token');
  assert.equal(response.status, 200);
  return response.body.csrfToken;
}

async function submitReport(agent, input) {
  const csrfToken = await getToken(agent);
  return agent
    .post('/api/reports')
    .set('X-CSRF-Token', csrfToken)
    .send(input);
}

async function loginAsAdmin(agent, username = 'admin', password = 'Admin@12345') {
  const csrfToken = await getToken(agent);
  return agent
    .post('/api/admin/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ username, password });
}

async function registerUser(agent, username, password = 'StrongAccountPassword123') {
  const csrfToken = await getToken(agent);
  return agent
    .post('/api/users/register')
    .set('X-CSRF-Token', csrfToken)
    .send({ username, password });
}

async function loginAsUser(agent, username, password = 'StrongAccountPassword123') {
  const csrfToken = await getToken(agent);
  return agent
    .post('/api/users/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ username, password });
}

test.before(async () => {
  await initializeDatabase();
  const passwordHash = await bcrypt.hash('Admin@12345', 12);
  await run('INSERT INTO administrators (username, password_hash) VALUES (?, ?);', ['admin', passwordHash]);
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('health and public modules are available without an account', async () => {
  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');

  for (const page of ['/', '/awareness.html', '/rights-awareness.html', '/report.html', '/resources.html']) {
    const response = await request(app).get(page);
    assert.equal(response.status, 200, `${page} should be public`);
    assert.doesNotMatch(response.text, /user registration|sign up for an account/i);
  }
  assert.equal((await request(app).get('/user-register.html')).status, 200);
  assert.equal((await request(app).get('/user-login.html')).status, 200);
  assert.equal((await request(app).get('/api/users/reports')).status, 401);
  const accountPage = await request(app).get('/account.html');
  assert.equal(accountPage.status, 302);
  assert.equal(accountPage.headers.location, '/user-login.html');
});

test('users can register and sign in with a username and bcrypt-hashed password', async () => {
  const agent = request.agent(app);
  const registration = await registerUser(agent, 'Community.User');
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.username, 'Community.User');

  const storedUser = await get('SELECT username, password_hash FROM users WHERE username = ?;', ['Community.User']);
  assert.equal(storedUser.username, 'Community.User');
  assert.notEqual(storedUser.password_hash, 'StrongAccountPassword123');
  assert.equal(await bcrypt.compare('StrongAccountPassword123', storedUser.password_hash), true);

  const duplicate = await registerUser(agent, 'community.user');
  assert.equal(duplicate.status, 409);

  const invalidUsername = await registerUser(agent, 'bad username');
  assert.equal(invalidUsername.status, 400);

  const invalidPassword = await registerUser(agent, 'weakpass', 'short');
  assert.equal(invalidPassword.status, 400);

  const badLogin = await loginAsUser(agent, 'Community.User', 'incorrect-password');
  assert.equal(badLogin.status, 401);
  assert.equal((await agent.get('/api/users/me')).status, 401);

  const login = await loginAsUser(agent, 'community.user');
  assert.equal(login.status, 200);
  assert.equal(login.body.user.username, 'Community.User');
  assert.equal((await agent.get('/api/users/me')).status, 200);
  assert.equal((await agent.get('/account')).status, 200);
});

test('only non-anonymous reports submitted while signed in appear in that account dashboard', async () => {
  const owner = request.agent(app);
  assert.equal((await registerUser(owner, 'report.owner')).status, 201);
  assert.equal((await loginAsUser(owner, 'report.owner')).status, 200);

  const linkedReport = await submitReport(owner, {
    category: 'Access to Justice',
    description: 'A resident cannot find clear information about the appeal process for a delayed local service application.',
    anonymous: false,
  });
  assert.equal(linkedReport.status, 201);

  const anonymousReport = await submitReport(owner, {
    category: 'Public Safety',
    description: 'A pathway near the neighbourhood library has poor lighting and visitors report difficulty using it after sunset.',
    anonymous: true,
  });
  assert.equal(anonymousReport.status, 201);

  const ownerReports = await owner.get('/api/users/reports');
  assert.equal(ownerReports.status, 200);
  assert.equal(ownerReports.headers['cache-control'], 'private, no-store');
  assert.equal(ownerReports.body.reports.length, 1);
  assert.equal(ownerReports.body.reports[0].report_ref, linkedReport.body.reportRef);
  assert.equal((await owner.get('/api/admin/stats')).status, 401);

  const other = request.agent(app);
  assert.equal((await registerUser(other, 'other.owner')).status, 201);
  assert.equal((await loginAsUser(other, 'other.owner')).status, 200);
  const otherReports = await other.get('/api/users/reports');
  assert.equal(otherReports.status, 200);
  assert.equal(otherReports.body.reports.length, 0);

  const accountScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'user-account.js'), 'utf8');
  assert.match(accountScript, /textContent\s*=\s*report\.description/);

  const csrfToken = await getToken(owner);
  const logout = await owner.post('/api/users/logout').set('X-CSRF-Token', csrfToken).send({});
  assert.equal(logout.status, 200);
  assert.equal((await owner.get('/api/users/me')).status, 401);
});

test('administrator page and APIs reject unauthenticated access', async () => {
  const page = await request(app).get('/admin.html');
  assert.equal(page.status, 302);
  assert.equal(page.headers.location, '/admin-login.html');

  const dashboardPage = await request(app).get('/admin/dashboard');
  assert.equal(dashboardPage.status, 302);
  assert.equal(dashboardPage.headers.location, '/admin-login.html');
  assert.equal(dashboardPage.headers['cache-control'], 'private, no-store');

  const stats = await request(app).get('/api/admin/stats');
  const reports = await request(app).get('/api/admin/reports');
  assert.equal(stats.status, 401);
  assert.equal(reports.status, 401);
  assert.equal(stats.headers['cache-control'], 'private, no-store');
  assert.equal(reports.headers['cache-control'], 'private, no-store');
});

test('CSRF protection rejects a state-changing request without a token', async () => {
  const response = await request(app)
    .post('/api/reports')
    .send({ category: 'Other', description: reportDescription });

  assert.equal(response.status, 403);
});

test('JSON request-size limit rejects oversized bodies', async () => {
  const response = await request(app)
    .post('/api/reports')
    .send({
      category: 'Other',
      description: 'x'.repeat(1024 * 1024 + 1),
    });

  assert.equal(response.status, 413);
});

test('a valid anonymous report is persisted and receives an unpredictable reference', async () => {
  const agent = request.agent(app);
  const response = await submitReport(agent, {
    category: 'Public Safety',
    description: reportDescription,
  });

  assert.equal(response.status, 201);
  assert.match(response.body.reportRef, /^SDG16-[A-F0-9]{32}$/);

  const report = await get(
    'SELECT report_ref, category, description, anonymous, status FROM reports WHERE report_ref = ?;',
    [response.body.reportRef]
  );
  assert.equal(report.category, 'Public Safety');
  assert.equal(report.description, reportDescription);
  assert.equal(report.anonymous, 1);
  assert.equal(report.status, 'New');
  assert.equal(report.report_ref, response.body.reportRef);

  const publicLookup = await request(app).get(`/api/reports/${response.body.reportRef}`);
  assert.equal(publicLookup.status, 404);
  assert.doesNotMatch(JSON.stringify(publicLookup.body), /streetlight|bus stand/i);
});

test('saved report data survives an independent process reopening the SQLite file', async () => {
  const report = await get(
    'SELECT report_ref FROM reports WHERE category = ? AND description = ? LIMIT 1;',
    ['Public Safety', reportDescription]
  );
  const result = execFileSync(
    process.execPath,
    [
      '-e',
      `const sqlite3 = require('sqlite3'); const db = new sqlite3.Database(process.env.SDG16_TEST_DB); db.get('SELECT report_ref FROM reports WHERE report_ref = ?', [process.env.SDG16_TEST_REF], (error, row) => { if (error) { console.error(error.message); process.exitCode = 1; } else { console.log(row ? row.report_ref : ''); } db.close(); });`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        SDG16_TEST_DB: process.env.DB_PATH,
        SDG16_TEST_REF: report.report_ref,
      },
    }
  );

  assert.equal(result.trim(), report.report_ref);
});

test('similar repeated reports and malformed input are rejected', async () => {
  const agent = request.agent(app);
  const duplicate = await submitReport(agent, {
    category: 'Public Safety',
    description: reportDescription,
  });
  assert.equal(duplicate.status, 409);

  const shortDescription = await submitReport(agent, {
    category: 'Other',
    description: 'Too short.',
  });
  assert.equal(shortDescription.status, 400);

  const invalidCategory = await submitReport(agent, {
    category: 'Not a valid category',
    description: reportDescription,
  });
  assert.equal(invalidCategory.status, 400);

  const invalidAnonymous = await submitReport(agent, {
    category: 'Other',
    description: reportDescription,
    anonymous: 'false',
  });
  assert.equal(invalidAnonymous.status, 400);

  const tooLong = await submitReport(agent, {
    category: 'Other',
    description: 'x'.repeat(5001),
  });
  assert.equal(tooLong.status, 400);
});

test('report references are unique across different submissions', async () => {
  const agent = request.agent(app);
  const first = await submitReport(agent, {
    category: 'Discrimination',
    description: 'A local community activity excluded residents using an unclear selection rule. The organisers have not explained how decisions were made.',
  });
  const second = await submitReport(agent, {
    category: 'Access to Justice',
    description: 'Residents cannot find accessible information about the grievance process for a local service and need clear contact guidance.',
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.body.reportRef, second.body.reportRef);
});

test('failed admin credentials do not create a session', async () => {
  const agent = request.agent(app);
  const response = await loginAsAdmin(agent, 'admin', 'incorrect-password');
  assert.equal(response.status, 401);

  const me = await agent.get('/api/admin/me');
  assert.equal(me.status, 401);
});

test('admin login rotates the pre-authentication session ID', async () => {
  const agent = request.agent(app);
  const csrfTokenResponse = await agent.get('/api/csrf-token');
  const initialCookie = csrfTokenResponse.headers['set-cookie']
    .find((cookie) => cookie.startsWith('connect.sid='))
    .split(';')[0];

  const login = await agent
    .post('/api/admin/login')
    .set('X-CSRF-Token', csrfTokenResponse.body.csrfToken)
    .send({ username: 'admin', password: 'Admin@12345' });

  assert.equal(login.status, 200);
  const authenticatedCookie = login.headers['set-cookie']
    .find((cookie) => cookie.startsWith('connect.sid='))
    .split(';')[0];
  assert.notEqual(authenticatedCookie, initialCookie);
});

test('admin login, statistics, report filters, pagination, and status updates work', async () => {
  const agent = request.agent(app);
  const login = await loginAsAdmin(agent);
  assert.equal(login.status, 200);

  const me = await agent.get('/api/admin/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'admin');

  const stats = await agent.get('/api/admin/stats');
  assert.equal(stats.status, 200);
  assert.equal(stats.headers['cache-control'], 'private, no-store');
  assert.ok(stats.body.stats.totalReports >= 3);
  assert.ok(Array.isArray(stats.body.stats.categoryCounts));

  const filtered = await agent.get('/api/admin/reports?category=Public%20Safety&status=New');
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.reports.every((report) => report.category === 'Public Safety' && report.status === 'New'));

  const pageOne = await agent.get('/api/admin/reports?page=1&limit=1');
  const pageTwo = await agent.get('/api/admin/reports?page=2&limit=1');
  assert.equal(pageOne.status, 200);
  assert.equal(pageOne.headers['cache-control'], 'private, no-store');
  assert.equal(pageTwo.status, 200);
  assert.notEqual(pageOne.body.reports[0].id, pageTwo.body.reports[0].id);

  const allReports = await all('SELECT id FROM reports ORDER BY created_at DESC, id DESC;');
  const oldestFirst = await agent.get('/api/admin/reports?sort=oldest&limit=50');
  const newestFirst = await agent.get('/api/admin/reports?sort=newest&limit=50');
  assert.deepEqual(oldestFirst.body.reports.map((item) => item.id), [...allReports].reverse().map((item) => item.id));
  assert.deepEqual(newestFirst.body.reports.map((item) => item.id), allReports.map((item) => item.id));

  const invalidPage = await agent.get('/api/admin/reports?page=-1');
  const invalidLimit = await agent.get('/api/admin/reports?limit=0');
  const invalidCategory = await agent.get('/api/admin/reports?category=%27%20OR%201%3D1--');
  const invalidSort = await agent.get('/api/admin/reports?sort=description');
  assert.equal(invalidPage.status, 400);
  assert.equal(invalidLimit.status, 400);
  assert.equal(invalidCategory.status, 400);
  assert.equal(invalidSort.status, 400);

  const report = await get(
    'SELECT id FROM reports WHERE category = ? ORDER BY created_at DESC, id DESC LIMIT 1;',
    ['Public Safety']
  );
  const details = await agent.get(`/api/admin/reports/${report.id}`);
  assert.equal(details.status, 200);
  assert.equal(details.headers['cache-control'], 'private, no-store');
  assert.ok(details.body.report.updated_at);
  const csrfToken = await getToken(agent);
  const updated = await agent
    .patch(`/api/admin/reports/${report.id}/status`)
    .set('X-CSRF-Token', csrfToken)
    .send({ status: 'Under Review' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.report.status, 'Under Review');
  assert.ok(updated.body.report.updated_at);
  assert.equal((await get('SELECT status FROM reports WHERE id = ?;', [report.id])).status, 'Under Review');

  const dashboardPage = await agent.get('/admin/dashboard');
  assert.equal(dashboardPage.status, 200);
  assert.equal(dashboardPage.headers['cache-control'], 'private, no-store');
  assert.match(dashboardPage.text, /Description/);
  assert.match(dashboardPage.text, /Last updated/);

  const missingToken = await getToken(agent);
  const missing = await agent
    .patch('/api/admin/reports/999999/status')
    .set('X-CSRF-Token', missingToken)
    .send({ status: 'Resolved' });
  assert.equal(missing.status, 404);

  const invalidStatusToken = await getToken(agent);
  const invalidStatus = await agent
    .patch(`/api/admin/reports/${report.id}/status`)
    .set('X-CSRF-Token', invalidStatusToken)
    .send({ status: 'Closed' });
  assert.equal(invalidStatus.status, 400);

  await run('UPDATE reports SET last_updated_by = NULL WHERE last_updated_by = (SELECT id FROM administrators WHERE username = ?);', ['admin']);
  await run('DELETE FROM administrators WHERE username = ?;', ['admin']);
  assert.equal((await agent.get('/api/admin/stats')).status, 401);
  const loginHash = await bcrypt.hash('Admin@12345', 12);
  await run('INSERT INTO administrators (username, password_hash) VALUES (?, ?);', ['admin', loginHash]);
});

test('stored report text is returned as data and dashboard rendering uses safe DOM text APIs', async () => {
  const xssDescription = '<img src=x onerror=alert(1)> This report text is intentionally longer than twenty characters.';
  const reporter = request.agent(app);
  const submitted = await submitReport(reporter, {
    category: 'Other',
    description: xssDescription,
  });
  assert.equal(submitted.status, 201);

  const admin = request.agent(app);
  assert.equal((await loginAsAdmin(admin)).status, 200);
  const list = await admin.get('/api/admin/reports?search=SDG16-');
  assert.equal(list.status, 200);
  assert.ok(list.body.reports.some((report) => report.description === xssDescription));

  const adminScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
  const adminPage = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
  assert.doesNotMatch(adminScript, /row\.innerHTML\s*=/);
  assert.match(adminScript, /textContent\s*=\s*report\.category/);
  assert.match(adminScript, /textContent\s*=\s*report\.description/);
  assert.match(adminScript, /reportDialog\.showModal\(\)/);
  assert.match(adminPage, /<dialog id="report-dialog"/);
});

test('SQL-like report text remains data and does not alter the database', async () => {
  const payload = "'; DROP TABLE reports;-- This text is long enough to pass the report description rules.";
  const reporter = request.agent(app);
  const submission = await submitReport(reporter, {
    category: 'Other',
    description: payload,
  });

  assert.equal(submission.status, 201);
  const stored = await get('SELECT description FROM reports WHERE report_ref = ?;', [submission.body.reportRef]);
  assert.equal(stored.description, payload);
  const count = await get('SELECT COUNT(*) AS count FROM reports;');
  assert.ok(count.count >= 1);
});

test('logout invalidates the authenticated session', async () => {
  const agent = request.agent(app);
  assert.equal((await loginAsAdmin(agent)).status, 200);

  const csrfToken = await getToken(agent);
  const logout = await agent
    .post('/api/admin/logout')
    .set('X-CSRF-Token', csrfToken)
    .send({});
  assert.equal(logout.status, 200);

  const me = await agent.get('/api/admin/me');
  assert.equal(me.status, 401);
});

test('administrator login rate limiting rejects excessive attempts', async () => {
  const agent = request.agent(app);
  const csrfToken = await getToken(agent);
  let limited = false;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await agent
      .post('/api/admin/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'missing-admin', password: 'not-a-valid-password' });
    if (response.status === 429) {
      limited = true;
      break;
    }
  }

  assert.equal(limited, true);
});

test('report rate limiting eventually rejects repeated submissions', async () => {
  const agent = request.agent(app);
  let limited = false;

  for (let index = 0; index < 30; index += 1) {
    const response = await submitReport(agent, {
      category: 'Other',
      description: `A distinct report description to exercise request limiting number ${index} and safely test repeated requests.`,
    });
    if (response.status === 429) {
      limited = true;
      break;
    }
  }

  assert.equal(limited, true);
});
