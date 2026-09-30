const db = require('../src/config/db');

async function setupTables() {
  console.log('Ensuring all schema tables exist...');
  
  // 1. Availability tables
  await db.query(`
    CREATE TABLE IF NOT EXISTS faculty_availability (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      faculty_id    INT NOT NULL,
      working_day_id INT NOT NULL,
      period_id     INT NOT NULL,
      is_available  BOOLEAN NOT NULL DEFAULT FALSE,
      reason        VARCHAR(255),
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (faculty_id)     REFERENCES faculty(id)       ON DELETE CASCADE,
      FOREIGN KEY (working_day_id) REFERENCES working_days(id)  ON DELETE CASCADE,
      FOREIGN KEY (period_id)      REFERENCES periods(id)        ON DELETE CASCADE,
      UNIQUE KEY unique_fac_avail (faculty_id, working_day_id, period_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS class_availability (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      class_id       INT NOT NULL,
      working_day_id INT NOT NULL,
      period_id      INT NOT NULL,
      is_available   BOOLEAN NOT NULL DEFAULT FALSE,
      reason         VARCHAR(255),
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id)        REFERENCES classes(id)       ON DELETE CASCADE,
      FOREIGN KEY (working_day_id)  REFERENCES working_days(id)  ON DELETE CASCADE,
      FOREIGN KEY (period_id)       REFERENCES periods(id)        ON DELETE CASCADE,
      UNIQUE KEY unique_cls_avail (class_id, working_day_id, period_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS room_availability (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      room_id        INT NOT NULL,
      working_day_id INT NOT NULL,
      period_id      INT NOT NULL,
      is_available   BOOLEAN NOT NULL DEFAULT FALSE,
      reason         VARCHAR(255),
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id)         REFERENCES rooms(id)          ON DELETE CASCADE,
      FOREIGN KEY (working_day_id)  REFERENCES working_days(id)   ON DELETE CASCADE,
      FOREIGN KEY (period_id)       REFERENCES periods(id)        ON DELETE CASCADE,
      UNIQUE KEY unique_room_avail (room_id, working_day_id, period_id)
    )
  `);

  // 2. Constraints table
  await db.query(`
    CREATE TABLE IF NOT EXISTS timetable_constraints (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      institution_id   INT NOT NULL,
      constraint_key   VARCHAR(100) NOT NULL,
      constraint_type  ENUM('HARD','SOFT') NOT NULL,
      name             VARCHAR(255) NOT NULL,
      description      TEXT,
      is_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
      priority         INT NOT NULL DEFAULT 1,
      parameters       JSON,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
      UNIQUE KEY unique_constraint_per_inst (institution_id, constraint_key)
    )
  `);

  // 3. Timetables & Entries tables
  await db.query(`
    CREATE TABLE IF NOT EXISTS timetables (
      id INT AUTO_INCREMENT PRIMARY KEY,
      institution_id INT NOT NULL,
      academic_year_id INT,
      name VARCHAR(255) NOT NULL,
      status ENUM('DRAFT', 'GENERATED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'GENERATED',
      soft_score DECIMAL(5,2) DEFAULT NULL,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS timetable_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timetable_id INT NOT NULL,
      class_id INT NOT NULL,
      subject_id INT NOT NULL,
      faculty_id INT NOT NULL,
      room_id INT NOT NULL,
      working_day_id INT NOT NULL,
      period_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (working_day_id) REFERENCES working_days(id) ON DELETE CASCADE,
      FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ All tables verified/created successfully.');
  process.exit(0);
}

setupTables().catch(err => {
  console.error('Setup error:', err);
  process.exit(1);
});
