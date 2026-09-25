const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function initDB() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
    });

    console.log('Connected to MySQL server.');

    const dbName = process.env.DB_NAME || 'timetable_db';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`Database ${dbName} checked/created.`);

    await connection.query(`USE \`${dbName}\``);

    // 1. Institutions
    await connection.query(`
      CREATE TABLE IF NOT EXISTS institutions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        code VARCHAR(50) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Table `institutions` checked/created.');

    // 2. Departments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        institution_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_dept_inst (institution_id, code),
        UNIQUE KEY unique_dept_name_inst (institution_id, name)
      )
    `);
    console.log('Table `departments` checked/created.');

    // 3. Academic Years
    await connection.query(`
      CREATE TABLE IF NOT EXISTS academic_years (
        id INT AUTO_INCREMENT PRIMARY KEY,
        institution_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_year_inst (institution_id, name)
      )
    `);
    console.log('Table `academic_years` checked/created.');

    // 4. Classes
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

    // 5. Subjects
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

    // 6. Class-Subjects (Mapping)
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

    // 7. Faculty
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

    // 8. Faculty-Subjects (Mapping)
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

    // 9. Rooms
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

    // 10. Working Days
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

    // 11. Periods
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

    await connection.end();
    console.log('Database initialization complete.');
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

initDB();
