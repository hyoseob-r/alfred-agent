export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { github_login, proxy_url } = req.body
  if (!github_login || !proxy_url) return res.status(400).json({ error: 'github_login and proxy_url required' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const resp = await fetch(`${supabaseUrl}/rest/v1/user_proxies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ github_login, proxy_url, updated_at: new Date().toISOString() }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    console.error('save-proxy error:', err)
    return res.status(500).json({ error: err })
  }

  return res.status(200).json({ ok: true })
}
