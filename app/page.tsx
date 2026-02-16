export default function HomePage() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: '900px',
        margin: '0 auto',
        padding: '40px 20px',
        color: '#e0e0e0',
        background: '#0a0a0a',
        minHeight: '100vh',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '50px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>
          🎬 GoodShort API
        </h1>
        <p style={{ color: '#888', fontSize: '1.1rem' }}>
          REST API to access drama data from GoodShort
        </p>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {[
          {
            method: 'GET',
            path: '/api/home',
            desc: 'Homepage data — banners, sections, categories',
            example: `${baseUrl}/api/home`,
          },
          {
            method: 'GET',
            path: '/api/dramas',
            desc: 'List all dramas with pagination',
            params: 'page (int), category (string)',
            example: `${baseUrl}/api/dramas?page=1`,
          },
          {
            method: 'GET',
            path: '/api/drama/:slug',
            desc: 'Drama detail + all episodes',
            example: `${baseUrl}/api/drama/some-drama-slug`,
          },
          {
            method: 'GET',
            path: '/api/search',
            desc: 'Search dramas by keyword',
            params: 'q (string, required), page (int)',
            example: `${baseUrl}/api/search?q=romance`,
          },
          {
            method: 'GET',
            path: '/api/stream',
            desc: 'Get stream/video URL for an episode',
            params: 'url (string, required) — episode page URL',
            example: `${baseUrl}/api/stream?url=https://...`,
          },
          {
            method: 'GET',
            path: '/api/discover',
            desc: '🔧 Debug — discover working API endpoints',
            example: `${baseUrl}/api/discover`,
          },
        ].map((endpoint, i) => (
          <div
            key={i}
            style={{
              background: '#151515',
              border: '1px solid #333',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span
                style={{
                  background: endpoint.method === 'GET' ? '#22c55e' : '#3b82f6',
                  color: '#000',
                  padding: '2px 10px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                }}
              >
                {endpoint.method}
              </span>
              <code style={{ fontSize: '1.1rem', color: '#fff' }}>
                {endpoint.path}
              </code>
            </div>
            <p style={{ color: '#999', margin: '8px 0' }}>{endpoint.desc}</p>
            {endpoint.params && (
              <p style={{ color: '#666', fontSize: '0.9rem' }}>
                <strong>Params:</strong> {endpoint.params}
              </p>
            )}
            <div
              style={{
                background: '#0d0d0d',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '10px',
                overflow: 'auto',
              }}
            >
              <code style={{ color: '#22d3ee', fontSize: '0.85rem' }}>
                <a
                  href={endpoint.example}
                  target="_blank"
                  rel="noopener"
                  style={{ color: '#22d3ee', textDecoration: 'none' }}
                >
                  {endpoint.example}
                </a>
              </code>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '50px',
          padding: '24px',
          background: '#151515',
          borderRadius: '12px',
          border: '1px solid #333',
        }}
      >
        <h2 style={{ marginBottom: '15px' }}>📦 Response Format</h2>
        <pre
          style={{
            background: '#0d0d0d',
            padding: '20px',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '0.85rem',
            lineHeight: '1.6',
          }}
        >
          {JSON.stringify(
            {
              success: true,
              data: '...',
              cached: false,
              timestamp: '2024-01-01T00:00:00.000Z',
              source: 'ssr_data | api | html',
            },
            null,
            2
          )}
        </pre>
      </div>

      <footer style={{ textAlign: 'center', marginTop: '40px', color: '#555' }}>
        <p>Built with Next.js + Cheerio | Deployed on Vercel</p>
      </footer>
    </div>
  );
}
