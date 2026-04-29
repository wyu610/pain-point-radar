import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Pain-Point Radar',
  description: 'Daily ranking of complaints + pain points across Reddit and GitHub',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <h1>Pain-Point Radar</h1>
          <nav>
            <a href="/">Today</a>
            <a href="/weekly">Weekly</a>
            <a href="/settings">Settings</a>
            <a href="/api/health" target="_blank" rel="noreferrer">Health</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
