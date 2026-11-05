import React, { useState, useEffect } from 'react';

// Set your internal team passcode here
const ACCESS_PASSCODE = "CopadoCSM2026"; 
const STORAGE_KEY = "csm_directory_authenticated";

interface AccessGateProps {
  children: React.ReactNode;
}

export const AccessGate: React.FC<AccessGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [inputCode, setInputCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Check if user has already unlocked it in this browser
    const storedAuth = localStorage.getItem(STORAGE_KEY);
    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim() === ACCESS_PASSCODE) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Invalid access key. Please reach out to Ethan.');
    }
  };

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-md">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">
              CSM Internal Directory
            </h1>
            <p className="mt-2 text-xs text-slate-400">
              Restricted internal tool. Enter your team access key to proceed.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Enter access key..."
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
              {error && (
                <p className="mt-2 text-xs font-medium text-rose-400">{error}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Verify & Enter
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-slate-500">
            For support lead or CSM access inquiries, contact Ethan De La Rosa.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
