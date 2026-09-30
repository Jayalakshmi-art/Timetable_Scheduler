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
  console.log('   PHASE 10 VERIFICATION – AI Timetable Assistant');
  console.log('══════════════════════════════════════════════════\n');

  const ts = Date.now();

  // ══════════════════════════════════════════════════════════════
  // Step 0: Create dedicated institution, topology & base timetable
  // ══════════════════════════════════════════════════════════════
  console.log('─── Step 0: Setup Institution Environment ───');
  const rInst = await req('/institutions', {
    method: 'POST',
    body: JSON.stringify({ name: `AI Assistant Academy ${ts}`, code: `AIA_${ts}` }),
  });
  ok(rInst.status === 201, 'Test institution created');
  const instId = rInst.body.id;

  const rDept = await req('/departments', {
    method: 'POST',
    body: JSON.stringify({ institution_id: instId, name: 'Computer Science', code: `CS_${ts}` }),
  });
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
  const ayId = rAy.body.id;

  // 5 Working days
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const dayIds = [];
  for (let i = 0; i < dayNames.length; i++) {
    const rd = await req('/working-days', {
      method: 'POST',
      body: JSON.stringify({ institution_id: instId, day_name: dayNames[i], day_order: i }),
    });
    dayIds.push(rd.body.id);
  }

  // 6 Periods (including Break and Lunch)
  const periodConfigs = [
    { name: 'P1', start: '09:00', end: '09:50', order: 0, is_break: false, is_lunch: false },
    { name: 'P2', start: '09:50', end: '10:40', order: 1, is_break: false, is_lunch: false },
    { name: 'Break', start: '10:40', end: '11:00', order: 2, is_break: true, is_lunch: false },
    { name: 'P3', start: '11:00', end: '11:50', order: 3, is_break: false, is_lunch: false },
    { name: 'Lunch', start: '11:50', end: '12:40', order: 4, is_break: false, is_lunch: true },
    { name: 'P4', start: '12:40', end: '13:30', order: 5, is_break: false, is_lunch: false },
  ];
  const periodIds = [];
  for (const pc of periodConfigs) {
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

  // Rooms
  const rTheory = await req('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      room_code: `CR_${ts}`,
      name: 'Theory Room 1',
      type: 'CLASSROOM',
      capacity: 60,
    }),
  });
  const theoryRoomId = rTheory.body.id;

  const rLab = await req('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      room_code: `LAB_${ts}`,
      name: 'Computer Lab 1',
      type: 'LAB',
      capacity: 60,
    }),
  });
  const labRoomId = rLab.body.id;

  // Class
  const rClass = await req('/classes', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      academic_year_id: ayId,
      year: 3,
      section: 'A',
      name: `CS-3A ${ts}`,
      student_count: 50,
    }),
  });
  const classId = rClass.body.id;

  // Subjects: Java (ppw=3, dur=1), Python (ppw=2, dur=1)
  const rSub1 = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `JAVA_${ts}`,
      name: 'Java Programming',
      type: 'THEORY',
      periods_per_week: 3,
      duration: 1,
    }),
  });
  const javaSubId = rSub1.body.id;

  const rSub2 = await req('/subjects', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      code: `PYTHON_${ts}`,
      name: 'Python Programming',
      type: 'THEORY',
      periods_per_week: 2,
      duration: 1,
    }),
  });
  const pythonSubId = rSub2.body.id;

  await req('/class-subjects', { method: 'POST', body: JSON.stringify({ class_id: classId, subject_id: javaSubId }) });
  await req('/class-subjects', { method: 'POST', body: JSON.stringify({ class_id: classId, subject_id: pythonSubId }) });

  // Faculty: Prof. Alan (teaches Java), Prof. Grace (teaches Python)
  const rFac1 = await req('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      faculty_code: `ALAN_${ts}`,
      name: 'Prof. Alan Turing',
      email: `alan_${ts}@example.com`,
      max_periods_per_day: 4,
      max_periods_per_week: 16,
    }),
  });
  const alanId = rFac1.body.id;

  const rFac2 = await req('/faculty', {
    method: 'POST',
    body: JSON.stringify({
      department_id: deptId,
      faculty_code: `GRACE_${ts}`,
      name: 'Prof. Grace Hopper',
      email: `grace_${ts}@example.com`,
      max_periods_per_day: 4,
      max_periods_per_week: 16,
    }),
  });
  const graceId = rFac2.body.id;

  await req('/faculty-subjects', { method: 'POST', body: JSON.stringify({ faculty_id: alanId, subject_id: javaSubId }) });
  await req('/faculty-subjects', { method: 'POST', body: JSON.stringify({ faculty_id: graceId, subject_id: pythonSubId }) });

  // Generate initial base timetable
  const rGen = await req('/timetable/generate', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: instId,
      academic_year_id: ayId,
      name: `Base Timetable ${ts}`,
      save_to_db: true,
    }),
  });
  ok(rGen.status === 200 && rGen.body.success, 'Base timetable generated successfully');
  const timetableId = rGen.body.timetable_id;
  const initialSlots = rGen.body.timetable;
  ok(initialSlots.length === 5, `5 total slots scheduled (3 Java + 2 Python)`);

  // ══════════════════════════════════════════════════════════════
  // Test 1: Valid Natural-Language Request – "Move Java to any valid slot"
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 1: Valid Request – Move to Any Valid Slot ───');
  const rChat1 = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      timetable_id: timetableId,
      message: 'Move Java from Monday to any valid slot',
    }),
  });

  ok(rChat1.status === 200, 'Assistant returned HTTP 200');
  ok(rChat1.body.success === true, 'success is TRUE');
  ok(rChat1.body.command?.intent === 'MOVE_SLOT', 'Extracted intent MOVE_SLOT');
  ok(rChat1.body.command?.entities?.any_slot === true, 'Recognized any_slot = true');
  ok(rChat1.body.can_apply === true, 'can_apply is TRUE');
  ok(rChat1.body.proposal_id !== undefined, 'Generated proposal_id');
  ok(rChat1.body.proposal?.diff !== undefined, 'Includes diff preview');
  console.log('Preview Diff:', JSON.stringify(rChat1.body.proposal?.diff, null, 2));

  // ══════════════════════════════════════════════════════════════
  // Test 2: Valid Request – Move to Specified Slot
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 2: Valid Request – Move to Specific Slot ───');
  // Unambiguously move Python from Tuesday to Friday P4
  const rChat2 = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      timetable_id: timetableId,
      message: 'Move Python from Tuesday to Friday P4',
    }),
  });

  ok(rChat2.status === 200, 'Assistant responded 200');
  ok(rChat2.body.command?.intent === 'MOVE_SLOT', 'Intent is MOVE_SLOT');
  ok(rChat2.body.command?.entities?.from_day === 'Tuesday', 'Extracted from_day = Tuesday');
  ok(rChat2.body.command?.entities?.to_day === 'Friday', 'Extracted to_day = Friday');
  ok(rChat2.body.command?.entities?.to_period === 'P4', 'Extracted to_period = P4');
  ok(rChat2.body.can_apply === true, 'Proposed move is valid (can_apply = true)');
  ok(rChat2.body.proposal?.diff?.after?.day_name === 'Friday', 'Preview shows target day Friday');

  // ══════════════════════════════════════════════════════════════
  // Test 3: Constraint-Conflicting Request – Move into Lunch / Break
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 3: Constraint Conflict – Move into Non-Teaching Lunch ───');
  const rChat3 = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      timetable_id: timetableId,
      message: 'Move Java from Monday to Tuesday Lunch',
    }),
  });

  ok(rChat3.status === 200, 'Assistant handled invalid slot safely');
  ok(rChat3.body.can_apply !== true, 'Blocked: can_apply is false/undefined');
  ok(rChat3.body.status === 'CONSTRAINT_VIOLATION', 'Status is CONSTRAINT_VIOLATION');
  ok(
    rChat3.body.message.includes('non-teaching') || rChat3.body.message.includes('break') || rChat3.body.message.includes('lunch'),
    'Assistant explains that target is a non-teaching break/lunch period'
  );

  // ══════════════════════════════════════════════════════════════
  // Test 4: Ambiguous Request Handling
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 4: Ambiguous Request ───');
  const rChat4 = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      timetable_id: timetableId,
      message: 'Move the class',
    }),
  });

  ok(rChat4.status === 200, 'Responded gracefully');
  ok(rChat4.body.can_apply === false, 'Cannot apply ambiguous request');
  ok(rChat4.body.status === 'AMBIGUOUS', 'Status is AMBIGUOUS');
  ok(rChat4.body.message.includes('specify'), 'Provides clarifying guidance to user');

  // ══════════════════════════════════════════════════════════════
  // Test 5: Malformed AI Query & Security Protection
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 5: Malformed & Malicious SQL Injection Protection ───');
  // Empty query
  const rEmpty = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ timetable_id: timetableId, message: '   ' }),
  });
  ok(rEmpty.status === 400, 'Empty message rejected (400)');

  // SQL injection attempt
  const rSql = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      timetable_id: timetableId,
      message: 'DROP TABLE timetable_entries; SELECT * FROM faculty;',
    }),
  });
  ok(rSql.status === 200, 'Responded safely');
  ok(rSql.body.can_apply === false, 'Blocked execution');
  ok(rSql.body.status === 'UNSUPPORTED', 'Status is UNSUPPORTED / SECURITY_BLOCKED');
  ok(rSql.body.message.includes('SQL') || rSql.body.message.includes('not permitted'), 'Blocked direct SQL command');

  // Unsupported query
  const rJoke = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      timetable_id: timetableId,
      message: 'What is the capital of France?',
    }),
  });
  ok(rJoke.body.status === 'UNSUPPORTED', 'Non-scheduling query flagged UNSUPPORTED');

  // ══════════════════════════════════════════════════════════════
  // Test 6: Human Approval Workflow – Reject Proposal
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 6: Human Approval – Reject Proposal ───');
  const rChatReject = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      timetable_id: timetableId,
      message: 'Move Python from Tuesday P2 to Thursday P1',
    }),
  });
  const rejectProposalId = rChatReject.body.proposal_id;
  ok(rejectProposalId, 'Generated proposal for rejection test');

  // User sends rejection
  const rReject = await req('/timetable/assistant/apply', {
    method: 'POST',
    body: JSON.stringify({
      proposal_id: rejectProposalId,
      approved: false,
    }),
  });
  ok(rReject.status === 200, 'Reject endpoint returned 200');
  ok(rReject.body.status === 'REJECTED', 'Status is REJECTED');
  ok(rReject.body.message.includes('rejected by user'), 'Message confirms rejection');

  // ══════════════════════════════════════════════════════════════
  // Test 7: Human Approval Workflow – Approve Proposal & Database Update
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 7: Human Approval – Approve Proposal & DB Commit ───');
  // First propose a valid move
  const rChatApprove = await req('/timetable/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      timetable_id: timetableId,
      message: 'Move Java from Monday P1 to Friday P4',
    }),
  });

  ok(rChatApprove.body.can_apply === true, 'Proposal is valid and can_apply is true');
  const approveProposalId = rChatApprove.body.proposal_id;

  // User explicitly approves proposal
  const rApprove = await req('/timetable/assistant/apply', {
    method: 'POST',
    body: JSON.stringify({
      proposal_id: approveProposalId,
      approved: true,
    }),
  });

  ok(rApprove.status === 200, 'Apply endpoint returned 200');
  ok(rApprove.body.status === 'APPLIED', 'Status is APPLIED');
  ok(rApprove.body.success === true, 'Database update was successful');

  // Verify directly from Database that the slot actually moved to Friday P4!
  const rCheckTT = await req(`/timetable/${timetableId}`);
  const movedSlot = rCheckTT.body.entries.find(e => e.subject_id === javaSubId && e.day_name === 'Friday' && e.period_name === 'P4');
  ok(movedSlot !== undefined, 'Verified in database: Java slot is now scheduled on Friday P4!');

  // ══════════════════════════════════════════════════════════════
  // Test 8: Prevent Applying Invalid Proposals
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 8: Prevent Applying Non-Existent or Invalid Proposals ───');
  const rFake = await req('/timetable/assistant/apply', {
    method: 'POST',
    body: JSON.stringify({
      proposal_id: 'fake-non-existent-uuid',
      approved: true,
    }),
  });
  ok(rFake.status === 400, 'Fake proposal rejected (400)');

  // ══════════════════════════════════════════════════════════════
  // Test 9: Independent Validation on the Newly Modified Timetable
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 9: Independent Validator on Modified Timetable ───');
  const rValModified = await req('/timetable/validate', {
    method: 'POST',
    body: JSON.stringify({ timetable_id: timetableId }),
  });
  ok(rValModified.status === 200, 'Independent validator ran');
  ok(rValModified.body.is_valid === true, 'Timetable remains 100% valid after approved assistant edit!');
  ok(rValModified.body.hard_constraints_violated === 0, 'Zero hard violations post-modification');

  // ══════════════════════════════════════════════════════════════
  // Test 10: Regression Check Across Prior Phases (1-9)
  // ══════════════════════════════════════════════════════════════
  console.log('\n─── Test 10: Regression Across Prior Phases ───');
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
    ok(r.status === 200 && Array.isArray(r.body), `${label} API healthy (200)`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('   ALL 10 PHASE 10 VERIFICATION TESTS PASSED ✅');
  console.log('══════════════════════════════════════════════════\n');
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Phase 10 Test suite failed:', err);
  process.exit(1);
});
