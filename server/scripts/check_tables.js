const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

const TABLES = [
  'institutions','departments','academic_years','classes','subjects',
  'class_subjects','faculty','faculty_subjects','rooms','working_days',
  'periods','faculty_availability','class_availability','room_availability',
  'timetable_constraints'
];

async function check() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  for (const t of TABLES) {
    try {
      const [r] = await c.query('DESCRIBE `' + t + '`');
      console.log(t + ': OK (' + r.length + ' cols) - PKtype:' + (r.find(col => col.Key === 'PRI') || {}).Type);
    } catch (e) {
      console.log(t + ': MISSING');
    }
  }

  await c.end();
}

check().catch(console.error);
