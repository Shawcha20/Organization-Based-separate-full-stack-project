'use client';

import { Loading, ErrorState, Empty } from './States';

/**
 * One table for the whole app. It owns the loading, error and empty states so
 * no page has to reimplement them, and it scrolls horizontally on small
 * screens instead of breaking the layout.
 */
export default function Table({ columns, rows, isLoading, error, onRetry, empty, footer }) {
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows?.length) return <Empty {...empty} />;

  return (
    <div>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                    column.align === 'right' ? 'text-right' : ''
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row._id || row.id || index} className="hover:bg-slate-50">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-3 align-middle text-slate-700 ${
                      column.align === 'right' ? 'text-right' : ''
                    }`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
