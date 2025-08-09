'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

export default function SettingsPage() {
  const supabase = getSupabase();
  const [session, setSession] = useState<any>(null);
  const [userId, setUserId] = useState<string>('');
  const [profile, setProfile] = useState({
    full_name: '',
    timezone: 'America/Denver',
    preferred_nudge_time: '20:00',
    goal_weekly_hours: 45,
    plan_tier: 'free',
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      const id = data.session?.user?.id;
      if (id) setUserId(id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      const id = s?.user?.id;
      if (id) setUserId(id);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
      if (data) {
        setProfile({
          full_name: data.full_name ?? '',
          timezone: data.timezone ?? 'America/Denver',
          preferred_nudge_time: data.preferred_nudge_time ?? '20:00',
          goal_weekly_hours: data.goal_weekly_hours ?? 45,
          plan_tier: data.plan_tier ?? 'free',
        });
      }
    })();
  }, [userId, supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return alert('No user id');
    const payload = { id: userId, ...profile };
    const { error } = await supabase.from('users').upsert(payload).select().single();
    if (error) alert(error.message);
    else alert('Saved');
  }

  if (!session) return <div className="rounded border p-6">Please sign in first.</div>;

  return (
    <div className="space-y-6">
      <div className="rounded border p-6 max-w-xl shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Settings</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="name" className="text-sm">Full Name</label>
            <input id="name" className="mt-1 w-full rounded border px-3 py-2"
                   value={profile.full_name}
                   onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}/>
          </div>
          <div>
            <label htmlFor="tz" className="text-sm">Timezone (IANA)</label>
            <input id="tz" className="mt-1 w-full rounded border px-3 py-2"
                   value={profile.timezone}
                   onChange={(e) => setProfile((p) => ({ ...p, timezone: e.target.value }))}/>
          </div>
          <div>
            <label htmlFor="nudge" className="text-sm">Preferred Nudge Time (HH:mm)</label>
            <input id="nudge" className="mt-1 w-full rounded border px-3 py-2"
                   value={profile.preferred_nudge_time}
                   onChange={(e) => setProfile((p) => ({ ...p, preferred_nudge_time: e.target.value }))}/>
          </div>
          <div>
            <label htmlFor="goal" className="text-sm">Weekly Hours Goal</label>
            <input id="goal" type="number" className="mt-1 w-full rounded border px-3 py-2"
                   value={profile.goal_weekly_hours}
                   onChange={(e) => setProfile((p) => ({ ...p, goal_weekly_hours: Number(e.target.value) }))}/>
          </div>
          <button className="rounded border px-3 py-2">Save</button>
        </form>
      </div>
    </div>
  );
}