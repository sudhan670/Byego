const express = require('express');
const db = require('../db');
const { signToken, authenticate, requireRole } = require('../middleware/auth');
const { hashPassword, comparePassword, validateEmail } = require('../utils/helpers');

const router = express.Router();

router.post('/signup', async (req, res, next) => {
  const { email, password, organizationSlug } = req.body;

  if (!email || !password || !organizationSlug) {
    return res.status(400).json({ error: 'Email, password, and organization slug are required' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const org = await db.getOrganizationBySlug(organizationSlug.trim());
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await hashPassword(password);
    const user = await db.createUser(normalizedEmail, passwordHash, org.id, 'end_user');

    const token = signToken({
      userId: user.id,
      role: 'end_user',
      organizationId: org.id,
      email: normalizedEmail,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: normalizedEmail,
        role: 'end_user',
        organization: org,
      },
    });
  } catch (err) {
    if (err.code === 'UNIQUE_CONSTRAINT') {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await db.getUserByEmailAndRole(email.toLowerCase().trim(), 'end_user');

    if (!user || !(await comparePassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({
      userId: user.id,
      role: 'end_user',
      organizationId: user.organization_id,
      email: user.email,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: 'end_user',
        organization: { id: user.organization_id, name: user.org_name, slug: user.org_slug },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.use(authenticate, requireRole('end_user'));

router.post('/check-feature', async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { featureKey } = req.body;

  if (!featureKey || !featureKey.trim()) {
    return res.status(400).json({ error: 'featureKey is required' });
  }

  try {
    const key = featureKey.trim().toLowerCase();
    const flag = await db.getFeatureFlagByKey(orgId, key);

    if (!flag) {
      return res.json({
        featureKey: key,
        exists: false,
        enabled: false,
        message: 'Feature flag not found for your organization',
      });
    }

    res.json({
      featureKey: flag.feature_key,
      exists: true,
      enabled: Boolean(flag.enabled),
      description: flag.description,
      message: flag.enabled ? 'Feature is enabled' : 'Feature is disabled',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.userId);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: 'end_user',
        organization: { id: user.org_id, name: user.org_name, slug: user.org_slug },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
