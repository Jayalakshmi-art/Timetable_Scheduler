import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Institutions from './pages/Institutions';
import Departments from './pages/Departments';
import AcademicYears from './pages/AcademicYears';
import './App.css';

function Dashboard() {
  return (
    <div>
      <h1>AI-Assisted Institutional Timetable Generator</h1>
      <p>Welcome to the Dashboard. Please manage your institutions, departments, and academic years.</p>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <nav style={{ padding: '10px', background: '#eee', marginBottom: '20px' }}>
          <Link to="/" style={{ marginRight: '10px' }}>Dashboard</Link>
          <Link to="/institutions" style={{ marginRight: '10px' }}>Institutions</Link>
          <Link to="/departments" style={{ marginRight: '10px' }}>Departments</Link>
          <Link to="/academic-years">Academic Years</Link>
        </nav>
        
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/institutions" element={<Institutions />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/academic-years" element={<AcademicYears />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
