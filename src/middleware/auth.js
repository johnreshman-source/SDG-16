const { get } = require('../config/db');

async function hasActiveAdminSession(req) {
  if (!req.session?.user?.id) {
    return false;
  }

  const admin = await get('SELECT id FROM administrators WHERE id = ?;', [req.session.user.id]);
  if (!admin) {
    delete req.session.user;
    return false;
  }

  return true;
}

async function hasActiveUserSession(req) {
  if (!req.session?.account?.id) {
    return false;
  }

  const user = await get('SELECT id FROM users WHERE id = ?;', [req.session.account.id]);
  if (!user) {
    delete req.session.account;
    return false;
  }

  return true;
}

function requireAuth(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.set('Pragma', 'no-cache');
  hasActiveAdminSession(req)
    .then((isAuthenticated) => {
      if (!isAuthenticated) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      return next();
    })
    .catch(next);
}

function requireAdminPageAuth(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.set('Pragma', 'no-cache');
  hasActiveAdminSession(req)
    .then((isAuthenticated) => {
      if (!isAuthenticated) {
        return res.redirect('/admin-login.html');
      }

      return next();
    })
    .catch(next);
}

function requireGuest(req, res, next) {
  hasActiveAdminSession(req)
    .then((isAuthenticated) => {
      if (isAuthenticated) {
        return res.redirect('/admin.html');
      }

      return next();
    })
    .catch(next);
}

function requireUser(req, res, next) {
  hasActiveUserSession(req)
    .then((isAuthenticated) => {
      if (!isAuthenticated) {
        return res.status(401).json({
          success: false,
          message: 'User sign-in required.',
        });
      }

      return next();
    })
    .catch(next);
}

function requireUserPageAuth(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  hasActiveUserSession(req)
    .then((isAuthenticated) => {
      if (!isAuthenticated) {
        return res.redirect('/user-login.html');
      }

      return next();
    })
    .catch(next);
}

module.exports = {
  requireAuth,
  requireAdminPageAuth,
  requireGuest,
  requireUser,
  requireUserPageAuth,
};
