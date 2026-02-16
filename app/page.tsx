export default function Home() {
  const B = 'https://tedzz.vercel.app'

  const endpoints = [
    {
      m: 'GET', path: '/api/home',
      desc: 'Homepage — banners, sections, categories, all dramas',
      url: `${B}/api/home`,
    },
    {
      m: 'GET', path: '/api/dramas',
      desc: 'List dramas (paginated)',
      params: 'page=1, category=romance',
      url: `${B}/api/dramas?page=1`,
    },
    {
      m: 'GET', path: '/api/drama/:slug',
      desc: 'Drama detail — info + all episodes',
      url: `${B}/api/drama/some-slug`,
    },
    {
      m: 'GET', path: '/api/stream/:slug',
      desc: 'Stream URL for specific episode',
      params: 'ep=1 (episode number)',
      url: `${B}/api/stream/some-slug?ep=1`,
    },
    {
      m: 'GET', path: '/api/search',
      desc: 'Search dramas by keyword',
      params: 'q=keyword (required), page=1',
      url: `${B}/api/search?q=cinta`,
    },
    {
      m: 'GET', path: '/api/discover',
      desc: '🔧 Debug — discover working API endpoints & site structure',
      url: `${B}/api/discover`,
    },
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 50 }}>
        <div style={{ fontSize: '3rem', marginBottom: 8 }}>🎬</div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 6, background: 'linear-gradient(135deg, #22d3ee, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          GoodShort API
        </h1>
        <p style={{ color: '#666', fontSize: '1.05rem' }}>
          REST API for scraping drama data from GoodShort
        </p>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
          <span style={{ background: '#1a1a2e', border: '1px solid #333', padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', color: '#22d3ee' }}>Next.js</span>
          <span style={{ background: '#1a1a2e', border: '1px solid #333', padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', color: '#a855f7' }}>Cheerio</span>
          <span style={{ background: '#1a1a2e', border: '1px solid #333', padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', color: '#22c55e' }}>Vercel</span>
        </div>
      </div>

      {/* Endpoints */}
      <h2 style={{ fontSize: '1.3rem', marginBottom: 20, color: '#fff' }}>📡 Endpoints</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        {endpoints.map((ep, i) => (
          <div key={i} style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 20, transition: 'border-color 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ background: '#22c55e20', color: '#22c55e', padding: '2px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace' }}>
                {ep.m}
              </span>
              <code style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 600 }}>{ep.path}</code>
            </div>
            <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: 4 }}>{ep.desc}</p>
            {ep.params && (
              <p style={{ color: '#555', fontSize: '0.8rem', marginBottom: 8 }}>
                <span style={{ color: '#666' }}>Params:</span> {ep.params}
              </p>
            )}
            <div style={{ background: '#0a0a0a', borderRadius: 8, padding: '10px 14px', overflow: 'auto' }}>
              <a href={ep.url} target="_blank" rel="noopener" style={{ color: '#22d3ee', fontSize: '0.8rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {ep.url}
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Response Format */}
      <div style={{ marginTop: 40, background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 12, color: '#fff' }}>📦 Response Format</h2>
        <pre style={{ background: '#0a0a0a', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: '0.8rem', lineHeight: 1.7, color: '#a5f3fc' }}>
{`{
  "ok": true,
  "data": { ... },
  "cached": false,
  "ts": "2024-01-01T00:00:00.000Z",
  "source": "nextjs | api | html"
}`}
        </pre>
      </div>

      {/* Quick Start */}
      <div style={{ marginTop: 24, background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 12, color: '#fff' }}>⚡ Quick Start</h2>
        <pre style={{ background: '#0a0a0a', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: '0.8rem', lineHeight: 1.7, color: '#86efac' }}>
{`# 1. Get all dramas
curl ${B}/api/home

# 2. Get drama detail
curl ${B}/api/drama/SLUG_HERE

# 3. Get stream URL
curl "${B}/api/stream/SLUG_HERE?ep=1"

# 4. Search
curl "${B}/api/search?q=romance"

# 5. Debug (run this first!)
curl ${B}/api/discover`}
        </pre>
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', marginTop: 50, padding: '20px 0', borderTop: '1px solid #222', color: '#444', fontSize: '0.85rem' }}>
        <p>tedzz.vercel.app — GoodShort Scraper API</p>
      </footer>
    </div>
  )
}
