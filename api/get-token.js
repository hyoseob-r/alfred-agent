export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { user_id } = req.query
  if (!user_id) return res.status(400).json({ error: 'user_id required' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/user_tokens?user_id=eq.${encodeURIComponent(user_id)}&select=claude_token&limit=1`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Accept': 'application/json',
      },
    }
  )

  if (!resp.ok) return res.status(200).json({ token: null })
  const data = await resp.json()
  return res.status(200).json({ token: data?.[0]?.claude_token || null })
}
