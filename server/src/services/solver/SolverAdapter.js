const CspSolver = require('./CspSolver');
const ConstraintEngine = require('./ConstraintEngine');

/**
 * Base abstract interface for timetable solvers.
 * New solvers (such as Google OR-Tools, ILP, or Genetic Algorithms) can extend this class.
 */
class BaseSolver {
  /**
   * @param {Object} problemData - Normalized data from ProblemLoader
   * @param {Object} options - Solver configuration options
   * @returns {Promise<Object>} Solution result
   */
  async solve(problemData, options = {}) {
    throw new Error('Method solve() must be implemented by solver subclass');
  }
}

/**
 * CSP Solver Adapter
 */
class CspSolverAdapter extends BaseSolver {
  async solve(problemData, options = {}) {
    const solver = new CspSolver(options);
    return solver.solve(problemData);
  }
}

/**
 * Solver Manager & Registry
 * Allows seamless plugging of new optimization backends without changing the controller or API.
 */
class SolverRegistry {
  constructor() {
    this.solvers = new Map();
    // Register default deterministic CSP solver
    this.register('CSP', new CspSolverAdapter());
  }

  register(name, solverInstance) {
    if (!(solverInstance instanceof BaseSolver)) {
      throw new Error(`Solver "${name}" must extend BaseSolver`);
    }
    this.solvers.set(name.toUpperCase(), solverInstance);
  }

  get(name = 'CSP') {
    const solver = this.solvers.get(name.toUpperCase());
    if (!solver) {
      throw new Error(`Solver "${name}" is not registered. Available solvers: ${Array.from(this.solvers.keys()).join(', ')}`);
    }
    return solver;
  }

  /**
   * Universal solve method: executes solver, validates constraints, and scores soft metrics.
   */
  async generate(problemData, options = {}) {
    const solverType = options.solverType || 'CSP';
    const solver = this.get(solverType);

    // 1. Run the chosen solver
    const result = await solver.solve(problemData, options);

    if (!result.success) {
      return {
        success: false,
        status: result.status || 'INFEASIBLE',
        message: result.message || 'Generation failed.',
        conflicts: result.conflicts || [],
        timetable: [],
        metrics: {
          execution_time_ms: result.stats?.executionTimeMs || 0,
          steps_explored: result.stats?.stepsExplored || 0,
        },
      };
    }

    // 2. Validate all hard constraints
    const validation = ConstraintEngine.validate(result.timetable, problemData);

    // 3. Evaluate and score soft constraints
    const softMetrics = ConstraintEngine.evaluateSoftConstraints(result.timetable, problemData);

    const totalRequiredSlots = result.timetable.length; // all assigned slots

    return {
      success: validation.isValid,
      status: validation.isValid ? 'VALID' : 'INVALID',
      message: validation.isValid
        ? 'Timetable generated successfully with 0 hard-constraint violations.'
        : 'Generated timetable has hard-constraint violations.',
      timetable: result.timetable,
      metrics: {
        total_slots_scheduled: result.timetable.length,
        total_required_slots: totalRequiredSlots,
        soft_score: softMetrics.overallScore,
        soft_constraints_breakdown: softMetrics.breakdown,
        execution_time_ms: result.stats?.executionTimeMs || 0,
        steps_explored: result.stats?.stepsExplored || 0,
      },
      validation: {
        is_valid: validation.isValid,
        hard_constraints_violated: validation.hardConstraintsViolated,
        violations: validation.violations,
      },
      conflicts: validation.isValid ? [] : validation.violations,
    };
  }
}

const defaultRegistry = new SolverRegistry();

module.exports = {
  BaseSolver,
  CspSolverAdapter,
  SolverRegistry,
  defaultRegistry,
};
