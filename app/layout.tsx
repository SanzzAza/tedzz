import './globals.css'
export const metadata = { title: 'GoodShort API', description: 'GoodShort Scraper API' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
