require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

const superAdminRoutes = require('./routes/superAdmin');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

async function start() {
  await initDb();

  const app = express();
  const PORT = process.env.PORT || 3000;
  const dbProvider = (process.env.DB_PROVIDER || 'sqlite').toLowerCase();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', database: dbProvider });
  });

  app.use('/api/super-admin', superAdminRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/user', userRoutes);

  app.use('/super-admin', express.static(path.join(__dirname, '..', 'frontend-super-admin')));
  app.use('/admin', express.static(path.join(__dirname, '..', 'frontend-admin')));
  app.use('/user', express.static(path.join(__dirname, '..', 'frontend-user')));

  app.get('/', (_req, res) => {
    res.json({
      message: 'Byego Feature Flag Management API',
      database: dbProvider,
      apps: {
        superAdmin: '/super-admin',
        admin: '/admin',
        user: '/user',
      },
    });
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`  Database:    ${dbProvider}`);
    console.log(`  Super Admin: http://localhost:${PORT}/super-admin`);
    console.log(`  Admin:       http://localhost:${PORT}/admin`);
    console.log(`  User:        http://localhost:${PORT}/user`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
