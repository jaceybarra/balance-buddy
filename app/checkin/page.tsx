"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { getSupabase } from "@/lib/supabaseClient";

export default function CheckinPage() {
  const supabase = getSupabase();
  const [session, setSession] = useState<any>(null);
  const [userId, setUserId] = useState<string>("");
  const [form, setForm] = useState({
    mood: 3,
    stress: 3,
    hours_worked: 8,
    sleep_hours: 7,
    note: "",
  });
  const today = format(new Date(), "yyyy-MM-dd");

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return alert("No user id");

    const { error: upsertErr } = await supabase
      .from("users")
      .upsert({ id: userId })
      .select()
      .single();
    if (upsertErr) return alert("Profile upsert failed: " + upsertErr.message);

    const { data: existing } = await supabase
      .from("checkins")
      .select("id")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase.from("checkins").update(form).eq("id", existing.id);
      if (error) alert(error.message);
      else { alert("Check-in updated."); location.href = "/"; }
    } else {
      const { error } = await supabase
        .from("checkins")
        .insert({ user_id: userId, date: today, ...form });
      if (error) alert(error.message);
      else { alert("Check-in created."); location.href = "/"; }
    }
  }

  if (!session) return <div className="rounded-lg border p-6 shadow-sm">Please sign in first.</div>;

  return (
    <div className="rounded-lg border p-6 shadow-sm max-w-xl">
      <h2 className="text-xl font-semibold mb-3">Daily Check-in</h2>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="mood" className="block text-sm font-medium">Mood (1-5)</label>
          <input id="mood" type="number" min={1} max={5} value={form.mood}
            onChange={(e) => setForm((f) => ({ ...f, mood: Number(e.target.value) }))}
            className="mt-1 w-full border rounded p-2" />
        </div>
        <div>
          <label htmlFor="stress" className="block text-sm font-medium">Stress (1-5)</label>
          <input id="stress" type="number" min={1} max={5} value={form.stress}
            onChange={(e) => setForm((f) => ({ ...f, stress: Number(e.target.value) }))}
            className="mt-1 w-full border rounded p-2" />
        </div>
        <div>
          <label htmlFor="hours" className="block text-sm font-medium">Hours Worked</label>
          <input id="hours" type="number" min={0} max={24} step={0.5} value={form.hours_worked}
            onChange={(e) => setForm((f) => ({ ...f, hours_worked: Number(e.target.value) }))}
            className="mt-1 w-full border rounded p-2" />
        </div>
        <div>
          <label htmlFor="sleep" className="block text-sm font-medium">Sleep (hours)</label>
          <input id="sleep" type="number" min={0} max={24} step={0.5} value={form.sleep_hours}
            onChange={(e) => setForm((f) => ({ ...f, sleep_hours: Number(e.target.value) }))}
            className="mt-1 w-full border rounded p-2" />
        </div>
        <div>
          <label htmlFor="note" className="block text-sm font-medium">Note</label>
          <textarea id="note" value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="mt-1 w-full border rounded p-2" />
        </div>
        <button type="submit" className="inline-flex items-center px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white">
          Save Check-in
        </button>
      </form>
    </div>
  );
}
