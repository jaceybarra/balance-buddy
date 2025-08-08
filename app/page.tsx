"use client";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import Auth from "@/components/Auth";

type Checkin = {
  id: string;
  date: string;
  mood: number | null;
  stress: number | null;
  hours_worked: number | null;
  sleep_hours: number | null;
  note: string | null;
};

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    supabase
      .from("checkins")
      .select("*")
      .order("date", { ascending: false })
      .limit(14)
      .then(({ data }) => setCheckins((data ?? []) as any))
      .finally(() => setLoading(false));
  }, [session]);

  const today = useMemo(
    () => checkins.find((r) => r.date === todayStr) ?? null,
    [checkins, todayStr]
  );
  const last7 = useMemo(() => checkins.slice(0, 7), [checkins]);

  function score(c: Partial<Checkin> | null) {
    if (!c) return null;
    const mood = c.mood ?? 3;
    const stress = c.stress ?? 3;
    const hours = c.hours_worked ?? 8;
    const sleep = c.sleep_hours ?? 7;
    let s =
      100 -
      Math.max(hours - 9, 0) * 5 -
      Math.max(stress - 3, 0) * 8 +
      Math.max(sleep - 7, 0) * 3 +
      (mood - 3) * 6;
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  if (!session) return <Auth />;

  return (
    <div className="space-y-6">
      {/* Today */}
      <div className="rounded-lg border p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-3">Today</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </div>
        ) : today ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Metric label="Balance Score" value={String(score(today))} />
            <Metric label="Hours Worked" value={String(today.hours_worked ?? 0)} />
            <Metric label="Sleep (hrs)" value={String(today.sleep_hours ?? 0)} />
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500">No check-in yet today.</p>
            <a href="/checkin" className="underline">Go to Daily Check-in</a>
          </div>
        )}
      </div>

      {/* Last 7 days */}
      <div className="rounded-lg border p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Last 7 days</h3>
        {loading ? (
          <div className="grid md:grid-cols-7 grid-cols-2 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <MetricSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-7 grid-cols-2 gap-3">
            {last7.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 shadow-sm">
                <div className="text-xs text-gray-500">{c.date}</div>
                <div className="font-semibold">Score: {score(c)}</div>
                <div className="text-xs">
                  Mood {c.mood ?? "-"} / Stress {c.stress ?? "-"} / Sleep {c.sleep_hours ?? "-"}h
                </div>
              </div>
            ))}
            {last7.length === 0 && (
              <div className="text-sm text-gray-500">
                No check-ins yet. Do your first one → “Daily Check-in”.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tip of the Day */}
      <div className="rounded-lg border p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Tip of the Day</h3>
        <TipOfDay />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-6 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-lg border p-6 shadow-sm">
      <div className="h-3 w-24 bg-gray-200 rounded" />
      <div className="mt-2 h-8 w-20 bg-gray-200 rounded" />
    </div>
  );
}

function TipOfDay() {
  const [tip, setTip] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("tips")
      .select("*")
      .limit(1)
      .then(({ data }) => setTip(data?.[0] ?? null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-6 w-64 bg-gray-200 rounded" />;
  if (!tip) return <div className="text-sm text-gray-500">Add tips in the database to see one here.</div>;

  return (
    <div>
      <div className="text-sm text-gray-500">
        {tip.category} • {tip.trigger}
      </div>
      <p className="mt-1">{tip.copy}</p>
    </div>
  );
}