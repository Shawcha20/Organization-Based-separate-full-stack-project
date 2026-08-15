import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'Octopi Digital',
  description: 'Multi-tenant SaaS subscription platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
