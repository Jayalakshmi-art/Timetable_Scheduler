/**
 * Phase 3-6 Full Migration
 * Drops legacy incompatible tables and recreates the complete
 * Phase 3-6 schema for the timetable application.
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function migrate() {
  let connection;
  try {
    const dbName = process.env.DB_NAME || 'timetable_db';
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      multipleStatements: false,
    });

    await connection.query(`USE \`${dbName}\``);
    console.log(`Using database: ${dbName}\n`);

    // Disable FK checks during cleanup
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // ─────────────────────────────────────────────────────────────────
    // DROP LEGACY TABLES (old schema with UNSIGNED PKs)
    // ─────────────────────────────────────────────────────────────────
    const legacyTables = [
      'room_availability',   // old (UNSIGNED FK)
      'teacher_availability',
      'teaching_assignments',
      'timetable_entries',
      'constraints',         // old constraints table
      'classes',             // old (UNSIGNED PK)
      'subjects',            // old (UNSIGNED PK)
      'rooms',               // old (UNSIGNED PK)
      'periods',             // old (UNSIGNED PK)
      'teachers',
      'college_settings',
      'users',
    ];

    for (const t of legacyTables) {
      await connection.query(`DROP TABLE IF EXISTS \`${t}\``);
      console.log(`  Dropped legacy table: ${t}`);
    }

    // Re-enable FK checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\nLegacy tables cleaned up.\n');

    // ─────────────────────────────────────────────────────────────────
    // Phase 3: Classes
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        department_id INT NOT NULL,
        academic_year_id INT NOT NULL,
        year INT NOT NULL,
        section VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        student_count INT NOT NULL CHECK (student_count > 0),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
        FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_class (department_id, academic_year_id, year, section)
      )
    `);
    console.log('Table `classes` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 3: Subjects
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        department_id INT NOT NULL,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type ENUM('THEORY', 'LAB', 'TUTORIAL', 'OTHER') NOT NULL,
        periods_per_week INT NOT NULL CHECK (periods_per_week > 0),
        duration INT NOT NULL CHECK (duration > 0),
        requires_lab BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_subject_code (department_id, code)
      )
    `);
    console.log('Table `subjects` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 3: Class-Subjects Mapping
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS class_subjects (
        class_id INT NOT NULL,
        subject_id INT NOT NULL,
        periods_per_week_override INT CHECK (periods_per_week_override > 0),
        duration_override INT CHECK (duration_override > 0),
        PRIMARY KEY (class_id, subject_id),
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);
    console.log('Table `class_subjects` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 4: Faculty
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS faculty (
        id INT AUTO_INCREMENT PRIMARY KEY,
        department_id INT NOT NULL,
        faculty_code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        max_periods_per_day INT NOT NULL DEFAULT 4 CHECK (max_periods_per_day > 0),
        max_periods_per_week INT NOT NULL DEFAULT 20 CHECK (max_periods_per_week > 0),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_dept_faculty_code (department_id, faculty_code),
        UNIQUE KEY unique_faculty_email (email)
      )
    `);
    console.log('Table `faculty` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 4: Faculty-Subjects Mapping
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS faculty_subjects (
        faculty_id INT NOT NULL,
        subject_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (faculty_id, subject_id),
        FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);
    console.log('Table `faculty_subjects` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 5: Rooms
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        institution_id INT NOT NULL,
        room_code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type ENUM('CLASSROOM', 'LAB', 'SEMINAR_HALL', 'OTHER') NOT NULL DEFAULT 'CLASSROOM',
        capacity INT NOT NULL CHECK (capacity > 0),
        floor VARCHAR(50),
        building VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_room_code (institution_id, room_code)
      )
    `);
    console.log('Table `rooms` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 5: Working Days
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS working_days (
        id INT AUTO_INCREMENT PRIMARY KEY,
        institution_id INT NOT NULL,
        day_name VARCHAR(20) NOT NULL,
        day_order INT NOT NULL CHECK (day_order >= 0),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_day_inst (institution_id, day_name),
        UNIQUE KEY unique_day_order_inst (institution_id, day_order)
      )
    `);
    console.log('Table `working_days` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 5: Periods
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS periods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        institution_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        period_order INT NOT NULL CHECK (period_order >= 0),
        is_break BOOLEAN DEFAULT FALSE,
        is_lunch BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_period_order (institution_id, period_order),
        UNIQUE KEY unique_period_name (institution_id, name)
      )
    `);
    console.log('Table `periods` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 6: Faculty Availability
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
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
    console.log('Table `faculty_availability` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 6: Class Availability
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
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
    console.log('Table `class_availability` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 6: Room Availability
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
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
        FOREIGN KEY (period_id)       REFERENCES periods(id)          ON DELETE CASCADE,
        UNIQUE KEY unique_room_avail (room_id, working_day_id, period_id)
      )
    `);
    console.log('Table `room_availability` checked/created.');

    // ─────────────────────────────────────────────────────────────────
    // Phase 6: Timetable Constraints
    // ─────────────────────────────────────────────────────────────────
    await connection.query(`
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
    console.log('Table `timetable_constraints` checked/created.');

    await connection.end();
    console.log('\n✅ Full Phase 3-6 migration complete!');
  } catch (err) {
    console.error('\n❌ Migration error:', err.message);
    if (connection) {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
      await connection.end();
    }
    process.exit(1);
  }
}

migrate();
