import Link from 'next/link';

/** Shared frame for every page you can reach while logged out. */
export default function AuthShell({ title, subtitle, children, footer, wide = false }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <Link href="/" className="mb-6 block text-center text-lg font-semibold text-slate-900">
          Octopi<span className="text-brand-600"> Digital</span>
        </Link>

        <div className="rounded-lg border border-slate-200 bg-white px-6 py-7 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {footer && <p className="mt-5 text-center text-sm text-slate-600">{footer}</p>}
      </div>
    </main>
  );
}
