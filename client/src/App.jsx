import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Institutions from './pages/Institutions';
import Departments from './pages/Departments';
import AcademicYears from './pages/AcademicYears';
import Classes from './pages/Classes';
import Subjects from './pages/Subjects';
import ClassSubjectMapping from './pages/ClassSubjectMapping';
import Faculty from './pages/Faculty';
import FacultySubjectMapping from './pages/FacultySubjectMapping';
import Rooms from './pages/Rooms';
import WorkingDays from './pages/WorkingDays';
import Periods from './pages/Periods';
import Availability from './pages/Availability';
import Constraints from './pages/Constraints';
import Feasibility from './pages/Feasibility';
import './App.css';

function Dashboard() {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'left', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>AI-Assisted Institutional Timetable Generator</h1>
      <p style={{ color: 'var(--text)', marginBottom: '32px' }}>
        Configure institution structure, academic calendars, curriculum, classes, and assign course mappings.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <div className="form-card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: '20px' }}>🏛️ Phase 1 & 2 Foundations</h2>
          <p style={{ fontSize: '14px', color: 'var(--text)', margin: '10px 0 16px' }}>
            Manage institutions, academic faculties/departments, and academic calendar sessions.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/institutions" className="btn-secondary">Institutions</Link>
            <Link to="/departments" className="btn-secondary">Departments</Link>
            <Link to="/academic-years" className="btn-secondary">Academic Years</Link>
          </div>
        </div>

        <div className="form-card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: '20px' }}>📚 Phase 3 Curriculum &amp; Classes</h2>
          <p style={{ fontSize: '14px', color: 'var(--text)', margin: '10px 0 16px' }}>
            Setup student class cohorts, subject catalogs (Theory &amp; Labs), and assign subject loads.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/classes" className="btn-primary">Classes</Link>
            <Link to="/subjects" className="btn-primary">Subjects</Link>
            <Link to="/class-subjects" className="btn-primary">Class-Subject Mapping</Link>
          </div>
        </div>

        <div className="form-card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: '20px' }}>👩‍🏫 Phase 4 Faculty</h2>
          <p style={{ fontSize: '14px', color: 'var(--text)', margin: '10px 0 16px' }}>
            Register faculty members, set workload limits, and assign teachable subjects.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/faculty" className="btn-primary">Faculty</Link>
            <Link to="/faculty-subjects" className="btn-primary">Faculty-Subject Mapping</Link>
          </div>
        </div>

        <div className="form-card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: '20px' }}>🏢 Phase 5 Scheduling Infrastructure</h2>
          <p style={{ fontSize: '14px', color: 'var(--text)', margin: '10px 0 16px' }}>
            Configure rooms, labs, working days, period timings, breaks and lunch slots.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/rooms" className="btn-primary">Rooms & Labs</Link>
            <Link to="/working-days" className="btn-primary">Working Days</Link>
            <Link to="/periods" className="btn-primary">Periods</Link>
          </div>
        </div>

        <div className="form-card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: '20px' }}>⏰ Phase 6 Constraints & Availability</h2>
          <p style={{ fontSize: '14px', color: 'var(--text)', margin: '10px 0 16px' }}>
            Configure faculty, class, and room availability grids. Set HARD & SOFT scheduling constraints.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/availability" className="btn-primary" style={{ background: '#7c3aed' }}>Availability</Link>
            <Link to="/constraints" className="btn-primary" style={{ background: '#dc2626' }}>Constraints</Link>
          </div>
        </div>

        <div className="form-card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: '20px' }}>⚙️ Phase 7 Feasibility Checker</h2>
          <p style={{ fontSize: '14px', color: 'var(--text)', margin: '10px 0 16px' }}>
            Verify if a valid timetable can be generated with the current configuration.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/feasibility" className="btn-primary" style={{ background: '#059669' }}>Feasibility Check</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="app-nav">
          <strong style={{ marginRight: '16px', color: '#6366f1', letterSpacing: '0.5px' }}>
            🗓️ TimetableGen
          </strong>
          <Link to="/">Dashboard</Link>
          <Link to="/institutions">Institutions</Link>
          <Link to="/departments">Departments</Link>
          <Link to="/academic-years">Academic Years</Link>
          <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
          <Link to="/classes">Classes</Link>
          <Link to="/subjects">Subjects</Link>
          <Link to="/class-subjects">Class-Subject Mapping</Link>
          <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
          <Link to="/faculty">Faculty</Link>
          <Link to="/faculty-subjects">Faculty-Subject Mapping</Link>
          <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
          <Link to="/rooms">Rooms</Link>
          <Link to="/working-days">Working Days</Link>
          <Link to="/periods">Periods</Link>
          <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
          <Link to="/availability">Availability</Link>
          <Link to="/constraints">Constraints</Link>
          <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
          <Link to="/feasibility">Feasibility</Link>
        </nav>
        
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/institutions" element={<Institutions />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/academic-years" element={<AcademicYears />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/class-subjects" element={<ClassSubjectMapping />} />
          <Route path="/faculty" element={<Faculty />} />
          <Route path="/faculty-subjects" element={<FacultySubjectMapping />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/working-days" element={<WorkingDays />} />
          <Route path="/periods" element={<Periods />} />
          <Route path="/availability" element={<Availability />} />
          <Route path="/constraints" element={<Constraints />} />
          <Route path="/feasibility" element={<Feasibility />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
