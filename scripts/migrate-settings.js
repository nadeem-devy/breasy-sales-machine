// Migrate system_settings from local export to production
const db = require('../src/database/db');
const settings = require('./migrate-settings.json');

const stmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)');

let count = 0;
for (const s of settings) {
  stmt.run(s.key, s.value, s.description);
  count++;
}

console.log(`Migrated ${count} settings to production database.`);

// Verify
const rows = db.prepare('SELECT key, value FROM system_settings').all();
for (const r of rows) {
  const display = r.value.length > 50 ? r.value.substring(0, 50) + '...' : r.value;
  console.log(`  ${r.key}: ${display || '(empty)'}`);
}
