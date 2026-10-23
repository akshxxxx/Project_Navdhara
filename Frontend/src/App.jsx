import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { LiveMap } from './pages/LiveMap';
import { PlanTrip } from './pages/PlanTrip';
import { Alerts } from './pages/Alerts';
import { Report } from './pages/Report';
import { Emergency } from './pages/Emergency';
import { PastEvents } from './pages/PastEvents';
import { About } from './pages/About';
import { Officials } from './pages/Officials';
import { Sensors } from './pages/Sensors';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LiveMap />} />
          <Route path="plan" element={<PlanTrip />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="report" element={<Report />} />
          <Route path="sensors" element={<Sensors />} />
          <Route path="emergency" element={<Emergency />} />
          <Route path="past-events" element={<PastEvents />} />
          <Route path="about" element={<About />} />
          <Route path="admin" element={<Officials />} />
          {/* Old address of the admin page */}
          <Route path="officials" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
