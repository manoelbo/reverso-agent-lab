import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Reverso — AI SDK',
  description: 'Refatoração do Reverso com Vercel AI SDK',
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{props.children}</body>
    </html>
  )
}
