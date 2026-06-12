export const config = { runtime: 'edge' }

// Detect if a URL can be fetched directly (server-side rendered)
// AJP/Smoothcomp matchlist pages are SSR and don't need Jina
function isDirectFetchable(url) {
  return url.includes('/schedule/matchlist') || url.includes('bjjcompsystem.com')
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url')
  const format = searchParams.get('format') || 'text'

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 })
  }

  try {
    let text

    if (isDirectFetchable(targetUrl)) {
      // Fetch directly — no Jina needed, saves tokens
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
      })
      text = await res.text()
    } else {
      // Use Jina for JS-rendered pages (brackets)
      const jinaUrl = `https://r.jina.ai/${targetUrl}`
      const headers = { Accept: format === 'html' ? 'text/html' : 'text/plain' }
      const key = process.env.VITE_JINA_API_KEY
      if (key && key !== 'none') headers['Authorization'] = `Bearer ${key}`
      const res = await fetch(jinaUrl, { headers })
      if (!res.ok) return new Response(`Jina error: ${res.status}`, { status: res.status })
      text = await res.text()
    }

    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 500 })
  }
}
