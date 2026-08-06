import React, { useState } from 'react';

function AdminLogin({ onLogin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === '123456') { // Hardcoded PIN based on user's comment
      onLogin(true);
    } else {
      setError('PIN Salah. Silakan coba lagi.');
      setPin('');
    }
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-96 flex flex-col items-center">
        <h1 className="text-2xl font-black text-slate-800 mb-6 text-center">🔐 Kunci Admin</h1>
        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full text-center text-3xl font-bold tracking-[0.5em] p-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none mb-4"
            placeholder="••••••"
            maxLength={6}
            autoFocus
          />
          {error && <p className="text-red-500 text-sm font-semibold mb-4">{error}</p>}
          <button 
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors shadow-md"
          >
            Buka Kunci
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminLogin;
