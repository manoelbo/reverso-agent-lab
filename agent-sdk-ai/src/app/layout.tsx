import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reverso — Agente Investigativo',
  description: 'Agente de investigação jornalística OSINT powered by Vercel AI SDK',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
