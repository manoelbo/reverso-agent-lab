import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Reverso — AI SDK',
  description: 'Agente investigativo Reverso com Vercel AI SDK e AI Elements',
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{props.children}</body>
    </html>
  )
}
