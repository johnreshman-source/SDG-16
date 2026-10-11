const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const { get, run, all } = require('../config/db');
const { normalizeDescription, isValidCategory, generateReportRef, getDuplicateKeyHash } = require('../utils/validation');
const { requireAuth, requireUser } = require('../middleware/auth');
const { getCsrfToken } = require('../middleware/csrfProtection');
const { isProduction } = require('../config/env');

const router = express.Router();

const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please wait a moment before trying again.',
  },
});

const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Please wait before submitting another report.',
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many admin login attempts. Please try again later.',
  },
});

const userRegistrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many account creation attempts. Please try again later.',
  },
});

const userLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sign-in attempts. Please try again later.',
  },
});

router.use(generalApiLimiter);

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    app: 'SDG 16 Awareness and Issue Reporting System',
    timestamp: new Date().toISOString(),
  });
});

router.get('/csrf-token', (req, res) => {
  res.json({
    success: true,
    csrfToken: getCsrfToken(req),
  });
});

router.post('/reports', reportLimiter, async (req, res, next) => {
  try {
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
    const description = typeof req.body?.description === 'string'
      ? normalizeDescription(req.body.description)
      : '';

    if (req.body?.anonymous !== undefined && typeof req.body.anonymous !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Anonymous preference must be true or false.',
      });
    }

    const anonymous = req.body?.anonymous === undefined ? true : req.body.anonymous;

    if (!isValidCategory(category)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid report category.',
      });
    }

    if (description.length < 20 || description.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Description must be between 20 and 5,000 characters.',
      });
    }

    const duplicateKeyHash = getDuplicateKeyHash(category, description);
    const existingRecord = await get(
      `SELECT id FROM reports WHERE duplicate_key_hash = ? AND created_at >= datetime('now', '-30 days') LIMIT 1;`,
      [duplicateKeyHash]
    );

    if (existingRecord) {
      return res.status(409).json({
        success: false,
        message: 'A similar report was already submitted recently. Please submit a new issue only if it is materially different.',
      });
    }

    let reportRef;
    let insertResult;
    const linkedUserId = anonymous ? null : (req.session?.account?.id || null);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      reportRef = generateReportRef();
      try {
        insertResult = await run(
          `INSERT INTO reports (report_ref, category, description, anonymous, status, duplicate_key_hash, user_id, updated_at)
           VALUES (?, ?, ?, ?, 'New', ?, ?, CURRENT_TIMESTAMP);`,
          [reportRef, category, description, anonymous ? 1 : 0, duplicateKeyHash, linkedUserId]
        );
        break;
      } catch (error) {
        if (error.code !== 'SQLITE_CONSTRAINT' || attempt === 2) {
          throw error;
        }
      }
    }

    if (!insertResult || !insertResult.id) {
      return res.status(500).json({
        success: false,
        message: 'The report could not be stored. Please try again later.',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Report submitted successfully.',
      reportRef,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/users/register', userRegistrationLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username must be 3–32 characters using letters, numbers, dot, underscore, or hyphen.',
      });
    }

    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'Password must be between 12 and 128 characters.',
      });
    }

    const existingUser = await get('SELECT id FROM users WHERE username = ? COLLATE NOCASE;', [username]);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'That username is already in use.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let insertResult;
    try {
      insertResult = await run(
        'INSERT INTO users (username, password_hash) VALUES (?, ?);',
        [username, passwordHash]
      );
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({
          success: false,
          message: 'That username is already in use.',
        });
      }
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: 'Account created. You can now sign in.',
      user: {
        id: insertResult.id,
        username,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/users/login', userLoginLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username) || password.length < 1 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid username and password.',
      });
    }

    const user = await get('SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE;', [username]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    return req.session.regenerate((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      req.session.account = {
        id: user.id,
        username: user.username,
      };

      return req.session.save((saveError) => {
        if (saveError) {
          return next(saveError);
        }

        return res.json({
          success: true,
          message: 'Signed in successfully.',
          user: req.session.account,
        });
      });
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/users/logout', requireUser, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Unable to sign out right now.',
      });
    }

    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    });
    return res.json({ success: true, message: 'Signed out successfully.' });
  });
});

