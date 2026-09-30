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
  console.log('   PHASE 9 VERIFICATION – Viewer & Validator');
  console.log('══════════════════════════════════════════════════\n');

  const ts = Date.now();

  // ══════════════════════════════════════════════════════════════
  // Step 0: Setup Institution, Calendar, Classes, Subjects & Faculty
  // ══════════════════════════════════════════════════════════════
  console.log('─── Step 0: Setup Institution Environment ───');
  const rInst = await req('/institutions', {
    method: 'POST',
    body: JSON.stringify({ name: `Phase 9 Tech Inst ${ts}`, code: `P9_${ts}` }),
  });
  ok(rInst.status === 201, 'Test institution created');
  const instId = rInst.body.id;

  const rDept = await req('/departments', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, name: 'Software Engineering', code: `SE_${ts}` }),
  });
  ok(rDept.status === 201, 'Department created');
  const deptId = rDept.body.id;

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
  ok(rAy.status === 201, 'Academic year created');
  const ayId = rAy.body.id;

  // Working days (Monday to Friday)
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const dayIds = [];
  for (let i = 0; i < days.length; i++) {
    const rd = await req('/working-days', {
      method: 'POST',
      body: JSON.stringify({ institution_id: instId, day_name: days[i], day_order: i }),
    });
    dayIds.push(rd.body.id);
  }
  ok(dayIds.length === 5, '5 working days created');

  // Periods: 4 teaching periods, 1 break, 1 lunch
  const periodsConfig = [
    { name: 'P1', start: '09:00', end: '09:50', order: 0, is_break: false, is_lunch: false },
    { name: 'P2', start: '09:50', end: '10:40', order: 1, is_break: false, is_lunch: false },
    { name: 'Morning Break', start: '10:40', end: '11:00', order: 2, is_break: true, is_lunch: false },
    { name: 'P3', start: '11:00', end: '11:50', order: 3, is_break: false, is_lunch: false },
    { name: 'Lunch Break', start: '11:50', end: '12:40', order: 4, is_break: false, is_lunch: true },
    { name: 'P4', start: '12:40', end: '13:30', order: 5, is_break: false, is_lunch: false },
  ];
  const periodIds = [];
  for (const pc of periodsConfig) {
    const rp = await req('/periods', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: instId,
        name: pc.name,
        start_time: pc.start,
        end_time: pc.end,
        period_order: pc.order,
        is_break: pc.is_break,
        is_lunch: pc.is_lunch,
      }),
    });
    periodIds.push(rp.body.id);
  }
  ok(periodIds.length === 6, '6 periods created (including break & lunch)');

  // Rooms: Theory room (cap 60) + Small room (cap 20) + Lab room (cap 60)
  const rTheory = await req('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      room_code: `R101_${ts}`,
      name: 'Classroom 101',
      type: 'CLASSROOM',
      capacity: 60,
    }),
  });
  const theoryRoomId = rTheory.body.id;

  const rSmallRoom = await req('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      room_code: `SM20_${ts}`,
      name: 'Small Seminar Room',
      type: 'CLASSROOM',
      capacity: 20,
    }),
  });
  const smallRoomId = rSmallRoom.body.id;

  const rLab = await req('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      room_code: `LAB1_${ts}`,
      name: 'Software Lab 1',
      type: 'LAB',
      capacity: 60,
    }),
  });
  const labRoomId = rLab.body.id;
  ok(theoryRoomId && smallRoomId && labRoomId, 'Rooms created (Theory, Small, Lab)');

  // Classes: SE-1A (student_count: 50)
  const rClass = await req('/classes', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      academic_year_id: ayId,
      year: 2,
      section: 'A',
      name: `SE-2A ${ts}`,
      student_count: 50,
    }),
  });
  const classId = rClass.body.id;

  // Class 2: SE-2B (student_count: 45)
  const rClass2 = await req('/classes', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      academic_year_id: ayId,
      year: 2,
      section: 'B',
      name: `SE-2B ${ts}`,
      student_count: 45,
    }),
  });
  const class2Id = rClass2.body.id;

  // Subjects:
  // Sub1: Algorithms (Theory, ppw=4, duration=1)
  // Sub2: Web Dev Lab (Lab, ppw=2, duration=2, requires_lab=true)
  const rSub1 = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `ALGO_${ts}`,
      name: 'Algorithms',
      type: 'THEORY',
      periods_per_week: 4,
      duration: 1,
    }),
  });
  const sub1Id = rSub1.body.id;

  const rSubLab = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `WEBLAB_${ts}`,
      name: 'Web Engineering Lab',
      type: 'LAB',
      periods_per_week: 2,
      duration: 2,
      requires_lab: true,
    }),
  });
  const subLabId = rSubLab.body.id;

  // Map to class 1
  await req('/class-subjects', { method: 'POST', body: JSON.stringify({ class_id: classId, subject_id: sub1Id }) });
  await req('/class-subjects', { method: 'POST', body: JSON.stringify({ class_id: classId, subject_id: subLabId }) });

  // Faculty: Prof. David (Algo), Prof. Eva (Web Lab), Prof. Frank (Unmapped)
  const rFac1 = await req('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      faculty_code: `D_${ts}`,
      name: 'Prof. David',
      email: `david_${ts}@example.com`,
      max_periods_per_day: 4,
      max_periods_per_week: 16,
    }),
  });
  const fac1Id = rFac1.body.id;

  const rFac2 = await req('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      faculty_code: `E_${ts}`,
      name: 'Prof. Eva',
      email: `eva_${ts}@example.com`,
      max_periods_per_day: 4,
      max_periods_per_week: 16,
    }),
  });
  const fac2Id = rFac2.body.id;

  const rFacUnqualified = await req('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      faculty_code: `F_${ts}`,
      name: 'Prof. Frank',
      email: `frank_${ts}@example.com`,
      max_periods_per_day: 4,
      max_periods_per_week: 16,
    }),
  });
  const facUnqualifiedId = rFacUnqualified.body.id;

  // Map David -> Algo, Eva -> Web Lab (Frank left unmapped)
  await req('/faculty-subjects', { method: 'POST', body: JSON.stringify({ faculty_id: fac1Id, subject_id: sub1Id }) });
  await req('/faculty-subjects', { method: 'POST', body: JSON.stringify({ faculty_id: fac2Id, subject_id: subLabId }) });
  ok(true, 'Faculty qualifications mapped');

  // Generate a valid timetable for testing
  const rGen = await req('/timetable/generate', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      academic_year_id: ayId,
      name: `Valid P9 Timetable ${ts}`,
      save_to_db: true,
    }),
  });
  ok(rGen.status === 200 && rGen.body.success, 'Valid base timetable generated');
  const timetableId = rGen.body.timetable_id;
  const validSlots = rGen.body.timetable;

  // ══════════════════════════════════════════════════════════════
  // Test 1: Independent Validation of Valid Timetable by ID
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 1: Validate Saved Timetable (POST /api/timetable/validate by ID) ───');
  const rVal1 = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ timetable_id: timetableId }),
  });
  ok(rVal1.status === 200, 'Validation endpoint returned HTTP 200');
  ok(rVal1.body.is_valid === true, 'is_valid is TRUE');
  ok(rVal1.body.status === 'VALID', 'status is VALID');
  ok(rVal1.body.hard_constraints_violated === 0, 'hard_constraints_violated is 0');
  ok(Array.isArray(rVal1.body.violations) && rVal1.body.violations.length === 0, '0 violations reported');
  ok(rVal1.body.total_slots === 6, `Total slots validated matches (got ${rVal1.body.total_slots})`);
  ok(typeof rVal1.body.soft_score === 'number', `Soft score reported: ${rVal1.body.soft_score}`);

  // ══════════════════════════════════════════════════════════════
  // Test 2: Conflict Detection – Faculty Clash
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 2: Detect Faculty Clash ───');
  // Copy valid slots and duplicate faculty assignment at same day & period
  const clashSlotsFac = JSON.parse(JSON.stringify(validSlots));
  clashSlotsFac.push({
    class_id: class2Id,
    subject_id: sub1Id,
    faculty_id: clashSlotsFac[0].faculty_id, // Same faculty
    room_id: smallRoomId,
    day_id: clashSlotsFac[0].day_id,        // Same day
    period_id: clashSlotsFac[0].period_id,  // Same period
  });

  const rValClashFac = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, timetable: clashSlotsFac }),
  });
  ok(rValClashFac.status === 200, 'Validator responded');
  ok(rValClashFac.body.is_valid === false, 'is_valid is FALSE');
  ok(
    rValClashFac.body.violations.some(v => v.type === 'FACULTY_CLASH'),
    'Correctly detected FACULTY_CLASH violation'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 3: Conflict Detection – Class Clash
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 3: Detect Class Clash ───');
  const clashSlotsClass = JSON.parse(JSON.stringify(validSlots));
  clashSlotsClass.push({
    class_id: clashSlotsClass[0].class_id,   // Same class
    subject_id: sub1Id,
    faculty_id: fac2Id,
    room_id: labRoomId,
    day_id: clashSlotsClass[0].day_id,       // Same day
    period_id: clashSlotsClass[0].period_id, // Same period
  });

  const rValClashClass = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, timetable: clashSlotsClass }),
  });
  ok(rValClashClass.body.is_valid === false, 'is_valid is FALSE');
  ok(
    rValClashClass.body.violations.some(v => v.type === 'CLASS_CLASH'),
    'Correctly detected CLASS_CLASH violation'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 4: Conflict Detection – Room Clash
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 4: Detect Room Clash ───');
  const clashSlotsRoom = JSON.parse(JSON.stringify(validSlots));
  clashSlotsRoom.push({
    class_id: class2Id,
    subject_id: sub1Id,
    faculty_id: fac2Id,
    room_id: clashSlotsRoom[0].room_id,     // Same room
    day_id: clashSlotsRoom[0].day_id,       // Same day
    period_id: clashSlotsRoom[0].period_id, // Same period
  });

  const rValClashRoom = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, timetable: clashSlotsRoom }),
  });
  ok(rValClashRoom.body.is_valid === false, 'is_valid is FALSE');
  ok(
    rValClashRoom.body.violations.some(v => v.type === 'ROOM_CLASH'),
    'Correctly detected ROOM_CLASH violation'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 5: Conflict Detection – Unqualified Faculty
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 5: Detect Unqualified Faculty ───');
  const unqualSlots = JSON.parse(JSON.stringify(validSlots));
  unqualSlots[0].faculty_id = facUnqualifiedId; // Frank is not mapped to Algo

  const rValUnqual = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, timetable: unqualSlots }),
  });
  ok(rValUnqual.body.is_valid === false, 'is_valid is FALSE');
  ok(
    rValUnqual.body.violations.some(v => v.type === 'UNQUALIFIED_FACULTY'),
    'Correctly detected UNQUALIFIED_FACULTY violation'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 6: Conflict Detection – Room Type Mismatch (Lab in Classroom)
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 6: Detect Room Type Mismatch ───');
  const roomMismatchSlots = JSON.parse(JSON.stringify(validSlots));
  const labSlotIdx = roomMismatchSlots.findIndex(s => s.subject_id === subLabId);
  roomMismatchSlots[labSlotIdx].room_id = theoryRoomId; // Put Lab into CLASSROOM

  const rValRoomType = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, timetable: roomMismatchSlots }),
  });
  ok(rValRoomType.body.is_valid === false, 'is_valid is FALSE');
  ok(
    rValRoomType.body.violations.some(v => v.type === 'ROOM_TYPE_MISMATCH'),
    'Correctly detected ROOM_TYPE_MISMATCH violation'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 7: Conflict Detection – Room Capacity Exceeded
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 7: Detect Room Capacity Exceeded ───');
  const capSlots = JSON.parse(JSON.stringify(validSlots));
  capSlots[0].room_id = smallRoomId; // Room cap 20, Class student count 50

  const rValCap = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, timetable: capSlots }),
  });
  ok(rValCap.body.is_valid === false, 'is_valid is FALSE');
  ok(
    rValCap.body.violations.some(v => v.type === 'ROOM_CAPACITY_EXCEEDED'),
    'Correctly detected ROOM_CAPACITY_EXCEEDED violation'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 8: Conflict Detection – Non-Teaching Period Violation (Break/Lunch)
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 8: Detect Non-Teaching Period Violation ───');
  const breakSlots = JSON.parse(JSON.stringify(validSlots));
  breakSlots[0].period_id = periodIds[2]; // Morning Break (order 2)

  const rValBreak = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, timetable: breakSlots }),
  });
  ok(rValBreak.body.is_valid === false, 'is_valid is FALSE');
  ok(
    rValBreak.body.violations.some(v => v.type === 'NON_TEACHING_PERIOD_VIOLATION'),
    'Correctly detected NON_TEACHING_PERIOD_VIOLATION violation'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 9: Conflict Detection – Availability Conflict (Blocked Slot)
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 9: Detect Availability Conflict ───');
  // Block David on the exact day and period of his first assigned slot
  const targetSlot = validSlots.find(s => s.faculty_id === fac1Id);
  await req('/availability/faculty', {
    method: 'POST',
    body: JSON.stringify({
      faculty_id: fac1Id,
      working_day_id: targetSlot.day_id,
      period_id: targetSlot.period_id,
      is_available: false,
      reason: 'David conference',
    }),
  });

  const rValAvail = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ timetable_id: timetableId }),
  });
  ok(rValAvail.body.is_valid === false, 'is_valid is FALSE when slot is blocked');
  ok(
    rValAvail.body.violations.some(v => v.type === 'FACULTY_UNAVAILABLE'),
    'Correctly detected FACULTY_UNAVAILABLE violation'
  );

  // Clean up availability
  await req(`/availability/faculty/clear/${fac1Id}`, { method: 'DELETE' });

  // ══════════════════════════════════════════════════════════════
  // Test 10: Conflict Detection – Disconnected / Non-Consecutive Lab
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 10: Detect Disconnected Lab Periods ───');
  const nonConsecLabSlots = JSON.parse(JSON.stringify(validSlots));
  // Find the two lab slots
  const labIndices = [];
  nonConsecLabSlots.forEach((s, idx) => {
    if (s.subject_id === subLabId) labIndices.push(idx);
  });
  ok(labIndices.length === 2, 'Found 2 lab slots');

  // Move the second lab slot to a non-consecutive period (e.g. Period 4: periodIds[5])
  nonConsecLabSlots[labIndices[0]].period_id = periodIds[0]; // P1 (order 0)
  nonConsecLabSlots[labIndices[1]].period_id = periodIds[5]; // P4 (order 5)

  const rValLabConsec = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, timetable: nonConsecLabSlots }),
  });
  ok(rValLabConsec.body.is_valid === false, 'is_valid is FALSE for disconnected lab');
  ok(
    rValLabConsec.body.violations.some(v => v.type === 'LAB_CONSECUTIVE_VIOLATION'),
    'Correctly detected LAB_CONSECUTIVE_VIOLATION violation'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 11: Timetable Display & Filters API
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 11: Multi-Perspective Filters & Supporting Topology ───');
  // 1. Check supporting topology returned on GET /api/timetable/:id
  const rDetails = await req(`/timetable/${timetableId}`);
  ok(rDetails.status === 200, 'GET /api/timetable/:id returns 200');
  ok(Array.isArray(rDetails.body.working_days), 'working_days array returned');
  ok(Array.isArray(rDetails.body.periods), 'periods array returned');
  ok(Array.isArray(rDetails.body.departments), 'departments array returned');
  ok(Array.isArray(rDetails.body.classes), 'classes array returned');
  ok(Array.isArray(rDetails.body.faculty), 'faculty array returned');
  ok(Array.isArray(rDetails.body.rooms), 'rooms array returned');

  // Verify break/lunch details in periods
  const breakPeriod = rDetails.body.periods.find(p => p.is_break);
  ok(breakPeriod && breakPeriod.name === 'Morning Break', 'Morning Break marked with is_break: true');
  const lunchPeriod = rDetails.body.periods.find(p => p.is_lunch);
  ok(lunchPeriod && lunchPeriod.name === 'Lunch Break', 'Lunch Break marked with is_lunch: true');

  // 2. Class Filter
  const rFiltClass = await req(`/timetable/${timetableId}?class_id=${classId}`);
  ok(rFiltClass.body.entries.every(e => e.class_id === classId), 'Filter by class_id works');

  // 3. Faculty Filter
  const rFiltFac = await req(`/timetable/${timetableId}?faculty_id=${fac1Id}`);
  ok(rFiltFac.body.entries.every(e => e.faculty_id === fac1Id), 'Filter by faculty_id works');
  ok(rFiltFac.body.entries.length === 4, 'Prof. David has 4 assigned slots');

  // 4. Room Filter
  const rFiltRoom = await req(`/timetable/${timetableId}?room_id=${labRoomId}`);
  ok(rFiltRoom.body.entries.every(e => e.room_id === labRoomId), 'Filter by room_id works');
  ok(rFiltRoom.body.entries.length === 2, 'Lab room has 2 assigned periods');

  // 5. Day Filter
  const sampleDayId = validSlots[0].day_id;
  const rFiltDay = await req(`/timetable/${timetableId}?day_id=${sampleDayId}`);
  ok(rFiltDay.body.entries.every(e => e.day_id === sampleDayId), 'Filter by day_id works');

  // ══════════════════════════════════════════════════════════════
  // Test 12: Regression Across Prior Phases (1-8)
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 12: Regression Check Across Phases 1–8 ───');
  const endpoints = [
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
    ['/timetable', 'Timetables'],
  ];

  for (const [p, label] of endpoints) {
    const r = await req(p);
    ok(r.status === 200 && Array.isArray(r.body), `${label} API intact (200)`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('   ALL 12 PHASE 9 VERIFICATION TESTS PASSED ✅');
  console.log('══════════════════════════════════════════════════\n');
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Phase 9 Test suite failed:', err);
  process.exit(1);
});
