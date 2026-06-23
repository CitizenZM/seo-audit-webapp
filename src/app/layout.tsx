import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SEO Audit & Action Plan',
  description: 'Premium SEO dashboard and action plan generator.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[var(--dark)] text-[var(--text)]">
        {children}
      </body>
    </html>
  );
}
