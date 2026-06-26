import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';

import Onboarding from './pages/Onboarding';
import Feed from './pages/Feed';
import NewIssue from './pages/NewIssue';
import IssueDetails from './pages/IssueDetails';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Activity from './pages/Activity';
import Analytics from './pages/Analytics';
import Leaderboard from './pages/Leaderboard';
import Predictions from './pages/Predictions';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RealtimeProvider>
          <Router>
            <Routes>
              <Route path="/onboarding" element={
                <ProtectedRoute><Onboarding /></ProtectedRoute>
              } />
              
              <Route path="/" element={<Layout />}>
                <Route index element={<Feed />} />
                <Route path="issue/:id" element={<IssueDetails />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="leaderboard" element={<Leaderboard />} />
                
                {/* Protected Routes */}
                <Route path="issue/new" element={<ProtectedRoute><NewIssue /></ProtectedRoute>} />
                <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="activity" element={<ProtectedRoute><Activity /></ProtectedRoute>} />
                <Route path="predictions" element={<ProtectedRoute><Predictions /></ProtectedRoute>} />
              </Route>
            </Routes>
          </Router>
        </RealtimeProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
