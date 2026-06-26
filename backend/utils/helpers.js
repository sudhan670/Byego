const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

async function hashPassword(password) {
  // I use the bcrypt password to hash the work
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function validateEmail(email) {
  // Major code to check the functionality of the email address in the workspace
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateFeatureKey(key) {
  return /^[a-z][a-z0-9_]*$/.test(key);
}

module.exports = {
  hashPassword,
  comparePassword,
  slugify,
  validateEmail,
  validateFeatureKey,
};
