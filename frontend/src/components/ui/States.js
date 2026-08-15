'use client';

import Button from './Button';

export function Loading({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}
    </div>
  );
}

/**
 * Shows the message the API sent - which is always a safe, human message, never
 * a stack trace - plus a way to try again.
 */
export function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-6 text-center">
      <p className="text-sm font-medium text-red-800">
        {error?.message || 'Something went wrong'}
      </p>
      {onRetry && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', description, action } = {}) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
