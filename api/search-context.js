/**
 * GET /api/search-context?q=키워드
 * 과거 Council 토론 + context_notes에서 관련 내용 검색 (RAG용)
 */

const SUPABASE_URL = 'https://atwztuelyhwtohylbypv.supabase.co'

function getHeaders(key) {
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID
  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const q = (req.query.q || '').trim().slice(0, 100)
  if (!q) return res.status(400).json({ error: 'q required' })

  const headers = getHeaders(serviceKey)
  const keywords = q.split(/\s+/).filter(Boolean).slice(0, 5)

  // context_notes 검색 — 각 키워드로 content/title ilike 검색
  const noteFilter = keywords
    .map(k => `content.ilike.*${encodeURIComponent(k)}*,title.ilike.*${encodeURIComponent(k)}*`)
    .join(',')

  const [notesResp, councilsResp] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/context_notes?user_id=eq.${userId}&or=(${noteFilter})&order=updated_at.desc&limit=5&select=title,content,type,tags,updated_at`,
      { headers }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/councils?user_id=eq.${userId}&or=(${keywords.map(k => `topic.ilike.*${encodeURIComponent(k)}*,summary.ilike.*${encodeURIComponent(k)}*`).join(',')})&order=updated_at.desc&limit=3&select=id,topic,summary,updated_at`,
      { headers }
    ),
  ])

  const notes = notesResp.ok ? await notesResp.json() : []
  const councils = councilsResp.ok ? await councilsResp.json() : []

  // 결과 포맷 — 너무 긴 content는 잘라냄
  const MAX = 800
  const results = [
    ...notes.map(n => ({
      source: 'note',
      title: n.title,
      type: n.type,
      content: n.content?.slice(0, MAX) + (n.content?.length > MAX ? '...' : ''),
      date: n.updated_at?.slice(0, 10),
    })),
    ...councils.map(c => ({
      source: 'council',
      title: c.topic,
      id: c.id,
      content: c.summary?.slice(0, MAX) + (c.summary?.length > MAX ? '...' : ''),
      date: c.updated_at?.slice(0, 10),
    })),
  ]

  return res.status(200).json({ query: q, results })
}
