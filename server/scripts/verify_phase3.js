const pool = require('../src/config/db');

const BASE_URL = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body;
  try {
    body = await response.json();
  } catch (e) {
    body = null;
  }
  return { status: response.status, body };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('   PHASE 3 VERIFICATION AND INTEGRATION TEST SUITE   ');
  console.log('====================================================\n');

  try {
    // 0. Setup Prerequisites: Institution, Department, Academic Year
    console.log('--- Step 0: Setup Prerequisite Records ---');
    let instRes = await request('/institutions');
    let institution = instRes.body.find(i => i.code === 'TIT');
    if (!institution) {
      const createInst = await request('/institutions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Institute of Technology', code: 'TIT' }),
      });
      institution = createInst.body;
    }
    assert(institution && institution.id, 'Institution ready');

    let deptRes = await request(`/departments?institution_id=${institution.id}`);
    let department = deptRes.body.find(d => d.code === 'CSE');
    if (!department) {
      const createDept = await request('/departments', {
        method: 'POST',
        body: JSON.stringify({ institution_id: institution.id, name: 'Computer Science and Engineering', code: 'CSE' }),
      });
      department = createDept.body;
    }
    assert(department && department.id, 'Department ready');

    let ayRes = await request(`/academic-years?institution_id=${institution.id}`);
    let academicYear = ayRes.body.find(a => a.name === '2026-2027');
    if (!academicYear) {
      const createAy = await request('/academic-years', {
        method: 'POST',
        body: JSON.stringify({
          institution_id: institution.id,
          name: '2026-2027',
          start_date: '2026-07-01',
          end_date: '2027-05-31',
          is_active: true,
        }),
      });
      academicYear = createAy.body;
    }
    assert(academicYear && academicYear.id, 'Academic Year ready\n');

    // Clean up any existing test records from previous test runs
    await pool.query('DELETE FROM class_subjects');
    await pool.query('DELETE FROM classes WHERE department_id = ?', [department.id]);
    await pool.query('DELETE FROM subjects WHERE department_id = ?', [department.id]);

    // 1. Create a Theory Subject
    console.log('--- Step 1: Create a Theory Subject ---');
    const theoryRes = await request('/subjects', {
      method: 'POST',
      body: JSON.stringify({
        department_id: department.id,
        code: 'CS301',
        name: 'Database Management Systems',
        type: 'THEORY',
        periods_per_week: 4,
        duration: 1,
        requires_lab: false,
      }),
    });
    assert(theoryRes.status === 201, 'Theory subject created with status 201');
    assert(theoryRes.body.code === 'CS301' && theoryRes.body.type === 'THEORY', 'Theory subject attributes valid');
    const theorySubjectId = theoryRes.body.id;

    // 2. Create a Lab Subject
    console.log('\n--- Step 2: Create a Lab Subject ---');
    const labRes = await request('/subjects', {
      method: 'POST',
      body: JSON.stringify({
        department_id: department.id,
        code: 'CS302L',
        name: 'Database Systems Laboratory',
        type: 'LAB',
        periods_per_week: 3,
        duration: 3,
        requires_lab: true,
      }),
    });
    assert(labRes.status === 201, 'Lab subject created with status 201');
    assert(labRes.body.code === 'CS302L' && labRes.body.requires_lab === true, 'Lab subject requires_lab is true');
    const labSubjectId = labRes.body.id;

    // 3. Create a Class
    console.log('\n--- Step 3: Create a Class ---');
    const classRes = await request('/classes', {
      method: 'POST',
      body: JSON.stringify({
        department_id: department.id,
        academic_year_id: academicYear.id,
        year: 3,
        section: 'A',
        name: 'B.Tech CSE - 3A',
        student_count: 65,
        is_active: true,
      }),
    });
    assert(classRes.status === 201, 'Class created with status 201');
    assert(classRes.body.student_count === 65 && classRes.body.section === 'A', 'Class attributes valid');
    const classId = classRes.body.id;

    // 4. Assign Subjects to the Class
    console.log('\n--- Step 4: Assign Subjects to Class ---');
    const mapTheory = await request('/class-subjects', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classId,
        subject_id: theorySubjectId,
      }),
    });
    assert(mapTheory.status === 201, 'Theory subject assigned to class with status 201');
    assert(mapTheory.body.mapping.effective_periods_per_week === 4, 'Effective ppw matches base subject (4)');

    const mapLab = await request('/class-subjects', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classId,
        subject_id: labSubjectId,
        periods_per_week_override: 4,
        duration_override: 2,
      }),
    });
    assert(mapLab.status === 201, 'Lab subject assigned with overrides with status 201');
    assert(mapLab.body.mapping.effective_periods_per_week === 4, 'Effective ppw overridden to 4');
    assert(mapLab.body.mapping.effective_duration === 2, 'Effective duration overridden to 2');

    // Verify GET /api/class-subjects
    const listMappings = await request(`/class-subjects?class_id=${classId}`);
    assert(listMappings.status === 200 && listMappings.body.length === 2, 'Retrieved 2 mapped subjects for class');

    // 5. Test Duplicate Prevention
    console.log('\n--- Step 5: Test Duplicate Class, Subject, and Mapping ---');
    const dupClass = await request('/classes', {
      method: 'POST',
      body: JSON.stringify({
        department_id: department.id,
        academic_year_id: academicYear.id,
        year: 3,
        section: 'A',
        name: 'Another CSE-3A',
        student_count: 50,
      }),
    });
    assert(dupClass.status === 400, 'Duplicate class prevented (status 400)');

    const dupSubject = await request('/subjects', {
      method: 'POST',
      body: JSON.stringify({
        department_id: department.id,
        code: 'CS301',
        name: 'Duplicate DBMS',
        type: 'THEORY',
        periods_per_week: 3,
        duration: 1,
      }),
    });
    assert(dupSubject.status === 400, 'Duplicate subject code within department prevented (status 400)');

    const dupMapping = await request('/class-subjects', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classId,
        subject_id: theorySubjectId,
      }),
    });
    assert(dupMapping.status === 400, 'Duplicate class-subject mapping prevented (status 400)');

    // 6. Test Invalid Duration and Periods
    console.log('\n--- Step 6: Test Invalid Duration and Periods Validations ---');
    const invalidPpw = await request('/subjects', {
      method: 'POST',
      body: JSON.stringify({
        department_id: department.id,
        code: 'CS_INV1',
        name: 'Invalid PPW Subject',
        type: 'THEORY',
        periods_per_week: 2,
        duration: 3, // duration > periods_per_week
      }),
    });
    assert(invalidPpw.status === 400, 'Subject rejected when duration > periods_per_week');

    const invalidLabDur = await request('/subjects', {
      method: 'POST',
      body: JSON.stringify({
        department_id: department.id,
        code: 'CS_INV2',
        name: 'Invalid Lab Duration',
        type: 'LAB',
        periods_per_week: 3,
        duration: 1, // LAB duration < 2
      }),
    });
    assert(invalidLabDur.status === 400, 'LAB subject rejected when duration < 2');

    const invalidStudentCount = await request('/classes', {
      method: 'POST',
      body: JSON.stringify({
        department_id: department.id,
        academic_year_id: academicYear.id,
        year: 1,
        section: 'Z',
        name: 'Zero Students',
        student_count: 0, // <= 0
      }),
    });
    assert(invalidStudentCount.status === 400, 'Class rejected when student_count <= 0');

    const invalidOverride = await request('/class-subjects', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classId,
        subject_id: labSubjectId,
        periods_per_week_override: 1,
        duration_override: 2,
      }),
    });
    assert(invalidOverride.status === 400, 'Mapping rejected when override periods_per_week < duration');

    // 7. Test Editing and Deactivation
    console.log('\n--- Step 7: Test Editing and Deactivation ---');
    // Edit Class
    const editClass = await request(`/classes/${classId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'B.Tech CSE - 3A (Updated)',
        student_count: 70,
        is_active: false,
      }),
    });
    assert(editClass.status === 200, 'Class updated successfully');
    assert(editClass.body.class.is_active === false, 'Class deactivated successfully');

    // Edit Subject
    const editSubj = await request(`/subjects/${theorySubjectId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Database Management Systems & SQL',
        is_active: false,
      }),
    });
    assert(editSubj.status === 200, 'Subject updated successfully');
    assert(editSubj.body.subject.is_active === false, 'Subject deactivated successfully');

    // Edit Mapping Overrides
    const editMap = await request(`/class-subjects/${classId}/${theorySubjectId}`, {
      method: 'PUT',
      body: JSON.stringify({
        periods_per_week_override: 5,
        duration_override: 1,
      }),
    });
    assert(editMap.status === 200, 'Mapping overrides updated successfully');
    assert(editMap.body.mapping.effective_periods_per_week === 5, 'Effective periods per week updated to 5');

    // Reactivate for further tests
    await request(`/classes/${classId}`, { method: 'PUT', body: JSON.stringify({ is_active: true }) });
    await request(`/subjects/${theorySubjectId}`, { method: 'PUT', body: JSON.stringify({ is_active: true }) });

    // 8. Verify Foreign-Key Integrity and Safe Deletion
    console.log('\n--- Step 8: Verify Foreign Keys & Safe Deletion ---');
    const nonExistentDept = await request('/classes', {
      method: 'POST',
      body: JSON.stringify({
        department_id: 999999,
        academic_year_id: academicYear.id,
        year: 2,
        section: 'B',
        name: 'Fake Dept Class',
        student_count: 40,
      }),
    });
    assert(nonExistentDept.status === 400, 'Class creation with non-existent department rejected');

    // Safe deletion: Attempt to delete subject while mapped to class
    const deleteMappedSubj = await request(`/subjects/${theorySubjectId}`, { method: 'DELETE' });
    assert(deleteMappedSubj.status === 400, 'Safe deletion: deleting assigned subject prevented');

    // Unassign subject from class
    const unassign = await request(`/class-subjects/${classId}/${theorySubjectId}`, { method: 'DELETE' });
    assert(unassign.status === 200, 'Unassigned subject from class successfully');

    const verifyUnassign = await request(`/class-subjects?class_id=${classId}&subject_id=${theorySubjectId}`);
    assert(verifyUnassign.body.length === 0, 'Mapping verified removed');

    // 9. Verify Data Persistence in MySQL Directly
    console.log('\n--- Step 9: Verify Data Persists in Database Directly ---');
    const [dbClasses] = await pool.query('SELECT * FROM classes WHERE id = ?', [classId]);
    assert(dbClasses.length === 1 && dbClasses[0].name === 'B.Tech CSE - 3A (Updated)', 'Class persists in MySQL database');

    const [dbSubjects] = await pool.query('SELECT * FROM subjects WHERE id = ?', [labSubjectId]);
    assert(dbSubjects.length === 1 && dbSubjects[0].code === 'CS302L', 'Subject persists in MySQL database');

    const [dbMappings] = await pool.query('SELECT * FROM class_subjects WHERE class_id = ? AND subject_id = ?', [classId, labSubjectId]);
    assert(dbMappings.length === 1, 'Class-Subject mapping persists in MySQL database');

    console.log('\n====================================================');
    console.log('   ALL PHASE 3 VERIFICATION TESTS PASSED (10/10)    ');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

runTests();
