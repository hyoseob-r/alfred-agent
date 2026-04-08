export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

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
    // 병렬로 모두 가져오기
    const [listRaw, notesRaw] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/council_sessions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=5&select=id,topic,summary,created_at`,
        { headers }
      ).then(r => r.json()),
      fetch(
        `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&select=type,title,content,tags,updated_at`,
        { headers }
      ).then(r => r.json()),
    ])

    const sessions = Array.isArray(listRaw) ? listRaw : []
    const notes = Array.isArray(notesRaw) ? notesRaw : []

    // 최신 council 전체 내용
    let latestFull = null
    if (sessions.length > 0) {
      const latestArr = await fetch(
        `${supabaseUrl}/rest/v1/council_sessions?id=eq.${encodeURIComponent(sessions[0].id)}&select=*`,
        { headers }
      ).then(r => r.json())
      latestFull = Array.isArray(latestArr) ? (latestArr[0] || null) : null
    }

    const context = {
      generated_at: new Date().toISOString(),
      briefing: buildBriefing(sessions, latestFull, notes),
      sessions: sessions.map(s => ({
        id: s.id,
        topic: s.topic,
        summary: s.summary,
        created_at: s.created_at,
      })),
      context_notes: notes,
      latest_full: latestFull ? {
        id: latestFull.id,
        topic: latestFull.topic,
        rounds_count: latestFull.rounds?.length || 0,
        summary: latestFull.summary,
        rounds: latestFull.rounds,
      } : null,
    }

    return res.status(200).json(context)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

function buildBriefing(sessions, latest, notes) {
  const lines = []

  lines.push('=== 인수인계 브리핑 ===')
  lines.push(`생성: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`)
  lines.push('')

  // ── 학습된 컨텍스트 노트 ──
  if (notes && notes.length > 0) {
    const byType = {}
    notes.forEach(n => {
      if (!byType[n.type]) byType[n.type] = []
      byType[n.type].push(n)
    })

    lines.push('[학습된 지침 및 맥락]')
    Object.entries(byType).forEach(([type, items]) => {
      lines.push(`▸ ${type}`)
      items.forEach(n => {
        lines.push(`  • [${n.title}] ${n.content}`)
      })
    })
    lines.push('')
  }

  // ── Council 세션 ──
  if (!sessions || sessions.length === 0) {
    lines.push('저장된 Council 세션이 없습니다.')
    return lines.join('\n')
  }

  lines.push(`[진행 중인 Council: ${sessions.length}개]`)
  sessions.forEach(s => {
    lines.push(`• ${s.id} — ${s.topic}`)
    lines.push(`  저장일: ${new Date(s.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`)
  })
  lines.push('')

  if (latest) {
    lines.push(`[최신 Council: ${latest.id}] ${latest.rounds?.length || 0}라운드`)
    lines.push('[요약]')
    lines.push(latest.summary || '요약 없음')
    lines.push('')

    const userInterventions = []
    if (latest.rounds) {
      latest.rounds.forEach(round => {
        round.steps?.forEach(step => {
          if (step.id === 'user') {
            userInterventions.push(`R${round.round}: ${step.result}`)
          }
        })
      })
    }

    if (userInterventions.length > 0) {
      lines.push('[사용자 핵심 발언/보정]')
      userInterventions.forEach(u => lines.push(`• ${u}`))
    }
  }

  return lines.join('\n')
}
