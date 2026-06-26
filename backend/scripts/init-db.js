require('dotenv').config();
const { initDb } = require('./db');

async function main() {
  await initDb();
  console.log(`Database initialized (${process.env.DB_PROVIDER || 'sqlite'})`);
}

main().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
