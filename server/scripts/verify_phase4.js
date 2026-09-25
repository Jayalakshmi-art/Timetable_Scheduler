const pool = require('../src/config/db');

const BASE = 'http://localhost:5000/api';

async function req(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
}

function ok(cond, msg) {
  if (!cond) { console.error(`❌ FAIL: ${msg}`); throw new Error(msg); }
  console.log(`✅ PASS: ${msg}`);
}

async function run() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('   PHASE 4 VERIFICATION – Faculty & Mapping');
  console.log('══════════════════════════════════════════════════\n');

  // ─── Prerequisites ───
  let { body: insts } = await req('/institutions');
  let inst = insts.find(i => i.code === 'TIT');
  if (!inst) {
    const r = await req('/institutions', { method:'POST', body: JSON.stringify({name:'Test Institute of Technology',code:'TIT'}) });
    inst = r.body;
  }
  ok(inst?.id, 'Institution ready');

  let { body: depts } = await req(`/departments?institution_id=${inst.id}`);
  let dept = depts.find(d => d.code === 'CSE');
  if (!dept) {
    const r = await req('/departments', { method:'POST', body: JSON.stringify({institution_id:inst.id,name:'Computer Science and Engineering',code:'CSE'}) });
    dept = r.body;
  }
  ok(dept?.id, 'Department ready');

  // Get or create a subject in this dept
  let { body: subjects } = await req(`/subjects?department_id=${dept.id}`);
  let subj1 = subjects.find(s => s.code === 'CS301');
  if (!subj1) {
    const r = await req('/subjects', { method:'POST', body: JSON.stringify({
      department_id: dept.id, code:'CS301', name:'Database Management Systems',
      type:'THEORY', periods_per_week:4, duration:1
    }) });
    subj1 = r.body;
  }
  let subj2 = subjects.find(s => s.code === 'CS302L');
  if (!subj2) {
    const r = await req('/subjects', { method:'POST', body: JSON.stringify({
      department_id: dept.id, code:'CS302L', name:'DBMS Lab',
      type:'LAB', periods_per_week:3, duration:3
    }) });
    subj2 = r.body;
  }
  ok(subj1?.id && subj2?.id, 'Subjects ready');

  // Clean slate for faculty tests
  await pool.query('DELETE FROM faculty_subjects');
  await pool.query('DELETE FROM faculty WHERE department_id = ?', [dept.id]);

  // ─── Test 1: Create Faculty ───
  console.log('\n─── Test 1: Create Faculty ───');
  const t1 = await req('/faculty', { method:'POST', body: JSON.stringify({
    department_id: dept.id,
    faculty_code: 'FAC001',
    name: 'Dr. Ramesh Kumar',
    email: 'ramesh.kumar@tit.edu',
    phone: '9876543210',
    max_periods_per_day: 4,
    max_periods_per_week: 20,
    is_active: true,
  }) });
  ok(t1.status === 201, 'Faculty created (201)');
  ok(t1.body.faculty_code === 'FAC001', 'Faculty code correct');
  ok(t1.body.is_active === true, 'Faculty created as active');
  const fac1Id = t1.body.id;

  // Create a second faculty for mapping tests
  const t1b = await req('/faculty', { method:'POST', body: JSON.stringify({
    department_id: dept.id,
    faculty_code: 'FAC002',
    name: 'Prof. Anitha Rao',
    email: 'anitha.rao@tit.edu',
    max_periods_per_day: 3,
    max_periods_per_week: 15,
  }) });
  ok(t1b.status === 201, 'Second faculty created');
  const fac2Id = t1b.body.id;

  // ─── Test 2: Edit Faculty ───
  console.log('\n─── Test 2: Edit Faculty ───');
  const t2 = await req(`/faculty/${fac1Id}`, { method:'PUT', body: JSON.stringify({
    name: 'Dr. Ramesh Kumar (Updated)',
    max_periods_per_day: 5,
    max_periods_per_week: 25,
  }) });
  ok(t2.status === 200, 'Faculty updated (200)');
  ok(t2.body.faculty.name === 'Dr. Ramesh Kumar (Updated)', 'Name updated correctly');
  ok(t2.body.faculty.max_periods_per_day === 5, 'Max periods per day updated');

  // ─── Test 3: Deactivate Faculty ───
  console.log('\n─── Test 3: Deactivate Faculty ───');
  const t3 = await req(`/faculty/${fac1Id}`, { method:'PUT', body: JSON.stringify({ is_active: false }) });
  ok(t3.status === 200, 'Faculty deactivated (200)');
  ok(t3.body.faculty.is_active === false, 'Faculty is_active = false');

  // Reactivate
  await req(`/faculty/${fac1Id}`, { method:'PUT', body: JSON.stringify({ is_active: true }) });

  // ─── Test 4: Assign Subjects ───
  console.log('\n─── Test 4: Assign Subjects to Faculty ───');
  const t4a = await req('/faculty-subjects', { method:'POST', body: JSON.stringify({ faculty_id: fac1Id, subject_id: subj1.id }) });
  ok(t4a.status === 201, 'Theory subject assigned to faculty (201)');

  const t4b = await req('/faculty-subjects', { method:'POST', body: JSON.stringify({ faculty_id: fac1Id, subject_id: subj2.id }) });
  ok(t4b.status === 201, 'Lab subject assigned to faculty (201)');

  const t4c = await req(`/faculty-subjects?faculty_id=${fac1Id}`);
  ok(t4c.status === 200 && t4c.body.length === 2, 'Retrieved 2 mapped subjects for faculty');

  // ─── Test 5: Remove Subject Mapping ───
  console.log('\n─── Test 5: Remove Subject Mapping ───');
  const t5 = await req(`/faculty-subjects/${fac1Id}/${subj2.id}`, { method:'DELETE' });
  ok(t5.status === 200, 'Lab subject unassigned from faculty (200)');

  const t5b = await req(`/faculty-subjects?faculty_id=${fac1Id}`);
  ok(t5b.body.length === 1, 'Only 1 subject remains after removal');

  // ─── Test 6: Duplicate Faculty Code ───
  console.log('\n─── Test 6: Duplicate Faculty Code ───');
  const t6 = await req('/faculty', { method:'POST', body: JSON.stringify({
    department_id: dept.id, faculty_code: 'FAC001', name: 'Duplicate Code',
    email: 'unique.email@tit.edu', max_periods_per_day: 4, max_periods_per_week: 20,
  }) });
  ok(t6.status === 400, 'Duplicate faculty_code rejected (400)');

  // ─── Test 7: Duplicate Email ───
  console.log('\n─── Test 7: Duplicate Email ───');
  const t7 = await req('/faculty', { method:'POST', body: JSON.stringify({
    department_id: dept.id, faculty_code: 'FAC999', name: 'Dup Email',
    email: 'ramesh.kumar@tit.edu', max_periods_per_day: 4, max_periods_per_week: 20,
  }) });
  ok(t7.status === 400, 'Duplicate email rejected (400)');

  // ─── Test 8: Duplicate Subject Mapping ───
  console.log('\n─── Test 8: Duplicate Subject Mapping ───');
  const t8 = await req('/faculty-subjects', { method:'POST', body: JSON.stringify({ faculty_id: fac1Id, subject_id: subj1.id }) });
  ok(t8.status === 400, 'Duplicate faculty-subject mapping rejected (400)');

  // ─── Test 9: Invalid Workload ───
  console.log('\n─── Test 9: Invalid Workload Values ───');
  const t9a = await req('/faculty', { method:'POST', body: JSON.stringify({
    department_id: dept.id, faculty_code: 'FAC_BAD1', name: 'Bad Workload',
    email: 'bad1@tit.edu', max_periods_per_day: 0, max_periods_per_week: 20,
  }) });
  ok(t9a.status === 400, 'max_periods_per_day = 0 rejected (400)');

  const t9b = await req('/faculty', { method:'POST', body: JSON.stringify({
    department_id: dept.id, faculty_code: 'FAC_BAD2', name: 'Bad Workload 2',
    email: 'bad2@tit.edu', max_periods_per_day: 10, max_periods_per_week: 5,
  }) });
  ok(t9b.status === 400, 'max_periods_per_week < max_periods_per_day rejected (400)');

  // ─── Test 10: Invalid Department / Cross-Department Subject ───
  console.log('\n─── Test 10: Invalid FK and Cross-Dept Subject ───');
  const t10a = await req('/faculty', { method:'POST', body: JSON.stringify({
    department_id: 999999, faculty_code: 'FAC_FAKE', name: 'Fake Dept',
    email: 'fake@tit.edu', max_periods_per_day: 4, max_periods_per_week: 20,
  }) });
  ok(t10a.status === 400, 'Non-existent department_id rejected (400)');

  // Create a subject in a DIFFERENT department to test cross-dept block
  let dept2;
  let { body: depts2 } = await req(`/departments?institution_id=${inst.id}`);
  dept2 = depts2.find(d => d.code === 'ECE');
  if (!dept2) {
    const r = await req('/departments', { method:'POST', body: JSON.stringify({institution_id:inst.id,name:'Electronics & Communication',code:'ECE'}) });
    dept2 = r.body;
  }
  let { body: ece_subjs } = await req(`/subjects?department_id=${dept2.id}`);
  let eceSubj = ece_subjs.find(s => s.code === 'EC101');
  if (!eceSubj) {
    const r = await req('/subjects', { method:'POST', body: JSON.stringify({
      department_id: dept2.id, code:'EC101', name:'Circuits Theory',
      type:'THEORY', periods_per_week:3, duration:1
    }) });
    eceSubj = r.body;
  }

  const t10b = await req('/faculty-subjects', { method:'POST', body: JSON.stringify({ faculty_id: fac1Id, subject_id: eceSubj.id }) });
  ok(t10b.status === 400, 'Cross-department subject assignment rejected (400)');

  // ─── Test 11: Database Persistence ───
  console.log('\n─── Test 11: Verify DB Persistence ───');
  const [dbFac] = await pool.query('SELECT * FROM faculty WHERE id = ?', [fac1Id]);
  ok(dbFac.length === 1 && dbFac[0].name === 'Dr. Ramesh Kumar (Updated)', 'Faculty record persists in MySQL');

  const [dbMap] = await pool.query('SELECT * FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?', [fac1Id, subj1.id]);
  ok(dbMap.length === 1, 'Faculty-subject mapping persists in MySQL');

  // ─── Test 12: Phase 1–3 Still Works ───
  console.log('\n─── Test 12: Phase 1–3 Regression Check ───');
  const r12a = await req('/institutions');
  ok(r12a.status === 200 && Array.isArray(r12a.body), 'GET /institutions still works');

  const r12b = await req(`/departments?institution_id=${inst.id}`);
  ok(r12b.status === 200 && Array.isArray(r12b.body), 'GET /departments still works');

  const r12c = await req(`/academic-years?institution_id=${inst.id}`);
  ok(r12c.status === 200 && Array.isArray(r12c.body), 'GET /academic-years still works');

  const r12d = await req(`/classes`);
  ok(r12d.status === 200 && Array.isArray(r12d.body), 'GET /classes still works');

  const r12e = await req(`/subjects`);
  ok(r12e.status === 200 && Array.isArray(r12e.body), 'GET /subjects still works');

  const r12f = await req(`/class-subjects`);
  ok(r12f.status === 200 && Array.isArray(r12f.body), 'GET /class-subjects still works');

  console.log('\n══════════════════════════════════════════════════');
  console.log('   ALL 12 PHASE 4 TESTS PASSED ✅');
  console.log('══════════════════════════════════════════════════\n');
  process.exit(0);
}

run().catch(err => { console.error('Test suite failed:', err); process.exit(1); });
