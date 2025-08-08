'use client';
import { supabase } from '@/lib/supabaseClient';
import { useState } from 'react';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin }
    });
    if (error) alert(error.message);
    else setSent(true);
  }

  return (
    <div className="p-4 rounded border bg-white">
      <h2 className="text-lg font-semibold mb-2">Sign in</h2>
      {sent ? (
        <p>Check your inbox for a sign-in link.</p>
      ) : (
        <form onSubmit={signIn} className="space-y-2">
          <label className="block text-sm font-medium">Email</label>
          <input
            className="w-full border rounded p-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="px-4 py-2 rounded bg-emerald-600 text-white" type="submit">
            Send magic link
          </button>
        </form>
      )}
    </div>
  );
}