// 1회성 마이그레이션: c_claude_ 접두어 레코드를 #c-XXXXX 형식으로 통합
// 같은 topic끼리 묶고, rounds가 가장 많은 레코드를 대표로 유지
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (!serviceKey || !userId) return res.status(500).json({ error: 'env missing' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  try {
    // 1. c_claude_ 레코드 전부 가져오기
    const fetchResp = await fetch(
      `${supabaseUrl}/rest/v1/council_sessions?id=like.c_claude_%&user_id=eq.${userId}&order=created_at.asc`,
      { headers }
    )
    const oldRecords = await fetchResp.json()
    if (!Array.isArray(oldRecords) || oldRecords.length === 0) {
      return res.status(200).json({ ok: true, message: '마이그레이션할 레코드 없음', records: oldRecords })
    }

    // 2. topic 기준으로 그룹핑
    const groups = {}
    for (const r of oldRecords) {
      const key = (r.topic || '').slice(0, 50).trim()
      if (!groups[key]) groups[key] = []
      groups[key].push(r)
    }

    const results = []

    for (const [topic, records] of Object.entries(groups)) {
      // rounds가 가장 많은 레코드를 대표로 선택
      records.sort((a, b) => (b.rounds?.length || 0) - (a.rounds?.length || 0))
      const best = records[0]
      const toDelete = records.slice(1)

      // 3. 새 ID 발급
      const idResp = await fetch(`${supabaseUrl}/rest/v1/rpc/next_council_id`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_type: 'c' }),
      })
      const newId = await idResp.json()

      // 4. 새 ID로 INSERT
      const insertResp = await fetch(`${supabaseUrl}/rest/v1/council_sessions`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          id: newId,
          session_id: best.session_id || null,
          user_id: userId,
          topic: best.topic,
          rounds: best.rounds,
          summary: best.summary || null,
          created_at: best.created_at,
        }),
      })
      if (!insertResp.ok) {
        const err = await insertResp.text()
        results.push({ topic, error: err })
        continue
      }

      // 5. 구 레코드 전부 삭제 (대표 포함)
      for (const r of records) {
        await fetch(
          `${supabaseUrl}/rest/v1/council_sessions?id=eq.${encodeURIComponent(r.id)}`,
          { method: 'DELETE', headers }
        )
      }

      results.push({
        topic,
        newId,
        merged: records.length,
        rounds: best.rounds?.length || 0,
        deleted: records.map(r => r.id),
      })
    }

    return res.status(200).json({ ok: true, results })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
