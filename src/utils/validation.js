const crypto = require('crypto');

const VALID_CATEGORIES = [
  'Public Safety',
  'Corruption Concern',
  'Discrimination',
  'Access to Justice',
  'Human Rights Concern',
  'Other',
];

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeDescription(value) {
  const description = normalizeText(value);
  return description.length > 0 ? description : '';
}

function isValidCategory(category) {
  return VALID_CATEGORIES.includes(category);
}

function generateReportRef() {
  const prefix = 'SDG16-';
  return `${prefix}${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

function getDuplicateKeyHash(category, description) {
  const payload = `${category.toLowerCase()}|${normalizeText(description).toLowerCase()}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

module.exports = {
  VALID_CATEGORIES,
  normalizeDescription,
  isValidCategory,
  generateReportRef,
  getDuplicateKeyHash,
};
