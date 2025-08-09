'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

export default function Nav() {
  const supabase = getSupabase();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    location.href = '/';
  }

  return (
    <nav className="border-b">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link href="/" className="font-semibold">Balance Buddy</Link>
        <div className="ml-auto flex items-center gap-3">
          {session ? (
            <>
              <Link href="/checkin">Check-in</Link>
              <Link href="/settings">Settings</Link>
              <button onClick={signOut} className="px-3 py-1 border rounded">Sign out</button>
            </>
          ) : (
            <Link href="/" className="px-3 py-1 border rounded">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}