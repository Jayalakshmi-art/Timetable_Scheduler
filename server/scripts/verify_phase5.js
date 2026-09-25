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
  console.log('   PHASE 5 VERIFICATION – Rooms, Days & Periods');
  console.log('══════════════════════════════════════════════════\n');

  // ─── Prerequisites ───
  let { body: insts } = await req('/institutions');
  let inst = insts.find(i => i.code === 'TIT');
  if (!inst) {
    const r = await req('/institutions', { method:'POST', body: JSON.stringify({name:'Test Institute of Technology',code:'TIT'}) });
    inst = r.body;
  }
  ok(inst?.id, 'Institution ready');

  // Clean Phase 5 tables
  await pool.query('DELETE FROM periods WHERE institution_id = ?', [inst.id]);
  await pool.query('DELETE FROM working_days WHERE institution_id = ?', [inst.id]);
  await pool.query('DELETE FROM rooms WHERE institution_id = ?', [inst.id]);

  // ════════════════ ROOMS ════════════════
  console.log('\n─── Test 1: Create Rooms ───');
  const r1 = await req('/rooms', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, room_code: 'CR101', name: 'Classroom 101',
    type: 'CLASSROOM', capacity: 60, building: 'Block A', floor: '1st Floor'
  }) });
  ok(r1.status === 201, 'Classroom created (201)');
  ok(r1.body.room_code === 'CR101', 'Room code correct');
  const room1Id = r1.body.id;

  const r1b = await req('/rooms', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, room_code: 'LAB201', name: 'Computer Lab 1',
    type: 'LAB', capacity: 40, building: 'Block B', floor: '2nd Floor'
  }) });
  ok(r1b.status === 201, 'Lab created (201)');
  ok(r1b.body.type === 'LAB', 'Lab type correct');

  const r1c = await req('/rooms', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, room_code: 'SH001', name: 'Main Seminar Hall',
    type: 'SEMINAR_HALL', capacity: 200
  }) });
  ok(r1c.status === 201, 'Seminar hall created (201)');

  console.log('\n─── Test 2: Edit Room ───');
  const r2 = await req(`/rooms/${room1Id}`, { method:'PUT', body: JSON.stringify({
    name: 'Classroom 101 (Renovated)', capacity: 65
  }) });
  ok(r2.status === 200, 'Room updated (200)');
  ok(r2.body.room.name === 'Classroom 101 (Renovated)', 'Name updated');
  ok(r2.body.room.capacity === 65, 'Capacity updated');

  console.log('\n─── Test 3: Deactivate Room ───');
  const r3 = await req(`/rooms/${room1Id}`, { method:'PUT', body: JSON.stringify({ is_active: false }) });
  ok(r3.status === 200, 'Room deactivated (200)');
  ok(r3.body.room.is_active === false, 'is_active = false');
  // Reactivate
  await req(`/rooms/${room1Id}`, { method:'PUT', body: JSON.stringify({ is_active: true }) });

  console.log('\n─── Test 4: Invalid Room Data ───');
  const r4a = await req('/rooms', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, room_code: 'CR101', name: 'Duplicate Code',
    type: 'CLASSROOM', capacity: 30
  }) });
  ok(r4a.status === 400, 'Duplicate room code rejected (400)');

  const r4b = await req('/rooms', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, room_code: 'CR999', name: 'Bad Cap',
    type: 'CLASSROOM', capacity: -5
  }) });
  ok(r4b.status === 400, 'Negative capacity rejected (400)');

  const r4c = await req('/rooms', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, room_code: 'CR999', name: 'Bad Type',
    type: 'INVALID_TYPE', capacity: 30
  }) });
  ok(r4c.status === 400, 'Invalid room type rejected (400)');

  const r4d = await req('/rooms', { method:'POST', body: JSON.stringify({
    institution_id: 999999, room_code: 'CR999', name: 'Bad Inst',
    type: 'CLASSROOM', capacity: 30
  }) });
  ok(r4d.status === 400, 'Non-existent institution rejected (400)');

  // ════════════════ WORKING DAYS ════════════════
  console.log('\n─── Test 5: Create Working Days ───');
  const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  for (let i = 0; i < dayNames.length; i++) {
    const dr = await req('/working-days', { method:'POST', body: JSON.stringify({
      institution_id: inst.id, day_name: dayNames[i], day_order: i
    }) });
    ok(dr.status === 201, `${dayNames[i]} created (201)`);
  }

  const r5list = await req(`/working-days?institution_id=${inst.id}`);
  ok(r5list.body.length === 5, 'Got 5 working days');

  console.log('\n─── Test 6: Edit Working Day ───');
  const satRes = await req('/working-days', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, day_name: 'Saturday', day_order: 5
  }) });
  ok(satRes.status === 201, 'Saturday created (201)');
  const satId = satRes.body.id;

  const r6 = await req(`/working-days/${satId}`, { method:'PUT', body: JSON.stringify({
    day_name: 'Saturday (Half Day)', is_active: false
  }) });
  ok(r6.status === 200, 'Saturday updated (200)');
  ok(r6.body.working_day.is_active === false, 'Saturday deactivated');

  console.log('\n─── Test 7: Invalid Working Day Data ───');
  const r7a = await req('/working-days', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, day_name: 'Monday', day_order: 99
  }) });
  ok(r7a.status === 400, 'Duplicate day name rejected (400)');

  const r7b = await req('/working-days', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, day_name: 'UniqueDay', day_order: 0
  }) });
  ok(r7b.status === 400, 'Duplicate day order rejected (400)');

  // ════════════════ PERIODS ════════════════
  console.log('\n─── Test 8: Create Periods ───');
  const p1 = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Period 1', start_time: '09:00', end_time: '09:50', period_order: 0
  }) });
  ok(p1.status === 201, 'Period 1 created (201)');
  ok(p1.body.is_break === false, 'Not a break');
  const period1Id = p1.body.id;

  const p2 = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Period 2', start_time: '09:50', end_time: '10:40', period_order: 1
  }) });
  ok(p2.status === 201, 'Period 2 created (201)');

  const p3 = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Morning Break', start_time: '10:40', end_time: '11:00', period_order: 2, is_break: true
  }) });
  ok(p3.status === 201, 'Morning Break created (201)');
  ok(p3.body.is_break === true, 'Marked as break');

  const p4 = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Period 3', start_time: '11:00', end_time: '11:50', period_order: 3
  }) });
  ok(p4.status === 201, 'Period 3 created');

  const p5 = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Period 4', start_time: '11:50', end_time: '12:40', period_order: 4
  }) });
  ok(p5.status === 201, 'Period 4 created');

  const pLunch = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Lunch Break', start_time: '12:40', end_time: '13:30', period_order: 5, is_lunch: true
  }) });
  ok(pLunch.status === 201, 'Lunch period created');
  ok(pLunch.body.is_lunch === true, 'Marked as lunch');

  const p6 = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Period 5', start_time: '13:30', end_time: '14:20', period_order: 6
  }) });
  ok(p6.status === 201, 'Period 5 created');

  console.log('\n─── Test 9: Edit Period ───');
  const r9 = await req(`/periods/${period1Id}`, { method:'PUT', body: JSON.stringify({
    name: 'Period 1 (Updated)', end_time: '09:45'
  }) });
  ok(r9.status === 200, 'Period updated (200)');
  ok(r9.body.period.name === 'Period 1 (Updated)', 'Name updated');

  console.log('\n─── Test 10: Overlapping Periods ───');
  const r10 = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Overlapping Slot', start_time: '09:30', end_time: '10:00', period_order: 99
  }) });
  ok(r10.status === 400, 'Overlapping period rejected (400)');
  ok(r10.body.message.includes('overlaps') || r10.body.message.includes('Overlap'), 'Error message mentions overlap');

  console.log('\n─── Test 11: Invalid Period Data ───');
  const r11a = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Bad Times', start_time: '14:00', end_time: '13:00', period_order: 50
  }) });
  ok(r11a.status === 400, 'end_time before start_time rejected (400)');

  const r11b = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Period 1 (Updated)', start_time: '15:00', end_time: '16:00', period_order: 51
  }) });
  ok(r11b.status === 400, 'Duplicate period name rejected (400)');

  const r11c = await req('/periods', { method:'POST', body: JSON.stringify({
    institution_id: inst.id, name: 'Dup Order', start_time: '15:00', end_time: '16:00', period_order: 0
  }) });
  ok(r11c.status === 400, 'Duplicate period order rejected (400)');

  // ════════════════ PERSISTENCE ════════════════
  console.log('\n─── Test 12: Database Persistence ───');
  const [dbRooms] = await pool.query('SELECT * FROM rooms WHERE institution_id = ?', [inst.id]);
  ok(dbRooms.length === 3, `3 rooms in DB (got ${dbRooms.length})`);

  const [dbDays] = await pool.query('SELECT * FROM working_days WHERE institution_id = ?', [inst.id]);
  ok(dbDays.length === 6, `6 working days in DB (got ${dbDays.length})`);

  const [dbPeriods] = await pool.query('SELECT * FROM periods WHERE institution_id = ?', [inst.id]);
  ok(dbPeriods.length === 7, `7 periods in DB (got ${dbPeriods.length})`);

  // ════════════════ PHASE 1–4 REGRESSION ════════════════
  console.log('\n─── Test 13: Phase 1–4 Regression Check ───');
  const checks = [
    ['/institutions', 'GET /institutions'],
    [`/departments?institution_id=${inst.id}`, 'GET /departments'],
    [`/academic-years?institution_id=${inst.id}`, 'GET /academic-years'],
    ['/classes', 'GET /classes'],
    ['/subjects', 'GET /subjects'],
    ['/class-subjects', 'GET /class-subjects'],
    ['/faculty', 'GET /faculty'],
    ['/faculty-subjects', 'GET /faculty-subjects'],
  ];
  for (const [path, label] of checks) {
    const r = await req(path);
    ok(r.status === 200 && Array.isArray(r.body), `${label} still works`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('   ALL 13 PHASE 5 TESTS PASSED ✅');
  console.log('══════════════════════════════════════════════════\n');
  process.exit(0);
}

run().catch(err => { console.error('Test suite failed:', err); process.exit(1); });
