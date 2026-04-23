export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { github_login } = req.query
  if (!github_login) return res.status(400).json({ error: 'github_login required' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/user_proxies?github_login=eq.${encodeURIComponent(github_login)}&select=proxy_url,updated_at&limit=1`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Accept': 'application/json',
      },
    }
  )

  if (!resp.ok) return res.status(200).json({ proxy_url: null })
  const data = await resp.json()
  const row = data?.[0]
  if (!row?.proxy_url) return res.status(200).json({ proxy_url: null })

  // 2시간 이상 지난 URL은 만료 처리 (프록시가 꺼진 것으로 간주)
  const age = Date.now() - new Date(row.updated_at).getTime()
  if (age > 2 * 60 * 60 * 1000) return res.status(200).json({ proxy_url: null, expired: true })

  return res.status(200).json({ proxy_url: row.proxy_url, updated_at: row.updated_at })
}