router.get('/users/me', requireUser, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const user = await get('SELECT id, username, created_at FROM users WHERE id = ?;', [req.session.account.id]);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Session invalid.' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users/reports', requireUser, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const reports = await all(
      `SELECT report_ref, category, description, status, created_at, updated_at
       FROM reports
       WHERE user_id = ? AND anonymous = 0
       ORDER BY created_at DESC;`,
      [req.session.account.id]
    );

    return res.json({
      success: true,
      reports,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/admin/login', loginLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username) || password.length < 1 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid username and password.',
      });
    }

    const admin = await get('SELECT * FROM administrators WHERE username = ?;', [username]);
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    return req.session.regenerate((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      req.session.user = {
        id: admin.id,
        username: admin.username,
      };

      return req.session.save((saveError) => {
        if (saveError) {
          return next(saveError);
        }

        return res.json({
          success: true,
          message: 'Login successful.',
          user: req.session.user,
        });
      });
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/admin/logout', requireAuth, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Unable to log out at the moment.',
      });
    }

    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    });
    return res.json({ success: true, message: 'Logged out successfully.' });
  });
});

router.get('/admin/me', requireAuth, async (req, res, next) => {
  try {
    const admin = await get('SELECT id, username, created_at FROM administrators WHERE id = ?;', [req.session.user.id]);

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Session invalid.' });
    }

    return res.json({
      success: true,
      user: {
        id: admin.id,
        username: admin.username,
        createdAt: admin.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/stats', requireAuth, async (req, res, next) => {
  try {
    const totalReports = await get('SELECT COUNT(*) AS total FROM reports;');
    const categoryCounts = await all(`
      SELECT category, COUNT(*) AS count
      FROM reports
      GROUP BY category
      ORDER BY count DESC, category ASC;
    `);
    const statusCounts = await all(`
      SELECT status, COUNT(*) AS count
      FROM reports
      GROUP BY status
      ORDER BY count DESC, status ASC;
    `);
    const recentReports = await all(`
      SELECT id, report_ref, category, status, created_at
      FROM reports
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    return res.json({
      success: true,
      stats: {
        totalReports: Number(totalReports?.total || 0),
        categoryCounts: categoryCounts.map((item) => ({
          category: item.category,
          count: Number(item.count),
        })),
        statusCounts: statusCounts.map((item) => ({
          status: item.status,
          count: Number(item.count),
        })),
        recentReports,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/reports', requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status).trim() : '';
    const category = req.query.category ? String(req.query.category).trim() : '';
    const search = req.query.search ? String(req.query.search).trim() : '';
    const sort = req.query.sort === undefined ? 'newest' : String(req.query.sort).trim();
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const requestedLimit = req.query.limit === undefined ? 10 : Number(req.query.limit);

    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page and limit must be positive whole numbers.',
      });
    }

    if ((status && !['New', 'Under Review', 'Resolved'].includes(status))
      || (category && !isValidCategory(category))
      || !['newest', 'oldest'].includes(sort)) {
      return res.status(400).json({
        success: false,
        message: 'The selected report filter or sort order is invalid.',
      });
    }

    const limit = Math.min(requestedLimit, 50);
    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
      return res.status(400).json({
        success: false,
        message: 'The requested page is outside the supported range.',
      });
    }

    const params = [];
    let whereClause = 'WHERE 1 = 1';

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (category) {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      const likeTerm = `%${search}%`;
      whereClause += ' AND (report_ref LIKE ? OR category LIKE ? OR description LIKE ?)';
      params.push(likeTerm, likeTerm, likeTerm);
    }

    const countRow = await get(`SELECT COUNT(*) AS total FROM reports ${whereClause};`, params);
    const orderBy = sort === 'oldest'
      ? 'created_at ASC, id ASC'
      : 'created_at DESC, id DESC';
    const reports = await all(
      `SELECT id, report_ref, category, description, anonymous, status, created_at, updated_at
       FROM reports ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?;`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      reports,
      pagination: {
        page,
        limit,
        total: Number(countRow?.total || 0),
        totalPages: Math.max(1, Math.ceil((Number(countRow?.total || 0)) / limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/reports/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID.' });
    }

    const report = await get(
      `SELECT id, report_ref, category, description, anonymous, status, created_at, updated_at, last_updated_by
       FROM reports WHERE id = ?;`,
      [id]
    );
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/reports/:id/status', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const nextStatus = String(req.body?.status || '').trim();

    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID.' });
    }

    if (!['New', 'Under Review', 'Resolved'].includes(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Status must be one of New, Under Review, or Resolved.' });
    }

    const report = await get(
      `SELECT id, report_ref, category, description, anonymous, status, created_at, updated_at, last_updated_by
       FROM reports WHERE id = ?;`,
      [id]
    );
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    await run(
      `UPDATE reports SET status = ?, updated_at = CURRENT_TIMESTAMP, last_updated_by = ? WHERE id = ?;`,
      [nextStatus, req.session.user.id, id]
    );

    const updatedReport = await get(
      `SELECT id, report_ref, category, description, anonymous, status, created_at, updated_at, last_updated_by
       FROM reports WHERE id = ?;`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Report status updated successfully.',
      report: updatedReport,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
