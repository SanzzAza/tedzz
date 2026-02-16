export default function Home() {
  const B = 'https://tedzz.vercel.app'
  const endpoints = [
    { m:'GET', p:'/api/home', d:'Homepage data — semua drama, banner, kategori', u:`${B}/api/home` },
    { m:'GET', p:'/api/dramas', d:'List drama (paginated)', pr:'page, category', u:`${B}/api/dramas?page=1` },
    { m:'GET', p:'/api/drama/[slug]', d:'Detail drama + semua episode', u:`${B}/api/drama/contoh-slug` },
    { m:'GET', p:'/api/stream/[slug]', d:'Stream URL episode', pr:'ep (nomor episode)', u:`${B}/api/stream/contoh-slug?ep=1` },
    { m:'GET', p:'/api/search', d:'Cari drama', pr:'q (required)', u:`${B}/api/search?q=cinta` },
    { m:'GET', p:'/api/discover', d:'🔧 Debug — cek endpoint yang aktif', u:`${B}/api/discover` },
  ]

  return (
    <div style={{maxWidth:900,margin:'0 auto',padding:'40px 20px'}}>
      <div style={{textAlign:'center',marginBottom:50}}>
        <div style={{fontSize:'3rem'}}>🎬</div>
        <h1 style={{fontSize:'2.2rem',fontWeight:800,marginBottom:6,background:'linear-gradient(135deg,#22d3ee,#a855f7)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
          GoodShort API
        </h1>
        <p style={{color:'#666'}}>REST API for GoodShort drama data</p>
        <div style={{marginTop:14,display:'flex',justifyContent:'center',gap:8}}>
          {['Next.js','Cheerio','Vercel'].map(t=>(
            <span key={t} style={{background:'#1a1a2e',border:'1px solid #333',padding:'4px 12px',borderRadius:20,fontSize:'0.78rem',color:'#22d3ee'}}>{t}</span>
          ))}
        </div>
      </div>

      <h2 style={{fontSize:'1.3rem',marginBottom:20}}>📡 Endpoints</h2>
      <div style={{display:'grid',gap:14}}>
        {endpoints.map((ep,i)=>(
          <div key={i} style={{background:'#111',border:'1px solid #222',borderRadius:12,padding:20}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <span style={{background:'#22c55e20',color:'#22c55e',padding:'2px 10px',borderRadius:6,fontSize:'0.75rem',fontWeight:700,fontFamily:'monospace'}}>{ep.m}</span>
              <code style={{fontSize:'1.05rem',color:'#fff',fontWeight:600}}>{ep.p}</code>
            </div>
            <p style={{color:'#888',fontSize:'0.9rem'}}>{ep.d}</p>
            {ep.pr && <p style={{color:'#555',fontSize:'0.8rem',marginTop:4}}>Params: {ep.pr}</p>}
            <div style={{background:'#0a0a0a',borderRadius:8,padding:'10px 14px',marginTop:8,overflow:'auto'}}>
              <a href={ep.u} target="_blank" rel="noopener" style={{color:'#22d3ee',fontSize:'0.8rem',fontFamily:'monospace',wordBreak:'break-all'}}>{ep.u}</a>
            </div>
          </div>
        ))}
      </div>

      <div style={{marginTop:40,background:'#111',border:'1px solid #222',borderRadius:12,padding:24}}>
        <h2 style={{fontSize:'1.1rem',marginBottom:12}}>⚡ Quick Start</h2>
        <pre style={{background:'#0a0a0a',padding:16,borderRadius:8,overflow:'auto',fontSize:'0.8rem',lineHeight:1.7,color:'#86efac'}}>
{`# 1. Debug dulu (WAJIB pertama kali)
curl ${B}/api/discover

# 2. Homepage + semua drama
curl ${B}/api/home

# 3. Detail drama
curl ${B}/api/drama/SLUG

# 4. Stream URL
curl "${B}/api/stream/SLUG?ep=1"

# 5. Search
curl "${B}/api/search?q=romance"`}
        </pre>
      </div>

      <footer style={{textAlign:'center',marginTop:50,paddingTop:20,borderTop:'1px solid #222',color:'#444',fontSize:'0.85rem'}}>
        tedzz.vercel.app
      </footer>
    </div>
  )
}
