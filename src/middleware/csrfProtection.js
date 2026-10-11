const crypto = require('crypto');

function getCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const providedToken = req.get('X-CSRF-Token') || req.body?._csrf;
  const expectedToken = req.session?.csrfToken;

  if (
    typeof providedToken !== 'string'
    || typeof expectedToken !== 'string'
    || !/^[a-f0-9]{64}$/i.test(providedToken)
    || !/^[a-f0-9]{64}$/i.test(expectedToken)
    || providedToken.length !== expectedToken.length
    || !crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(expectedToken))
  ) {
    return res.status(403).json({
      success: false,
      message: 'The security token is missing or invalid. Refresh the page and try again.',
    });
  }

  return next();
}

module.exports = {
  csrfProtection,
  getCsrfToken,
};
