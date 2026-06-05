export const config = { runtime: 'edge' }

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url')
  const format = searchParams.get('format') || 'text'

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 })
  }

  const jinaUrl = `https://r.jina.ai/${targetUrl}`
  const headers = {
    Accept: format === 'html' ? 'text/html' : 'text/plain',
  }

  const key = process.env.VITE_JINA_API_KEY
  if (key && key !== 'none') {
    headers['Authorization'] = `Bearer ${key}`
  }

  try {
    const res = await fetch(jinaUrl, { headers })
    const text = await res.text()

    return new Response(text, {
      status: res.status,
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
