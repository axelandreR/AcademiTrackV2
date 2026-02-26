import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import FileUploader from './components/FileUploader';
import ReportsDashboard from './components/ReportsDashboard';
import { ParseResult } from './services/excelParser';
import { DataProvider, useData } from './context/DataContext';

// Import Pages
import LandingPage from './pages/LandingPage';
import SchedulePage from './pages/SchedulePage';
import InstructorsPage from './pages/InstructorsPage';
import RoomsPage from './pages/RoomsPage';

import ProgressPanel from './components/ProgressPanel';
import AttendancePage from './pages/AttendancePage';
import ArchiveManagerPage from './pages/ArchiveManagerPage';

// Componente Wrapper para manejar la carga de datos inicial
const AppContent: React.FC = () => {
  const { allSchedules, isLoading, hasInitialData, error, uploadSchedulesToSupabase } = useData();

  const handleInitialUpload = async (result: ParseResult) => {
    await uploadSchedulesToSupabase(result);
  };

  // 1. Mostrar Error si existe
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-10">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-rose-100 text-center space-y-4">
          <div className="text-rose-500 font-black text-xl">Error de Conexión</div>
          <p className="text-slate-500">{error}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold">Reintentar</button>
        </div>
      </div>
    );
  }

  // 2. Mostrar Loading mientras descarga de la nube (Solo inicial)
  if (isLoading && !hasInitialData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest">Sincronizando con la nube...</h2>
        <p className="text-slate-400 mt-2 font-medium">Trayendo programación semestral actualizada.</p>
      </div>
    );
  }

  // 3. Si no hay horarios cargados ni en local ni en nube, mostrar el Uploader inicial
  // Pero solo si definitivamente el fetch terminó y no encontró nada (hasInitialData === false)
  if (!isLoading && !hasInitialData && allSchedules.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10 relative">
        <div className="max-w-4xl w-full text-center z-10 animate-in fade-in duration-700">
          <div className="mb-12 space-y-4">
            <h1 className="text-6xl font-black text-slate-900 tracking-tighter">
              Academi<span className="text-blue-600">Track</span>
            </h1>
            <p className="text-lg text-slate-500 font-medium">
              Gestión inteligente de horarios y auditoría de carga.
            </p>
          </div>
          <FileUploader onDataLoaded={handleInitialUpload} />
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/instructors" element={<InstructorsPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/progress" element={<ProgressPanel />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/archive" element={<ArchiveManagerPage />} />
        <Route path="/reports" element={
          // ReportsDashboard necesita props, idealmente también debería usar Context
          // Por ahora le pasamos los datos del context
          <ContextReportsWrapper />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

// Pequeño wrapper para adaptar ReportsDashboard al nuevo sistema de props
const ContextReportsWrapper: React.FC = () => {
  const { allSchedules, instructors, holidays } = useData();
  const [dummyState, setDummyState] = useState(0); // Hack para forzar re-render si es necesario

  return (
    <ReportsDashboard
      schedules={allSchedules}
      instructors={instructors}
      holidays={holidays}
      onBack={() => window.location.href = '/'} // Simple redirect por ahora
    />
  );
};

const App: React.FC = () => {
  return (
    <DataProvider>
      <AppContent />
    </DataProvider>
  );
};

export default App;
