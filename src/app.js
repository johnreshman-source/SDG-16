const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const { initializeDatabase } = require('./config/db');
const SQLiteSessionStore = require('./config/sessionStore');
const { port, sessionSecret, isProduction } = require('./config/env');
const { requireAdminPageAuth, requireGuest, requireUserPageAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { csrfProtection } = require('./middleware/csrfProtection');
const apiRoutes = require('./routes/api');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet()
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(
    session({
      secret: sessionSecret,
      store: new SQLiteSessionStore(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 4,
      },
    })
  );

  app.use('/api', csrfProtection);
  app.use('/api', apiRoutes);

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  app.get('/admin-login.html', requireGuest, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-login.html'));
  });

  app.get(['/admin', '/admin/dashboard'], requireAdminPageAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
  });

  app.get('/admin.html', requireAdminPageAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
  });

  app.get('/account', requireUserPageAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/account.html'));
  });

  app.get('/account.html', requireUserPageAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/account.html'));
  });

  app.use(express.static(path.join(__dirname, '../public')));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function startServer() {
  await initializeDatabase();
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

module.exports = {
  createApp,
  startServer,
  port,
};
