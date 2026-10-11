const path = require('path');
require('dotenv').config();

const projectRoot = process.cwd();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('Production requires SESSION_SECRET to contain at least 32 characters.');
}

if (!isProduction && !sessionSecret && process.env.NODE_ENV !== 'test') {
  console.warn('SESSION_SECRET is unset; using a development-only secret. Set SESSION_SECRET before deployment.');
}

const dbPath = process.env.DB_PATH
  ? path.resolve(projectRoot, process.env.DB_PATH)
  : path.join(projectRoot, 'data', 'sdg16.db');

const env = {
  port: Number(process.env.PORT) || 3000,
  sessionSecret: sessionSecret || 'development-only-secret-do-not-deploy',
  dbPath,
  isProduction,
  appName: 'SDG 16 Awareness and Issue Reporting System',
};

module.exports = env;
