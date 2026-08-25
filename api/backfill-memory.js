export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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
    // 1. 모든 Council 세션 조회 (rounds 포함)
    const sessions = await fetch(
      `${supabaseUrl}/rest/v1/council_sessions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&select=id,topic,rounds,created_at`,
      { headers }
    ).then(r => r.json())

    if (!sessions?.length) return res.status(200).json({ ok: true, message: 'No council sessions found', count: 0 })

    const memoryMap = {}   // agentId → [entries]
    let processedSteps = 0

    // 2. 각 세션의 각 라운드의 각 스텝에서 에이전트 발언 추출
    for (const session of sessions) {
      const date = (session.created_at || '').slice(0, 10) || 'unknown'
      const rounds = Array.isArray(session.rounds) ? session.rounds : []

      for (const round of rounds) {
        if (!round || typeof round !== 'object') continue
        const roundLabel = round.round === 'special' ? '레전드' : `${round.round}R`
        const steps = round.steps || []

        for (const step of steps) {
          if (!step.id || !step.result || step.status === 'error') continue
          if (step.result.trim().length < 20) continue // 너무 짧은 건 스킵

          const agentId = step.id
          const snippet = step.result.slice(0, 280) + (step.result.length > 280 ? '…' : '')
          const entry = `[${date} ${session.id} ${roundLabel}] ${snippet}`

          if (!memoryMap[agentId]) memoryMap[agentId] = []
          memoryMap[agentId].push(entry)
          processedSteps++
        }
      }
    }

    // 3. 각 에이전트별로 최근 5개 메모리만 유지하여 upsert
    const agentIds = Object.keys(memoryMap)
    for (const agentId of agentIds) {
      const entries = memoryMap[agentId].slice(-5) // 최근 5개
      const content = entries.join('\n\n')

      await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          type: 'agent_memory',
          title: `agent_memory_${agentId}`,
          content,
          tags: [agentId, 'memory'],
          user_id: userId,
          updated_at: new Date().toISOString(),
        }),
      })
    }

    // 4. Synthesis 갱신 — 마지막 세션의 마지막 에이전트 발언 기반
    const lastSession = sessions[sessions.length - 1]
    const lastRounds = lastSession.rounds || []
    const lastRound = lastRounds[lastRounds.length - 1]
    if (lastRound?.steps?.length) {
      const lastStep = [...lastRound.steps].reverse().find(s => s.status === 'done' && s.result)
      if (lastStep) {
        const synthContent = `[${(lastSession.created_at || '').slice(0, 10)} backfill]\n${lastStep.result.slice(0, 500)}`
        await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            type: 'agent_memory',
            title: 'council_synthesis_latest',
            content: synthContent,
            tags: ['synthesis', 'memory'],
            user_id: userId,
            updated_at: new Date().toISOString(),
          }),
        })
      }
    }

    return res.status(200).json({
      ok: true,
      sessions: sessions.length,
      agents: agentIds.length,
      totalSteps: processedSteps,
      agentMemories: Object.fromEntries(agentIds.map(id => [id, memoryMap[id].length])),
    })
  } catch (e) {
    console.error('backfill-memory error:', e)
    return res.status(500).json({ error: e.message })
  }
}
