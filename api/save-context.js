export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, type = 'general', title, content, tags = [] } = req.body

  // backfill-memory 액션
  if (action === 'backfill-memory') return handleBackfillMemory(req, res)

  if (!title || !content) return res.status(400).json({ error: 'title and content required' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  try {
    // 같은 title이 있으면 content 업데이트 (upsert 흉내)
    const existResp = await fetch(
      `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(title)}&select=id`,
      { headers }
    )
    const existing = await existResp.json()

    let resp
    if (Array.isArray(existing) && existing.length > 0) {
      // UPDATE
      resp = await fetch(
        `${supabaseUrl}/rest/v1/context_notes?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ content, tags, type }),
        }
      )
    } else {
      // INSERT
      resp = await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: userId, type, title, content, tags }),
      })
    }

    if (!resp.ok) {
      const err = await resp.text()
      return res.status(500).json({ error: err })
    }

    return res.status(200).json({ ok: true, title, type })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

// Backfill memory handler (이전 backfill-memory.js에서 이동)
async function handleBackfillMemory(req, res) {
  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID
  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }

  try {
    const sessions = await fetch(
      `${supabaseUrl}/rest/v1/council_sessions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&select=id,topic,rounds,created_at`,
      { headers }
    ).then(r => r.json())

    if (!sessions?.length) return res.status(200).json({ ok: true, message: 'No council sessions found', count: 0 })

    const memoryMap = {}
    let processedSteps = 0

    for (const session of sessions) {
      const date = (session.created_at || '').slice(0, 10) || 'unknown'
      const rounds = Array.isArray(session.rounds) ? session.rounds : []
      for (const round of rounds) {
        if (!round || typeof round !== 'object') continue
        const roundLabel = round.round === 'special' ? '레전드' : `${round.round}R`
        const steps = round.steps || []
        for (const step of steps) {
          if (!step.id || !step.result || step.status === 'error') continue
          if (step.result.trim().length < 20) continue
          const agentId = step.id
          const snippet = step.result.slice(0, 280) + (step.result.length > 280 ? '…' : '')
          if (!memoryMap[agentId]) memoryMap[agentId] = []
          memoryMap[agentId].push(`[${date} ${session.id} ${roundLabel}] ${snippet}`)
          processedSteps++
        }
      }
    }

    const agentIds = Object.keys(memoryMap)
    for (const agentId of agentIds) {
      const entries = memoryMap[agentId].slice(-5)
      await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ type: 'agent_memory', title: `agent_memory_${agentId}`, content: entries.join('\n\n'), tags: [agentId, 'memory'], user_id: userId, updated_at: new Date().toISOString() }),
      })
    }

    const lastSession = sessions[sessions.length - 1]
    const lastRounds = lastSession.rounds || []
    const lastRound = lastRounds[lastRounds.length - 1]
    if (lastRound?.steps?.length) {
      const lastStep = [...lastRound.steps].reverse().find(s => s.status === 'done' && s.result)
      if (lastStep) {
        await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ type: 'agent_memory', title: 'council_synthesis_latest', content: `[${(lastSession.created_at || '').slice(0, 10)} backfill]\n${lastStep.result.slice(0, 500)}`, tags: ['synthesis', 'memory'], user_id: userId, updated_at: new Date().toISOString() }),
        })
      }
    }

    return res.status(200).json({ ok: true, sessions: sessions.length, agents: agentIds.length, totalSteps: processedSteps })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
