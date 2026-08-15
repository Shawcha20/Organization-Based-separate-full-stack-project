import { humanise } from '@/lib/format';

// Every status string in the system maps to one colour, so a green pill means
// the same thing on the admin, org and transaction pages.
const TONES = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  TRIAL: 'bg-sky-50 text-sky-700 ring-sky-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  INVITED: 'bg-amber-50 text-amber-700 ring-amber-200',
  FAILED: 'bg-red-50 text-red-700 ring-red-200',
  SUSPENDED: 'bg-red-50 text-red-700 ring-red-200',
  DISABLED: 'bg-slate-100 text-slate-600 ring-slate-200',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200',
  EXPIRED: 'bg-slate-100 text-slate-600 ring-slate-200',
  REFUNDED: 'bg-violet-50 text-violet-700 ring-violet-200',
  ROLLED_BACK: 'bg-orange-50 text-orange-700 ring-orange-200',
};

export default function Badge({ status, children }) {
  const tone = TONES[status] || 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {children || humanise(status)}
    </span>
  );
}
