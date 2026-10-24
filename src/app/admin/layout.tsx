import React from 'react';
import { AdminNavbar } from '@/components/navigation/AdminNavbar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <AdminNavbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
      <footer className="border-t border-white/[0.06] bg-black/40 py-4 text-center text-xs text-zinc-500 font-mono">
        Dynamind Wallet CRM v1.0 · Cifrado SHA-256 · Conexión WebSocket Realtime
      </footer>
    </div>
  );
}
