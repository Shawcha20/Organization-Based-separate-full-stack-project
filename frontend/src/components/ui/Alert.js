const TONES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
};

export default function Alert({ tone = 'info', children }) {
  if (!children) return null;
  return (
    <div className={`rounded-md border px-3 py-2.5 text-sm ${TONES[tone]}`}>{children}</div>
  );
}
