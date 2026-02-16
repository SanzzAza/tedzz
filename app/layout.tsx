import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GoodShort API — tedzz',
  description: 'REST API for GoodShort drama data',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
