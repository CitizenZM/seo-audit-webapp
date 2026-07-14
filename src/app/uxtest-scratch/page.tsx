'use client';

import { useState } from 'react';
import Sidebar from '../dashboard/Sidebar';
import TopBar from '../dashboard/TopBar';

export default function UxTestPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <Sidebar active="overview" domain="totencarry.com" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0">
        <TopBar url="https://totencarry.com" onMenuClick={() => setSidebarOpen(true)} />
        <main className="p-4 sm:p-6">
          <p className="text-sm text-[var(--ink-2)]">Scratch route for testing Sidebar/TopBar mobile drawer wiring. Not linked from anywhere.</p>
        </main>
      </div>
    </div>
  );
}
