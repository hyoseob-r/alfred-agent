export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { topic, rounds, summary } = req.body
  if (!topic || !rounds) return res.status(400).json({ error: 'topic and rounds are required' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (!serviceKey || !userId) {
    return res.status(500).json({ error: 'Server not configured (SUPABASE_SERVICE_ROLE_KEY or COUNCIL_USER_ID missing)' })
  }

  const id = 'c_claude_' + Date.now()

  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/council_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id,
        session_id: null,
        user_id: userId,
        topic: String(topic).slice(0, 200),
        rounds,
        summary: summary || null,
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('Supabase insert error:', err)
      return res.status(500).json({ error: err })
    }

    return res.status(200).json({ ok: true, id })
  } catch (e) {
    console.error('save-council error:', e)
    return res.status(500).json({ error: e.message })
  }
}
