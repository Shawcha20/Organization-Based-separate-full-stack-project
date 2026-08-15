'use client';

import { money, interval } from '@/lib/format';

/** Selectable plan tile, shared by signup and the subscription page. */
export default function PlanCard({ plan, selected, onSelect, disabled, badge }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(plan)}
      disabled={disabled}
      className={`w-full rounded-lg border p-4 text-left transition
        ${selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 bg-white hover:border-slate-300'}
        ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-900">{plan.name}</span>
        {badge && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{badge}</span>
        )}
      </div>

      <p className="mt-1 text-2xl font-semibold text-slate-900">
        {money(plan.price, plan.currency)}
        <span className="ml-1 text-sm font-normal text-slate-500">{interval(plan.interval)}</span>
      </p>

      {plan.description && <p className="mt-1 text-sm text-slate-500">{plan.description}</p>}

      <ul className="mt-3 space-y-1 text-sm text-slate-600">
        {plan.features?.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span className="text-brand-600">✓</span>
            {feature}
          </li>
        ))}
      </ul>
    </button>
  );
}
