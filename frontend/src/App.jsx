import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import MeetingRoom from './components/MeetingRoom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/room/:roomID" element={<MeetingRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
