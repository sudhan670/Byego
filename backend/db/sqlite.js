const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'feature-flags.db');

let db = null;

const ROLES = { org_admin: 1, end_user: 2 };

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function isUniqueConstraintError(err) {
  return String(err?.message || err).includes('UNIQUE constraint failed');
}

function prepare(sql) {
  return {
    run(...params) {
      try {
        db.run(sql, params);
        const lastInsertRowid = db.exec('SELECT last_insert_rowid()')[0]?.values[0][0];
        const changes = db.getRowsModified();
        save();
        return { lastInsertRowid, changes };
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          const e = new Error(err.message);
          e.code = 'UNIQUE_CONSTRAINT';
          throw e;
        }
        throw err;
      }
    },
    get(...params) {
      const stmt = db.prepare(sql);
      try {
        if (params.length) stmt.bind(params);
        if (stmt.step()) return stmt.getAsObject();
        return undefined;
      } finally {
        stmt.free();
      }
    },
    all(...params) {
      const results = [];
      const stmt = db.prepare(sql);
      try {
        if (params.length) stmt.bind(params);
        while (stmt.step()) results.push(stmt.getAsObject());
        return results;
      } finally {
        stmt.free();
      }
    },
  };
}

function exec(sql) {
  db.exec(sql);
  save();
}

function initSchema() {
  exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      organization_id INTEGER,
      role_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      feature_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      UNIQUE (organization_id, feature_key)
    );

    CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
    CREATE INDEX IF NOT EXISTS idx_flags_org ON feature_flags(organization_id);
  `);

  prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)').run('org_admin');
  prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)').run('end_user');
}

async function initDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  initSchema();
  save();
}

function getRoleId(roleName) {
  return prepare('SELECT id FROM roles WHERE name = ?').get(roleName)?.id;
}

async function createOrganization(name, slug) {
  try {
    const result = prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)').run(name, slug);
    return prepare('SELECT id, name, slug, created_at FROM organizations WHERE id = ?').get(
      result.lastInsertRowid
    );
  } catch (err) {
    if (err.code === 'UNIQUE_CONSTRAINT') {
      const e = new Error('Organization slug already exists');
      e.code = 'UNIQUE_CONSTRAINT';
      throw e;
    }
    throw err;
  }
}

async function listOrganizations() {
  return prepare(
    `SELECT o.id, o.name, o.slug, o.created_at,
            (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count,
            (SELECT COUNT(*) FROM feature_flags f WHERE f.organization_id = o.id) AS flag_count
     FROM organizations o
     ORDER BY o.created_at DESC`
  ).all();
}

async function getOrganizationBySlug(slug) {
  return prepare('SELECT id, name, slug FROM organizations WHERE slug = ?').get(slug);
}

async function createUser(email, passwordHash, organizationId, roleName) {
  const roleId = getRoleId(roleName);
  try {
    const result = prepare(
      'INSERT INTO users (email, password_hash, organization_id, role_id) VALUES (?, ?, ?, ?)'
    ).run(email, passwordHash, organizationId, roleId);
    return { id: result.lastInsertRowid, email, organizationId, role: roleName };
  } catch (err) {
    if (err.code === 'UNIQUE_CONSTRAINT') {
      const e = new Error('Email already registered');
      e.code = 'UNIQUE_CONSTRAINT';
      throw e;
    }
    throw err;
  }
}

async function getUserByEmailAndRole(email, roleName) {
  const roleId = getRoleId(roleName);
  return prepare(
    `SELECT u.id, u.email, u.password_hash, u.organization_id, o.name AS org_name, o.slug AS org_slug
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.email = ? AND u.role_id = ?`
  ).get(email, roleId);
}

async function listFeatureFlags(organizationId) {
  return prepare(
    `SELECT id, feature_key, enabled, description, created_at, updated_at
     FROM feature_flags
     WHERE organization_id = ?
     ORDER BY feature_key`
  ).all(organizationId);
}

async function createFeatureFlag(organizationId, featureKey, enabled, description) {
  try {
    const result = prepare(
      `INSERT INTO feature_flags (organization_id, feature_key, enabled, description)
       VALUES (?, ?, ?, ?)`
    ).run(organizationId, featureKey, enabled ? 1 : 0, description);
    return prepare(
      'SELECT id, feature_key, enabled, description, created_at, updated_at FROM feature_flags WHERE id = ?'
    ).get(result.lastInsertRowid);
  } catch (err) {
    if (err.code === 'UNIQUE_CONSTRAINT') {
      const e = new Error('Feature flag with this key already exists');
      e.code = 'UNIQUE_CONSTRAINT';
      throw e;
    }
    throw err;
  }
}

async function getFeatureFlagById(flagId, organizationId) {
  return prepare('SELECT id, enabled, description FROM feature_flags WHERE id = ? AND organization_id = ?').get(
    flagId,
    organizationId
  );
}

async function updateFeatureFlag(flagId, enabled, description) {
  prepare(
    `UPDATE feature_flags SET enabled = ?, description = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(enabled ? 1 : 0, description, flagId);
  return prepare(
    'SELECT id, feature_key, enabled, description, created_at, updated_at FROM feature_flags WHERE id = ?'
  ).get(flagId);
}

async function deleteFeatureFlag(flagId, organizationId) {
  const result = prepare('DELETE FROM feature_flags WHERE id = ? AND organization_id = ?').run(
    flagId,
    organizationId
  );
  return result.changes > 0;
}

async function getFeatureFlagByKey(organizationId, featureKey) {
  return prepare(
    `SELECT feature_key, enabled, description
     FROM feature_flags
     WHERE organization_id = ? AND feature_key = ?`
  ).get(organizationId, featureKey);
}

async function getUserById(userId) {
  return prepare(
    `SELECT u.id, u.email, o.id AS org_id, o.name AS org_name, o.slug AS org_slug
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = ?`
  ).get(userId);
}

module.exports = {
  initDb,
  createOrganization,
  listOrganizations,
  getOrganizationBySlug,
  createUser,
  getUserByEmailAndRole,
  listFeatureFlags,
  createFeatureFlag,
  getFeatureFlagById,
  updateFeatureFlag,
  deleteFeatureFlag,
  getFeatureFlagByKey,
  getUserById,
};
