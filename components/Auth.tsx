'use client';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

export default function Auth() {
  const supabase = getSupabase();
  const [email, setEmail] = useState('');

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    alert('Magic link sent. Check your email.');
  }

  return (
    <form onSubmit={signIn} className="max-w-sm rounded border p-4 shadow-sm">
      <label className="text-sm">Email</label>
      <input
        className="mt-1 w-full rounded border px-3 py-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        type="email"
        required
      />
      <button className="mt-3 w-full rounded border px-3 py-2">Send magic link</button>
    </form>
  );
}