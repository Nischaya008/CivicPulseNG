import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen p-6 bg-slate-50 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold text-slate-900 mb-4">Welcome to CivicPulse, {user?.displayName}</h1>
      <p className="text-slate-600 text-center max-w-md mb-8">
        You're now part of a community-driven AI platform. Let's start reporting and verifying civic issues around you.
      </p>
      <button 
        onClick={() => navigate('/')}
        className="px-6 py-3 bg-primary text-white rounded-lg shadow font-medium hover:bg-blue-600"
      >
        Go to Feed
      </button>
    </div>
  );
}
