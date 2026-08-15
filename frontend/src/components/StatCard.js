export default function StatCard({ label, value, tone = 'default' }) {
  const valueColour = tone === 'danger' ? 'text-red-600' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColour}`}>{value}</p>
    </div>
  );
}
