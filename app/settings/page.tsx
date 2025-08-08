"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const [session, setSession] = useState<any>(null);
  const [userId, setUserId] = useState<string>("");
  const [profile, setProfile] = useState({
    full_name: "",
    timezone: "America/Denver",
    preferred_nudge_time: "20:00",
    goal_weekly_hours: 45,
    plan_tier: "free",
  });
  const [ouraConnected, setOuraConnected] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);

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
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (data) {
        setProfile({
          full_name: data.full_name ?? "",
          timezone: data.timezone ?? "America/Denver",
          preferred_nudge_time: data.preferred_nudge_time ?? "20:00",
          goal_weekly_hours: data.goal_weekly_hours ?? 45,
          plan_tier: data.plan_tier ?? "free",
        });
      }
      const { data: ot } = await supabase
        .from("oura_tokens")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      setOuraConnected(!!ot);

      const { data: ct } = await supabase
        .from("calendar_tokens")
        .select("user_id")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
      setGcalConnected(!!ct);
    })();
  }, [userId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return alert("No user id");
    const payload = { id: userId, ...profile };
    const { error } = await supabase
      .from("users")
      .upsert(payload)
      .select()
      .single();
    if (error) alert("Save failed: " + error.message);
    else alert("Profile updated.");
  }

  if (!session) return <div className="rounded-lg border p-6 shadow-sm">Please sign in first.</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-6 shadow-sm max-w-xl">
        <h2 className="text-xl font-semibold mb-4">Settings</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">Full Name</label>
            <input
              id="name"
              className="mt-1 w-full border rounded p-2"
              value={profile.full_name}
              onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="tz" className="block text-sm font-medium">Timezone (IANA)</label>
            <input
              id="tz"
              className="mt-1 w-full border rounded p-2"
              value={profile.timezone}
              onChange={(e) => setProfile((p) => ({ ...p, timezone: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="nudge" className="block text-sm font-medium">Preferred Nudge Time (HH:mm)</label>
            <input
              id="nudge"
              className="mt-1 w-full border rounded p-2"
              value={profile.preferred_nudge_time}
              onChange={(e) => setProfile((p) => ({ ...p, preferred_nudge_time: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="goal" className="block text-sm font-medium">Weekly Hours Goal</label>
            <input
              id="goal"
              type="number"
              className="mt-1 w-full border rounded p-2"
              value={profile.goal_weekly_hours}
              onChange={(e) => setProfile((p) => ({ ...p, goal_weekly_hours: Number(e.target.value) }))}
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded">
            Save
          </button>
        </form>
      </div>

      {/* Integrations */}
      <div className="rounded-lg border p-6 shadow-sm max-w-xl">
        <h3 className="text-lg font-semibold mb-3">Integrations</h3>

        {/* Oura */}
        <div className="p-4 border rounded mb-4 flex items-center justify-between">
          <div>
            <div className="font-medium">Oura</div>
            {ouraConnected ? (
              <span className="text-green-600 text-sm">Connected</span>
            ) : (
              <span className="text-red-600 text-sm">Not connected</span>
            )}
          </div>
          {ouraConnected ? (
            <button
              className="px-3 py-1 bg-gray-200 rounded"
              onClick={() => (location.href = "/api/oura/sync?redirect=/settings")}
            >
              Sync now
            </button>
          ) : (
            <button
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
              onClick={() => (location.href = "/api/oura/start")}
            >
              Connect Oura
            </button>
          )}
        </div>

        {/* Google Calendar */}
        <div className="p-4 border rounded flex items-center justify-between">
          <div>
            <div className="font-medium">Google Calendar</div>
            {gcalConnected ? (
              <span className="text-green-600 text-sm">Connected</span>
            ) : (
              <span className="text-red-600 text-sm">Not connected</span>
            )}
          </div>
          {gcalConnected ? (
            <button
              className="px-3 py-1 bg-gray-200 rounded"
              onClick={() =>
                (location.href = "/api/calendar/sync?provider=google&redirect=/settings")
              }
            >
              Sync now
            </button>
          ) : (
            <button
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
              onClick={() => (location.href = "/api/calendar/google/start")}
            >
              Connect Google
            </button>
          )}
        </div>
      </div>
    </div>
  );
}