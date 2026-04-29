const SUPABASE_URL = 'https://atwztuelyhwtohylbypv.supabase.co'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const { feedback_id, author = 'claude', content } = req.body || {}
  if (!feedback_id || !content) return res.status(400).json({ error: 'feedback_id and content required' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Prefer': 'return=representation',
  }

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/feedback_comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ feedback_id, author, content }),
  })
  const data = await resp.json()
  if (!resp.ok) return res.status(500).json({ error: data })
  return res.status(200).json(data[0])
}
