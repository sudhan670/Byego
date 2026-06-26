const express = require('express');
const db = require('../db');
const { signToken, authenticate, requireRole } = require('../middleware/auth');
const { hashPassword, comparePassword, validateEmail, validateFeatureKey } = require('../utils/helpers');

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
    const user = await db.createUser(normalizedEmail, passwordHash, org.id, 'org_admin');

    const token = signToken({
      userId: user.id,
      role: 'org_admin',
      organizationId: org.id,
      email: normalizedEmail,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: normalizedEmail,
        role: 'org_admin',
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
    const user = await db.getUserByEmailAndRole(email.toLowerCase().trim(), 'org_admin');

    if (!user || !(await comparePassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({
      userId: user.id,
      role: 'org_admin',
      organizationId: user.organization_id,
      email: user.email,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: 'org_admin',
        organization: { id: user.organization_id, name: user.org_name, slug: user.org_slug },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.use(authenticate, requireRole('org_admin'));

router.get('/feature-flags', async (req, res, next) => {
  try {
    const flags = await db.listFeatureFlags(req.user.organizationId);
    res.json({
      featureFlags: flags.map((f) => ({ ...f, enabled: Boolean(f.enabled) })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/feature-flags', async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { featureKey, enabled = false, description } = req.body;

  if (!featureKey) {
    return res.status(400).json({ error: 'featureKey is required' });
  }

  const key = featureKey.trim().toLowerCase();
  if (!validateFeatureKey(key)) {
    return res.status(400).json({
      error: 'featureKey must start with a letter and contain only lowercase letters, numbers, and underscores',
    });
  }

  try {
    const flag = await db.createFeatureFlag(orgId, key, enabled, description?.trim() || null);
    res.status(201).json({
      featureFlag: { ...flag, enabled: Boolean(flag.enabled) },
    });
  } catch (err) {
    if (err.code === 'UNIQUE_CONSTRAINT') {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});

router.put('/feature-flags/:id', async (req, res, next) => {
  const orgId = req.user.organizationId;
  const flagId = req.params.id;
  const { enabled, description } = req.body;

  try {
    const existing = await db.getFeatureFlagById(flagId, orgId);
    if (!existing) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    if (enabled === undefined && description === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const newEnabled = enabled !== undefined ? enabled : Boolean(existing.enabled);
    const newDescription =
      description !== undefined ? description?.trim() || null : existing.description;

    const flag = await db.updateFeatureFlag(flagId, newEnabled, newDescription);
    res.json({ featureFlag: { ...flag, enabled: Boolean(flag.enabled) } });
  } catch (err) {
    next(err);
  }
});

router.delete('/feature-flags/:id', async (req, res, next) => {
  try {
    const deleted = await db.deleteFeatureFlag(req.params.id, req.user.organizationId);
    if (!deleted) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }
    res.json({ message: 'Feature flag deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
