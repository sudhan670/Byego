const provider = (process.env.DB_PROVIDER || 'sqlite').toLowerCase();

const db = provider === 'firebase' ? require('./firebase') : require('./sqlite');

module.exports = db;
