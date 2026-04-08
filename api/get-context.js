export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (!serviceKey || !userId) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  try {
    // 최신 council 세션 목록 가져오기 (최근 5개)
    const listResp = await fetch(
      `${supabaseUrl}/rest/v1/council_sessions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=5&select=id,topic,summary,created_at`,
      { headers }
    )
    const listRaw = await listResp.json()
    const sessions = Array.isArray(listRaw) ? listRaw : []

    // 가장 최신 council의 전체 내용 가져오기
    let latestFull = null
    if (sessions.length > 0) {
      const latestResp = await fetch(
        `${supabaseUrl}/rest/v1/council_sessions?id=eq.${encodeURIComponent(sessions[0].id)}&select=*`,
        { headers }
      )
      const latestArr = await latestResp.json()
      latestFull = Array.isArray(latestArr) ? (latestArr[0] || null) : null
    }

    // 핵심 컨텍스트 구조화
    const context = {
      generated_at: new Date().toISOString(),
      briefing: buildBriefing(sessions, latestFull),
      sessions: sessions.map(s => ({
        id: s.id,
        topic: s.topic,
        summary: s.summary,
        created_at: s.created_at,
      })),
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

function buildBriefing(sessions, latest) {
  const lines = []

  lines.push('=== 인수인계 브리핑 ===')
  lines.push(`생성: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`)
  lines.push('')

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
    lines.push(`[최신 Council: ${latest.id}]`)
    lines.push(`주제: ${latest.topic}`)
    lines.push(`진행 라운드: ${latest.rounds?.length || 0}라운드`)
    lines.push('')
    lines.push('[요약]')
    lines.push(latest.summary || '요약 없음')
    lines.push('')

    // 사용자 발언(보정) 추출
    const userInterventions = []
    if (latest.rounds) {
      latest.rounds.forEach(round => {
        if (round.steps) {
          round.steps.forEach(step => {
            if (step.id === 'user') {
              userInterventions.push(`R${round.round}: ${step.result}`)
            }
          })
        }
      })
    }

    if (userInterventions.length > 0) {
      lines.push('[사용자 핵심 발언/보정]')
      userInterventions.forEach(u => lines.push(`• ${u}`))
    }
  }

  return lines.join('\n')
}
