import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { displayFont, monoFont, sansFont } from './fonts';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: { default: 'RedSky — RSM Capital', template: '%s · RedSky' },
  description: 'RedSky — RSM Capital’s internal operating system.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#941B1E' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The theme cookie mirrors the employee's saved preference so the first paint is already correct.
  const theme = (await cookies()).get('redsky_theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <html lang="en" data-theme={theme} className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}>
      <body className="rs">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
