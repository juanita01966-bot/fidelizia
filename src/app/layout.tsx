import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Dynamind Wallet & Retention Suite | Fidelización Nativa Apple & Google Wallet',
  description:
    'Sustituye tarjetas de cartón y aplicaciones pesadas por pases nativos en Apple Wallet y Google Wallet con escáner POS antifraude, CRM RFM, Review Gate y reservas sincronizadas.',
  manifest: '/manifest.json',
  themeColor: '#08080a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-background text-foreground min-h-screen antialiased flex flex-col selection:bg-brand-500/30 selection:text-white">
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: '#0e0e11',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f4f4f5',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 0 25px -5px rgba(139, 92, 246, 0.25)',
            },
          }}
        />
      </body>
    </html>
  );
}
