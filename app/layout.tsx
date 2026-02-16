import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GoodShort API',
  description: 'REST API for GoodShort drama data',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
