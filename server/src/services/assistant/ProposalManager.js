const crypto = require('crypto');

/**
 * ProposalManager holds pending assistant proposals awaiting explicit human approval.
 * Prevents direct execution of AI commands without human verification.
 */
class ProposalManager {
  constructor() {
    this.proposals = new Map();
  }

  /**
   * Create and register a new pending proposal.
   */
  createProposal(data) {
    const proposalId = crypto.randomUUID();
    const proposal = {
      id: proposalId,
      created_at: new Date().toISOString(),
      status: 'PENDING', // 'PENDING' | 'APPLIED' | 'REJECTED'
      ...data,
    };
    this.proposals.set(proposalId, proposal);
    return proposal;
  }

  getProposal(proposalId) {
    return this.proposals.get(proposalId) || null;
  }

  /**
   * Mark a proposal as rejected.
   */
  rejectProposal(proposalId, reason = 'User rejected change proposal') {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;
    proposal.status = 'REJECTED';
    proposal.rejected_at = new Date().toISOString();
    proposal.rejection_reason = reason;
    return proposal;
  }

  /**
   * Apply an approved proposal to the MySQL database.
   */
  async applyProposal(proposalId, db) {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found or expired.');
    }

    if (proposal.status !== 'PENDING') {
      throw new Error(`Proposal is already ${proposal.status}.`);
    }

    if (!proposal.can_apply || !proposal.is_valid) {
      throw new Error('Cannot apply an invalid proposal that violates hard constraints.');
    }

    const { timetable_id, changes } = proposal;

    // Apply the specific entry mutations in database inside a transaction
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      for (const change of changes) {
        if (change.type === 'UPDATE_ENTRY') {
          await connection.query(
            `UPDATE timetable_entries 
             SET class_id = ?, subject_id = ?, faculty_id = ?, room_id = ?, working_day_id = ?, period_id = ?
             WHERE id = ? AND timetable_id = ?`,
            [
              change.new_slot.class_id,
              change.new_slot.subject_id,
              change.new_slot.faculty_id,
              change.new_slot.room_id,
              change.new_slot.working_day_id || change.new_slot.day_id,
              change.new_slot.period_id,
              change.entry_id,
              timetable_id,
            ]
          );
        }
      }

      // Update timetable metadata & timestamp
      await connection.query(
        `UPDATE timetables 
         SET updated_at = CURRENT_TIMESTAMP, soft_score = ?
         WHERE id = ?`,
        [proposal.soft_score?.after ?? null, timetable_id]
      );

      await connection.commit();

      proposal.status = 'APPLIED';
      proposal.applied_at = new Date().toISOString();

      return {
        success: true,
        status: 'APPLIED',
        message: 'Timetable was successfully updated with approved changes.',
        proposal,
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  getProposalsForTimetable(timetableId) {
    const results = [];
    for (const p of this.proposals.values()) {
      if (String(p.timetable_id) === String(timetableId)) {
        results.push(p);
      }
    }
    return results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

const defaultProposalManager = new ProposalManager();

module.exports = {
  ProposalManager,
  defaultProposalManager,
};
