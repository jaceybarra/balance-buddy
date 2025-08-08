'use client';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Nav() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="border-b bg-white">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg">Balance Buddy</Link>
        <nav className="flex gap-2 items-center">
          {email && <span className="text-sm text-gray-600">{email}</span>}
          <Link href="/" className="px-3 py-1 rounded bg-gray-200">Dashboard</Link>
          <Link href="/checkin" className="px-3 py-1 rounded bg-gray-200">Check-in</Link>
          <Link href="/settings" className="px-3 py-1 rounded bg-gray-200">Settings</Link>
          {email && (
            <button
              className="px-3 py-1 rounded bg-emerald-600 text-white"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}