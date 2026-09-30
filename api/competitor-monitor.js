// 경쟁사 모니터링 API — 배민/쿠팡이츠 변경사항 감지
// context_notes 테이블 재활용 (type으로 구분, 별도 테이블 생성 불필요)
// POST: App Store 크롤링 → 이전 스냅샷 비교 → 변경 시 저장
// GET: 변경 피드 조회

const SUPABASE_URL = 'https://atwztuelyhwtohylbypv.supabase.co'

const TYPE_SNAPSHOT = 'competitor_snapshot'
const TYPE_CHANGE = 'competitor_change'

// App Store lookup API
async function fetchAppStoreInfo(appId) {
  const resp = await fetch(`https://itunes.apple.com/kr/lookup?id=${appId}`)
  if (!resp.ok) return null
  const data = await resp.json()
  if (!data.results || data.results.length === 0) return null
  const app = data.results[0]
  return {
    version: app.version,
    releaseNotes: app.releaseNotes || '',
    currentVersionReleaseDate: app.currentVersionReleaseDate,
    description: app.description?.substring(0, 500),
    trackName: app.trackName,
  }
}

// 이전 스냅샷 조회 (context_notes에서)
async function getLastSnapshot(userId, sourceId, headers) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&type=eq.${TYPE_SNAPSHOT}&title=eq.${encodeURIComponent(sourceId)}&order=created_at.desc&limit=1`,
    { headers }
  )
  if (!resp.ok) return null
  const rows = await resp.json()
  if (!rows[0]) return null
  try { return JSON.parse(rows[0].content) } catch { return null }
}

// 스냅샷 저장 (upsert — 같은 title이면 content 업데이트)
async function saveSnapshot(userId, sourceId, data, headers) {
  // 기존 있는지 확인
  const existResp = await fetch(
    `${SUPABASE_URL}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&type=eq.${TYPE_SNAPSHOT}&title=eq.${encodeURIComponent(sourceId)}&select=id`,
    { headers }
  )
  const existing = await existResp.json()

  const body = {
    user_id: userId,
    type: TYPE_SNAPSHOT,
    title: sourceId,
    content: JSON.stringify(data),
    tags: [sourceId.split('_')[0]], // baemin 또는 coupangeats
  }

  if (existing && existing.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/context_notes?id=eq.${existing[0].id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ content: body.content, updated_at: new Date().toISOString() })
    })
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/context_notes`, {
      method: 'POST', headers, body: JSON.stringify(body)
    })
  }
}

// 변경 피드 저장 (새 row 추가)
async function saveChange(userId, competitor, title, detail, headers) {
  await fetch(`${SUPABASE_URL}/rest/v1/context_notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      type: TYPE_CHANGE,
      title,
      content: detail,
      tags: [competitor, 'monitor'],
    }),
  })
}

// diff 계산
function computeDiff(oldData, newData) {
  if (!oldData) return { isNew: true, changes: ['첫 스냅샷'] }
  const changes = []
  if (oldData.version !== newData.version) {
    changes.push(`버전: ${oldData.version} → ${newData.version}`)
  }
  if (oldData.releaseNotes !== newData.releaseNotes) {
    changes.push('릴리즈 노트 변경')
  }
  return { isNew: false, changes }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID
  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  // GET — 변경 피드 조회
  if (req.method === 'GET') {
    const { competitor, limit = 20 } = req.query
    let url = `${SUPABASE_URL}/rest/v1/context_notes?type=eq.${TYPE_CHANGE}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=${limit}`
    if (competitor) url += `&tags=cs.{${competitor}}`

    const resp = await fetch(url, { headers })
    if (!resp.ok) return res.status(500).json({ error: 'DB fetch failed', status: resp.status })
    const rows = await resp.json()

    const changes = rows.map(r => ({
      id: r.id,
      title: r.title,
      detail: r.content,
      tags: r.tags,
      date: r.created_at,
    }))
    return res.status(200).json({ ok: true, changes })
  }

  // POST — 크롤링 실행
  if (req.method === 'POST') {
    const targets = [
      { sourceId: 'baemin_appstore', appId: '378084485', competitor: 'baemin', name: '배달의민족' },
      { sourceId: 'coupangeats_appstore', appId: '1445504255', competitor: 'coupangeats', name: '쿠팡이츠' },
    ]

    const results = []

    for (const t of targets) {
      try {
        const info = await fetchAppStoreInfo(t.appId)
        if (!info) { results.push({ source: t.sourceId, status: 'fetch_failed' }); continue }

        const lastData = await getLastSnapshot(userId, t.sourceId, headers)
        const diff = computeDiff(lastData, info)

        // 항상 스냅샷 업데이트
        await saveSnapshot(userId, t.sourceId, info, headers)

        if (diff.changes.length > 0) {
          const detail = [
            `## ${t.name} 변경 감지`,
            `**버전**: ${info.version}`,
            `**업데이트**: ${info.currentVersionReleaseDate}`,
            `**변경사항**: ${diff.changes.join(', ')}`,
            diff.isNew ? '' : `\n### 릴리즈 노트\n${info.releaseNotes}`,
          ].join('\n')

          await saveChange(userId, t.competitor, `[${t.competitor}] ${diff.changes[0]}`, detail, headers)
          results.push({ source: t.sourceId, status: 'change_detected', version: info.version, diff })
        } else {
          results.push({ source: t.sourceId, status: 'no_change', version: info.version })
        }
      } catch (err) {
        results.push({ source: t.sourceId, status: 'error', message: err.message })
      }
    }

    return res.status(200).json({ ok: true, scannedAt: new Date().toISOString(), results })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
