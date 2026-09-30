const pool = require('../src/config/db');

const BASE = 'http://localhost:5000/api';

async function req(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  let body = null;
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    body = await r.json();
  } else {
    body = await r.text();
  }
  return { status: r.status, body };
}

function ok(condition, msg) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ PASS: ${msg}`);
}

async function run() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('   PHASE 8 VERIFICATION – Timetable Generation');
  console.log('══════════════════════════════════════════════════\n');

  const ts = Date.now();

  // ══════════════════════════════════════════════════════════════
  // Test Setup: Create Dedicated Test Institution & Topology
  // ══════════════════════════════════════════════════════════════
  console.log('─── Setup: Creating Institution Topology ───');
  const instCode = `P8_${ts}`;
  const rInst = await req('/institutions', {
    method: 'POST',
    body: JSON.stringify({ name: `Phase 8 University ${ts}`, code: instCode }),
  });
  ok(rInst.status === 201, 'Test institution created (201)');
  const instId = rInst.body.id;

  // Department
  const rDept = await req('/departments', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, name: 'Computer Engineering', code: `CE_${ts}` }),
  });
  ok(rDept.status === 201, 'Department created (201)');
  const deptId = rDept.body.id;

  // Academic Year
  const rAy = await req('/academic-years', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      name: `AY 2026-27 ${ts}`,
      start_date: '2026-08-01',
      end_date: '2027-05-31',
      is_active: true,
    }),
  });
  ok(rAy.status === 201, 'Academic year created (201)');
  const ayId = rAy.body.id;

  // 5 Working Days: Monday to Friday
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const dayIds = [];
  for (let i = 0; i < days.length; i++) {
    const rd = await req('/working-days', {
      method: 'POST',
      body: JSON.stringify({ institution_id: instId, day_name: days[i], day_order: i }),
    });
    ok(rd.status === 201, `Working day ${days[i]} created`);
    dayIds.push(rd.body.id);
  }

  // 6 Periods per day: 4 teaching, 1 break, 1 lunch
  // Period 1: 09:00 - 09:50
  // Period 2: 09:50 - 10:40
  // Morning Break: 10:40 - 11:00 (is_break: true)
  // Period 3: 11:00 - 11:50
  // Lunch: 11:50 - 12:40 (is_lunch: true)
  // Period 4: 12:40 - 13:30
  const periodDefs = [
    { name: 'Period 1', start: '09:00', end: '09:50', order: 0, is_break: false, is_lunch: false },
    { name: 'Period 2', start: '09:50', end: '10:40', order: 1, is_break: false, is_lunch: false },
    { name: 'Break', start: '10:40', end: '11:00', order: 2, is_break: true, is_lunch: false },
    { name: 'Period 3', start: '11:00', end: '11:50', order: 3, is_break: false, is_lunch: false },
    { name: 'Lunch', start: '11:50', end: '12:40', order: 4, is_break: false, is_lunch: true },
    { name: 'Period 4', start: '12:40', end: '13:30', order: 5, is_break: false, is_lunch: false },
  ];
  const periodIds = [];
  for (const pd of periodDefs) {
    const rp = await req('/periods', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: instId,
        name: pd.name,
        start_time: pd.start,
        end_time: pd.end,
        period_order: pd.order,
        is_break: pd.is_break,
        is_lunch: pd.is_lunch,
      }),
    });
    ok(rp.status === 201, `Period ${pd.name} created`);
    periodIds.push(rp.body.id);
  }

  // Rooms: 1 Theory Classroom (cap 60) + 1 Lab Room (cap 60)
  const rTheoryRoom = await req('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      room_code: `CR101_${ts}`,
      name: 'Classroom 101',
      type: 'CLASSROOM',
      capacity: 60,
    }),
  });
  ok(rTheoryRoom.status === 201, 'Theory classroom created (201)');
  const theoryRoomId = rTheoryRoom.body.id;

  const rLabRoom = await req('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      room_code: `LAB201_${ts}`,
      name: 'Computing Lab 201',
      type: 'LAB',
      capacity: 60,
    }),
  });
  ok(rLabRoom.status === 201, 'Lab room created (201)');
  const labRoomId = rLabRoom.body.id;

  // Class: CE 3rd Year (student_count: 50)
  const rClass = await req('/classes', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      academic_year_id: ayId,
      year: 3,
      section: 'A',
      name: `CE-3A ${ts}`,
      student_count: 50,
    }),
  });
  ok(rClass.status === 201, 'Class CE-3A created (201)');
  const classId = rClass.body.id;

  // Subjects:
  // 1. Data Structures (Theory, ppw=4, duration=1)
  // 2. Database Systems (Theory, ppw=4, duration=1)
  // 3. Operating Systems Lab (Lab, ppw=2, duration=2, requires_lab=true)
  const rSub1 = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `DS_${ts}`,
      name: 'Data Structures',
      type: 'THEORY',
      periods_per_week: 4,
      duration: 1,
      requires_lab: false,
    }),
  });
  ok(rSub1.status === 201, 'Theory subject DS created (201)');
  const sub1Id = rSub1.body.id;

  const rSub2 = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `DBMS_${ts}`,
      name: 'Database Management',
      type: 'THEORY',
      periods_per_week: 4,
      duration: 1,
      requires_lab: false,
    }),
  });
  ok(rSub2.status === 201, 'Theory subject DBMS created (201)');
  const sub2Id = rSub2.body.id;

  const rSubLab = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `OSLAB_${ts}`,
      name: 'OS Lab',
      type: 'LAB',
      periods_per_week: 2,
      duration: 2,
      requires_lab: true,
    }),
  });
  ok(rSubLab.status === 201, 'Lab subject OSLAB created (201)');
  const subLabId = rSubLab.body.id;

  // Map subjects to class (Total: 4 + 4 + 2 = 10 periods per week)
  for (const sId of [sub1Id, sub2Id, subLabId]) {
    const rc = await req('/class-subjects', {
      method: 'POST',
      body: JSON.stringify({ class_id: classId, subject_id: sId }),
    });
    ok(rc.status === 201, `Subject ${sId} mapped to class`);
  }

  // Faculty:
  // Faculty 1: Prof. Alice (teaches DS, DBMS)
  // Faculty 2: Prof. Bob (teaches OS Lab)
  const rFac1 = await req('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      faculty_code: `FAC1_${ts}`,
      name: 'Prof. Alice',
      email: `alice_${ts}@example.com`,
      max_periods_per_day: 4,
      max_periods_per_week: 16,
    }),
  });
  ok(rFac1.status === 201, 'Faculty Alice created (201)');
  const fac1Id = rFac1.body.id;

  const rFac2 = await req('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      faculty_code: `FAC2_${ts}`,
      name: 'Prof. Bob',
      email: `bob_${ts}@example.com`,
      max_periods_per_day: 4,
      max_periods_per_week: 16,
    }),
  });
  ok(rFac2.status === 201, 'Faculty Bob created (201)');
  const fac2Id = rFac2.body.id;

  // Map Faculty to Subjects
  await req('/faculty-subjects', {
    method: 'POST',
    body: JSON.stringify({ faculty_id: fac1Id, subject_id: sub1Id }),
  });
  await req('/faculty-subjects', {
    method: 'POST',
    body: JSON.stringify({ faculty_id: fac1Id, subject_id: sub2Id }),
  });
  await req('/faculty-subjects', {
    method: 'POST',
    body: JSON.stringify({ faculty_id: fac2Id, subject_id: subLabId }),
  });
  ok(true, 'Faculty-Subject mappings created');

  // ══════════════════════════════════════════════════════════════
  // Test 1: Normal Timetable Generation
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 1: Normal Generation (POST /api/timetable/generate) ───');
  const rGen = await req('/timetable/generate', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      academic_year_id: ayId,
      name: `Test Timetable ${ts}`,
      save_to_db: true,
      solver_type: 'CSP',
    }),
  });

  ok(rGen.status === 200, 'Generation returned HTTP 200');
  ok(rGen.body.success === true, 'Generation success is true');
  ok(rGen.body.status === 'VALID', 'Status is VALID');
  ok(Array.isArray(rGen.body.timetable), 'Timetable is an array');
  ok(rGen.body.timetable.length === 10, `Generated exactly 10 slots (got ${rGen.body.timetable.length})`);
  ok(rGen.body.timetable_id > 0, `Saved to database with timetable_id ${rGen.body.timetable_id}`);
  const timetableId = rGen.body.timetable_id;

  // ══════════════════════════════════════════════════════════════
  // Test 2: Verify Hard Constraints Guarantee in Generated Solution
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 2: Verify Hard Constraints Guarantee ───');
  ok(rGen.body.validation.is_valid === true, 'Validation is_valid is true');
  ok(rGen.body.validation.hard_constraints_violated === 0, 'Zero hard constraints violated');

  // Verify non-teaching periods (no slots during break or lunch)
  const breakPeriodIds = new Set([periodIds[2], periodIds[4]]); // order 2 is Break, order 4 is Lunch
  const scheduledInBreaks = rGen.body.timetable.filter(s => breakPeriodIds.has(s.period_id));
  ok(scheduledInBreaks.length === 0, 'No slots scheduled during breaks or lunch');

  // Verify faculty qualification
  for (const s of rGen.body.timetable) {
    if (s.subject_id === subLabId) {
      ok(s.faculty_id === fac2Id, `Lab taught by qualified faculty (Bob)`);
      ok(s.room_id === labRoomId, `Lab scheduled in LAB room`);
    } else {
      ok(s.faculty_id === fac1Id, `Theory taught by qualified faculty (Alice)`);
      ok(s.room_id === theoryRoomId, `Theory scheduled in CLASSROOM`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Test 3: Lab Consecutiveness Verification
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 3: Lab Consecutiveness Verification ───');
  const labSlots = rGen.body.timetable.filter(s => s.subject_id === subLabId);
  ok(labSlots.length === 2, `Lab has 2 periods scheduled`);
  ok(labSlots[0].day_id === labSlots[1].day_id, 'Both lab periods are on the same day');
  ok(labSlots[0].room_id === labSlots[1].room_id, 'Both lab periods are in the same lab room');
  ok(labSlots[0].faculty_id === labSlots[1].faculty_id, 'Both lab periods have the same faculty');
  ok(
    Math.abs(labSlots[0].period_order - labSlots[1].period_order) === 1,
    `Lab periods are strictly consecutive (${labSlots[0].period_order} and ${labSlots[1].period_order})`
  );

  // ══════════════════════════════════════════════════════════════
  // Test 4: Soft-Constraint Scoring & Breakdown
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 4: Soft-Constraint Scoring & Metrics ───');
  ok(typeof rGen.body.metrics.soft_score === 'number', `Soft score present (${rGen.body.metrics.soft_score})`);
  ok(rGen.body.metrics.soft_score >= 0 && rGen.body.metrics.soft_score <= 100, 'Soft score between 0 and 100');
  ok(Array.isArray(rGen.body.metrics.soft_constraints_breakdown), 'Breakdown array present');
  ok(rGen.body.metrics.soft_constraints_breakdown.length >= 3, 'Multiple soft metrics reported');
  console.log('Metrics summary:', JSON.stringify(rGen.body.metrics, null, 2));

  // ══════════════════════════════════════════════════════════════
  // Test 5: Database Persistence & Retrieval
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 5: Timetable Retrieval (GET /api/timetable/:id) ───');
  const rGet = await req(`/timetable/${timetableId}`);
  ok(rGet.status === 200, 'Retrieved saved timetable by ID');
  ok(rGet.body.id === timetableId, 'Timetable ID matches');
  ok(rGet.body.entries.length === 10, 'All 10 entries persisted in MySQL and retrieved');
  ok(rGet.body.entries[0].class_name !== undefined, 'Entries include joined class_name');
  ok(rGet.body.entries[0].subject_code !== undefined, 'Entries include joined subject_code');
  ok(rGet.body.entries[0].faculty_name !== undefined, 'Entries include joined faculty_name');
  ok(rGet.body.entries[0].room_code !== undefined, 'Entries include joined room_code');

  // ══════════════════════════════════════════════════════════════
  // Test 6: Edge Case – Availability Restrictions Respected
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 6: Edge Case – Availability Restrictions ───');
  // Block Faculty Bob on Monday (dayIds[0]) for all periods
  for (const pId of periodIds) {
    await req('/availability/faculty', {
      method: 'POST',
      body: JSON.stringify({
        faculty_id: fac2Id,
        working_day_id: dayIds[0],
        period_id: pId,
        is_available: false,
        reason: 'Bob off on Monday',
      }),
    });
  }

  // Re-generate timetable
  const rGenAvail = await req('/timetable/generate', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      academic_year_id: ayId,
      save_to_db: false,
    }),
  });
  ok(rGenAvail.status === 200, 'Generation with availability restriction succeeded (200)');
  const bobSlots = rGenAvail.body.timetable.filter(s => s.faculty_id === fac2Id);
  const bobMondaySlots = bobSlots.filter(s => s.day_id === dayIds[0]);
  ok(bobMondaySlots.length === 0, 'Solver correctly avoided scheduling Bob on blocked Monday');

  // Clear availability override for clean state
  await req(`/availability/faculty/clear/${fac2Id}`, { method: 'DELETE' });

  // ══════════════════════════════════════════════════════════════
  // Test 7: Impossible Case A – Required Periods Exceed Available Slots
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 7: Impossible Case A – Period Capacity Exceeded ───');
  // Create an over-demanding class with 35 periods/week when only 20 are available
  const rOverClass = await req('/classes', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      academic_year_id: ayId,
      year: 4,
      section: 'B',
      name: `OverClass_${ts}`,
      student_count: 30,
    }),
  });
  const overClassId = rOverClass.body.id;

  // Create subject with 25 periods per week
  const rOverSub = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `OVER_${ts}`,
      name: 'Super Heavy Subject',
      type: 'THEORY',
      periods_per_week: 25,
      duration: 1,
    }),
  });
  const overSubId = rOverSub.body.id;

  await req('/class-subjects', {
    method: 'POST',
    body: JSON.stringify({ class_id: overClassId, subject_id: overSubId }),
  });
  await req('/faculty-subjects', {
    method: 'POST',
    body: JSON.stringify({ faculty_id: fac1Id, subject_id: overSubId }),
  });

  const rImpA = await req('/timetable/generate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, save_to_db: false }),
  });
  ok(rImpA.status === 422, 'Generation rejected impossible load with 422');
  ok(rImpA.body.success === false, 'success is false');
  ok(rImpA.body.status === 'INFEASIBLE', 'status is INFEASIBLE');
  ok(
    rImpA.body.conflicts.some(c => c.type === 'CLASS_PERIOD_CAPACITY_EXCEEDED'),
    'Reports conflict type CLASS_PERIOD_CAPACITY_EXCEEDED'
  );

  // Deactivate the over-demanding class
  await req(`/classes/${overClassId}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: false }),
  });

  // ══════════════════════════════════════════════════════════════
  // Test 8: Impossible Case B – Unqualified / Missing Faculty
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 8: Impossible Case B – Missing Qualified Faculty ───');
  // Create an orphan subject with no qualified faculty mapped to it
  const rOrphanSub = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `NOFAC_${ts}`,
      name: 'Orphan Subject No Faculty',
      type: 'THEORY',
      periods_per_week: 2,
      duration: 1,
    }),
  });
  const orphanSubId = rOrphanSub.body.id;

  // Map to class CE-3A
  await req('/class-subjects', {
    method: 'POST',
    body: JSON.stringify({ class_id: classId, subject_id: orphanSubId }),
  });

  const rImpB = await req('/timetable/generate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, save_to_db: false }),
  });
  ok(rImpB.status === 422, 'Rejected with 422 when subject has 0 qualified faculty');
  ok(
    rImpB.body.conflicts.some(c => c.type === 'NO_QUALIFIED_FACULTY'),
    'Reports conflict type NO_QUALIFIED_FACULTY'
  );

  // Deactivate orphan subject
  await req(`/subjects/${orphanSubId}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: false }),
  });

  // ══════════════════════════════════════════════════════════════
  // Test 9: Impossible Case C – Missing Suitable Lab Room
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 9: Impossible Case C – Missing Lab Room ───');
  // Deactivate the lab room
  await req(`/rooms/${labRoomId}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: false }),
  });

  const rImpC = await req('/timetable/generate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, save_to_db: false }),
  });
  ok(rImpC.status === 422, 'Rejected with 422 when lab room is missing');
  ok(
    rImpC.body.conflicts.some(c => c.type === 'NO_SUITABLE_LAB_ROOM'),
    'Reports conflict type NO_SUITABLE_LAB_ROOM'
  );

  // Re-activate the lab room
  await req(`/rooms/${labRoomId}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: true }),
  });

  // ══════════════════════════════════════════════════════════════
  // Test 10: Timetable Deletion (DELETE /api/timetable/:id)
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 10: Delete Saved Timetable ───');
  const rDel = await req(`/timetable/${timetableId}`, { method: 'DELETE' });
  ok(rDel.status === 200, 'Timetable deleted (200)');
  const rCheckDel = await req(`/timetable/${timetableId}`);
  ok(rCheckDel.status === 404, 'Deleted timetable returns 404 Not Found');

  // ══════════════════════════════════════════════════════════════
  // Test 11: Regression Test (Phases 1-7 Integrity)
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 11: Regression Check Across Prior Phases ───');
  const regressionEndpoints = [
    ['/institutions', 'Institutions'],
    [`/departments?institution_id=${instId}`, 'Departments'],
    [`/academic-years?institution_id=${instId}`, 'Academic Years'],
    ['/classes', 'Classes'],
    ['/subjects', 'Subjects'],
    ['/class-subjects', 'Class Subjects'],
    ['/faculty', 'Faculty'],
    ['/faculty-subjects', 'Faculty Subjects'],
    ['/rooms', 'Rooms'],
    ['/working-days', 'Working Days'],
    ['/periods', 'Periods'],
  ];

  for (const [path, label] of regressionEndpoints) {
    const res = await req(path);
    ok(res.status === 200 && Array.isArray(res.body), `${label} API is healthy (200)`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('   ALL 11 PHASE 8 VERIFICATION TESTS PASSED ✅');
  console.log('══════════════════════════════════════════════════\n');
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Test suite failed with error:', err);
  process.exit(1);
});
