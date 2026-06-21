"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export default function AuthPage() {
  const [consent, setConsent] = useState(false);

  function startGoogleLogin() {
    if (!consent) {
      alert("Please allow AI access to your emails to continue.");
      return;
    }

    // Navigate to backend OAuth URL with consent state
    window.location.href = `${API_BASE}/auth/google?consent=1`;
  }

  return (
    <main className="min-h-screen bg-[#0b1220] text-white p-8">
      <div className="mx-auto max-w-xl rounded-xl bg-[#0f172a] p-8">
        <h1 className="text-2xl font-bold">Sign in with Google</h1>

        <p className="mt-3 text-sm text-gray-400">We need your permission to access your Gmail for summarization. Your emails are processed by AI to generate summaries; we will not read or store emails beyond necessary metadata and summaries you save.</p>

        <label className="mt-6 flex items-start gap-3">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <div className="text-sm text-gray-300">I allow the app to access my Gmail for AI summarization.</div>
        </label>

        <div className="mt-6 flex gap-3">
          <button onClick={startGoogleLogin} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold">Sign in with Google</button>
        </div>
      </div>
    </main>
  );
}
