const express = require('express');
const db = require('../db');
const { signToken, authenticate, requireRole } = require('../middleware/auth');
const { slugify } = require('../utils/helpers');

const router = express.Router();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'sudhaned06@gmail.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (email !== SUPER_ADMIN_EMAIL || password !== SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken({ role: 'super_admin', email });
  res.json({ token, user: { email, role: 'super_admin' } });
});

router.use(authenticate, requireRole('super_admin'));

router.get('/organizations', async (_req, res, next) => {
  try {
    const orgs = await db.listOrganizations();
    res.json({ organizations: orgs });
  } catch (err) {
    next(err);
  }
});

router.post('/organizations', async (req, res, next) => {
  const { name, slug: customSlug } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Organization name is required' });
  }

  const slug = customSlug?.trim() || slugify(name);
  if (!slug) {
    return res.status(400).json({ error: 'Could not generate a valid slug' });
  }

  try {
    const org = await db.createOrganization(name.trim(), slug);
    res.status(201).json({ organization: org });
  } catch (err) {
    if (err.code === 'UNIQUE_CONSTRAINT') {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
