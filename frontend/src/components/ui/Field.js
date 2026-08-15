'use client';

/**
 * Label, control and error message in one place, so every form in the app
 * reports validation the same way.
 */
export function Field({ label, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const base =
  'w-full rounded-md border px-3 py-2 text-sm shadow-sm transition placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-slate-100';

export function Input({ error, className = '', ...props }) {
  return (
    <input
      {...props}
      className={`${base} ${error ? 'border-red-400' : 'border-slate-300'} ${className}`}
    />
  );
}

export function Select({ error, className = '', children, ...props }) {
  return (
    <select
      {...props}
      className={`${base} ${error ? 'border-red-400' : 'border-slate-300'} ${className}`}
    >
      {children}
    </select>
  );
}
