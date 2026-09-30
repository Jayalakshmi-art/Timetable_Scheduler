const db = require('../config/db');
const ProblemLoader = require('../services/solver/ProblemLoader');
const NaturalLanguageParser = require('../services/assistant/NaturalLanguageParser');
const CommandExecutor = require('../services/assistant/CommandExecutor');
const { defaultProposalManager } = require('../services/assistant/ProposalManager');

/**
 * Phase 10: AI Natural-Language Timetable Assistant Controller
 */
exports.chat = async (req, res) => {
  const { timetable_id, message } = req.body;

  if (!timetable_id) {
    return res.status(400).json({
      success: false,
      message: 'timetable_id is required',
    });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: 'message is required',
    });
  }

  try {
    // 1. Fetch current timetable and entries from database
    const [ttRows] = await db.query(
      `SELECT t.*, i.name AS institution_name, ay.name AS academic_year_name
       FROM timetables t
       LEFT JOIN institutions i ON t.institution_id = i.id
       LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
       WHERE t.id = ?`,
      [timetable_id]
    );

    if (ttRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Timetable not found' });
    }

    const timetable = ttRows[0];

    const [entries] = await db.query(
      `SELECT 
        te.id AS entry_id,
        te.timetable_id,
        te.class_id, c.name AS class_name, c.year AS class_year, c.section AS class_section, c.student_count,
        te.subject_id, s.name AS subject_name, s.code AS subject_code, s.type AS subject_type, s.requires_lab, s.duration,
        te.faculty_id, f.name AS faculty_name, f.faculty_code,
        te.room_id, r.room_code, r.name AS room_name, r.type AS room_type, r.capacity AS room_capacity,
        te.working_day_id AS day_id, wd.day_name, wd.day_order,
        te.period_id, p.name AS period_name, p.period_order, p.start_time, p.end_time, p.is_break, p.is_lunch
       FROM timetable_entries te
       JOIN classes c ON te.class_id = c.id
       JOIN subjects s ON te.subject_id = s.id
       JOIN faculty f ON te.faculty_id = f.id
       JOIN rooms r ON te.room_id = r.id
       JOIN working_days wd ON te.working_day_id = wd.id
       JOIN periods p ON te.period_id = p.id
       WHERE te.timetable_id = ?
       ORDER BY c.name, wd.day_order, p.period_order`,
      [timetable_id]
    );

    const timetableData = {
      ...timetable,
      entries,
    };

    // 2. Load ground-truth problem data topology from DB
    const problemData = await ProblemLoader.load(timetable.institution_id, timetable.academic_year_id);

    // 3. AI / NLP Parsing: User request -> Structured JSON Command
    const context = {
      subjects: problemData.subjects,
      classes: problemData.classes,
      workingDays: problemData.workingDays,
      periods: problemData.periods,
    };
    const parsedCommand = NaturalLanguageParser.parse(message, context);

    if (parsedCommand.status !== 'SUCCESS') {
      return res.json({
        success: false,
        status: parsedCommand.status,
        message: parsedCommand.message,
        command: parsedCommand,
        can_apply: false,
      });
    }

    // 4. Backend Validation & Constraint Solver Verification
    const executionResult = await CommandExecutor.execute(parsedCommand, timetableData, problemData);

    return res.json({
      ...executionResult,
    });
  } catch (error) {
    console.error('Assistant Chat Error:', error);
    res.status(500).json({
      success: false,
      status: 'SERVER_ERROR',
      message: 'Error processing assistant request: ' + error.message,
    });
  }
};

/**
 * Approve or Reject a change proposal
 * POST /api/timetable/assistant/apply
 */
exports.apply = async (req, res) => {
  const { proposal_id, approved } = req.body;

  if (!proposal_id) {
    return res.status(400).json({ success: false, message: 'proposal_id is required' });
  }

  try {
    // If user rejected the change
    if (approved === false) {
      const rejected = defaultProposalManager.rejectProposal(proposal_id);
      return res.json({
        success: true,
        status: 'REJECTED',
        message: 'Change proposal was rejected by user. No database changes were made.',
        proposal: rejected,
      });
    }

    // If user approved the change
    if (approved === true) {
      const result = await defaultProposalManager.applyProposal(proposal_id, db);
      return res.json(result);
    }

    return res.status(400).json({
      success: false,
      message: 'approved must be a boolean (true to approve and apply, false to reject).',
    });
  } catch (error) {
    console.error('Apply Proposal Error:', error);
    res.status(400).json({
      success: false,
      status: 'APPLY_FAILED',
      message: error.message,
    });
  }
};

/**
 * GET /api/timetable/assistant/proposals/:timetable_id
 */
exports.getProposals = async (req, res) => {
  const { timetable_id } = req.params;
  try {
    const list = defaultProposalManager.getProposalsForTimetable(timetable_id);
    res.json(list);
  } catch (error) {
    console.error('Get Proposals Error:', error);
    res.status(500).json({ message: 'Error retrieving proposals' });
  }
};
