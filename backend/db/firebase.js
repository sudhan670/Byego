const admin = require('firebase-admin');
const path = require('path');

let db = null;

function now() {
  return new Date().toISOString();
}

function initFirebase() {
  if (admin.apps.length) {
    db = admin.firestore();
    return;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccountPath) {
    const resolved = path.resolve(serviceAccountPath);
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(resolved);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: projectId || serviceAccount.project_id,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ projectId });
  } else {
    admin.initializeApp({ projectId: projectId || 'demo-byego' });
  }

  db = admin.firestore();
}

async function initDb() {
  initFirebase();

  const rolesRef = db.collection('roles');
  const snapshot = await rolesRef.get();
  if (snapshot.empty) {
    const batch = db.batch();
    batch.set(rolesRef.doc('org_admin'), { name: 'org_admin' });
    batch.set(rolesRef.doc('end_user'), { name: 'end_user' });
    await batch.commit();
  }
}

function mapOrg(doc) {
  const d = doc.data();
  return { id: doc.id, name: d.name, slug: d.slug, created_at: d.createdAt };
}

async function createOrganization(name, slug) {
  const existing = await db.collection('organizations').where('slug', '==', slug).limit(1).get();
  if (!existing.empty) {
    const err = new Error('Organization slug already exists');
    err.code = 'UNIQUE_CONSTRAINT';
    throw err;
  }

  const createdAt = now();
  const ref = await db.collection('organizations').add({ name, slug, createdAt });
  return { id: ref.id, name, slug, created_at: createdAt };
}

async function listOrganizations() {
  const snapshot = await db.collection('organizations').orderBy('createdAt', 'desc').get();
  const orgs = [];

  for (const doc of snapshot.docs) {
    const org = mapOrg(doc);
    const [usersSnap, flagsSnap] = await Promise.all([
      db.collection('users').where('organizationId', '==', doc.id).get(),
      db.collection('feature_flags').where('organizationId', '==', doc.id).get(),
    ]);
    orgs.push({
      ...org,
      user_count: usersSnap.size,
      flag_count: flagsSnap.size,
    });
  }

  return orgs;
}

async function getOrganizationBySlug(slug) {
  const snapshot = await db.collection('organizations').where('slug', '==', slug).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, name: doc.data().name, slug: doc.data().slug };
}

async function createUser(email, passwordHash, organizationId, roleName) {
  const existing = await db.collection('users').where('email', '==', email).limit(1).get();
  if (!existing.empty) {
    const err = new Error('Email already registered');
    err.code = 'UNIQUE_CONSTRAINT';
    throw err;
  }

  const createdAt = now();
  const ref = await db.collection('users').add({
    email,
    passwordHash,
    organizationId,
    role: roleName,
    createdAt,
  });

  return { id: ref.id, email, organizationId, role: roleName };
}

async function getUserByEmailAndRole(email, roleName) {
  const snapshot = await db
    .collection('users')
    .where('email', '==', email)
    .where('role', '==', roleName)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  const orgDoc = await db.collection('organizations').doc(data.organizationId).get();

  if (!orgDoc.exists) return null;

  const org = orgDoc.data();
  return {
    id: doc.id,
    email: data.email,
    password_hash: data.passwordHash,
    organization_id: data.organizationId,
    org_name: org.name,
    org_slug: org.slug,
  };
}

async function listFeatureFlags(organizationId) {
  const snapshot = await db
    .collection('feature_flags')
    .where('organizationId', '==', organizationId)
    .get();

  return snapshot.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        feature_key: d.featureKey,
        enabled: d.enabled ? 1 : 0,
        description: d.description || null,
        created_at: d.createdAt,
        updated_at: d.updatedAt,
      };
    })
    .sort((a, b) => a.feature_key.localeCompare(b.feature_key));
}

async function createFeatureFlag(organizationId, featureKey, enabled, description) {
  const existing = await db
    .collection('feature_flags')
    .where('organizationId', '==', organizationId)
    .where('featureKey', '==', featureKey)
    .limit(1)
    .get();

  if (!existing.empty) {
    const err = new Error('Feature flag with this key already exists');
    err.code = 'UNIQUE_CONSTRAINT';
    throw err;
  }

  const createdAt = now();
  const ref = await db.collection('feature_flags').add({
    organizationId,
    featureKey,
    enabled: Boolean(enabled),
    description: description || null,
    createdAt,
    updatedAt: createdAt,
  });

  return {
    id: ref.id,
    feature_key: featureKey,
    enabled: enabled ? 1 : 0,
    description: description || null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

async function getFeatureFlagById(flagId, organizationId) {
  const doc = await db.collection('feature_flags').doc(flagId).get();
  if (!doc.exists || doc.data().organizationId !== organizationId) return null;
  const d = doc.data();
  return { id: doc.id, enabled: d.enabled ? 1 : 0, description: d.description || null };
}

async function updateFeatureFlag(flagId, enabled, description) {
  const updatedAt = now();
  await db.collection('feature_flags').doc(flagId).update({
    enabled: Boolean(enabled),
    description,
    updatedAt,
  });

  const doc = await db.collection('feature_flags').doc(flagId).get();
  const d = doc.data();
  return {
    id: doc.id,
    feature_key: d.featureKey,
    enabled: d.enabled ? 1 : 0,
    description: d.description || null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

async function deleteFeatureFlag(flagId, organizationId) {
  const doc = await db.collection('feature_flags').doc(flagId).get();
  if (!doc.exists || doc.data().organizationId !== organizationId) return false;
  await doc.ref.delete();
  return true;
}

async function getFeatureFlagByKey(organizationId, featureKey) {
  const snapshot = await db
    .collection('feature_flags')
    .where('organizationId', '==', organizationId)
    .where('featureKey', '==', featureKey)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const d = snapshot.docs[0].data();
  return {
    feature_key: d.featureKey,
    enabled: d.enabled ? 1 : 0,
    description: d.description || null,
  };
}

async function getUserById(userId) {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) return null;

  const data = doc.data();
  const orgDoc = await db.collection('organizations').doc(data.organizationId).get();
  if (!orgDoc.exists) return null;

  const org = orgDoc.data();
  return {
    id: doc.id,
    email: data.email,
    org_id: doc.data().organizationId,
    org_name: org.name,
    org_slug: org.slug,
  };
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
