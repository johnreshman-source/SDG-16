function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'The requested resource was not found.',
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = Number(err.statusCode) || 500;
  const message = statusCode === 500
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'Request failed.';

  if (statusCode >= 500) {
    console.error('Server error:', err.message);
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
