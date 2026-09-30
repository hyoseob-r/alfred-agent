// 경쟁사 모니터링 API — 배민/쿠팡이츠 변경사항 감지
// POST: 크롤링 → 이전 스냅샷과 비교 → 변경 있으면 저장
// GET: 최근 변경 피드 조회

const SUPABASE_URL = 'https://atwztuelyhwtohylbypv.supabase.co'

// 모니터링 대상 소스
const SOURCES = [
  // 앱스토어 릴리즈 노트
  {
    id: 'baemin_gplay',
    name: '배달의민족 Google Play',
    type: 'appstore',
    url: 'https://play.google.com/store/apps/details?id=com.sampleapp&hl=ko',
    competitor: 'baemin',
  },
  {
    id: 'baemin_appstore',
    name: '배달의민족 App Store',
    type: 'appstore',
    url: 'https://apps.apple.com/kr/app/%EB%B0%B0%EB%8B%AC%EC%9D%98%EB%AF%BC%EC%A1%B1/id378084485',
    competitor: 'baemin',
  },
  {
    id: 'coupangeats_gplay',
    name: '쿠팡이츠 Google Play',
    type: 'appstore',
    url: 'https://play.google.com/store/apps/details?id=com.coupang.mobile.eats&hl=ko',
    competitor: 'coupangeats',
  },
  {
    id: 'coupangeats_appstore',
    name: '쿠팡이츠 App Store',
    type: 'appstore',
    url: 'https://apps.apple.com/kr/app/%EC%BF%A0%ED%8C%A1%EC%9D%B4%EC%B8%A0/id1445504255',
    competitor: 'coupangeats',
  },
  // 뉴스룸
  {
    id: 'baemin_newsroom',
    name: '우아한형제들 뉴스룸',
    type: 'newsroom',
    url: 'https://www.woowahan.com',
    competitor: 'baemin',
  },
  {
    id: 'coupang_newsroom',
    name: '쿠팡 뉴스룸',
    type: 'newsroom',
    url: 'https://news.coupang.com',
    competitor: 'coupangeats',
  },
]

// App Store lookup API (무료, 안정적)
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
  }
}

// Google Play는 공식 API가 없어서 제목+버전 정보를 뉴스 검색으로 대체
async function fetchGooglePlayInfo(packageId) {
  // Google Play 페이지는 직접 크롤링이 어려움 (JS 렌더링 필요)
  // 대신 App Store 정보를 primary로 사용
  return null
}

// 뉴스 검색 (경쟁사 키워드)
async function fetchNewsHeadlines(competitor) {
  const keywords = competitor === 'baemin'
    ? '배달의민족 신규 서비스 OR 배민 업데이트 OR 배민 UI'
    : '쿠팡이츠 신규 OR 쿠팡이츠 업데이트 OR 쿠팡이츠 이벤트'

  // 뉴스 API 대신 간단한 검색 결과 메타 저장
  return { keywords, fetchedAt: new Date().toISOString() }
}

// Supabase에서 이전 스냅샷 조회
async function getLastSnapshot(sourceId, headers) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/competitor_snapshots?source_id=eq.${sourceId}&order=created_at.desc&limit=1`,
    { headers }
  )
  if (!resp.ok) return null
  const rows = await resp.json()
  return rows[0] || null
}

// 스냅샷 저장
async function saveSnapshot(sourceId, competitor, data, diff, headers) {
  await fetch(`${SUPABASE_URL}/rest/v1/competitor_snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source_id: sourceId,
      competitor,
      data,
      diff,
      created_at: new Date().toISOString(),
    }),
  })
}

// 변경 피드 저장
async function saveChangeFeed(competitor, sourceId, title, content, changeType, headers) {
  await fetch(`${SUPABASE_URL}/rest/v1/competitor_changes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      competitor,
      source_id: sourceId,
      title,
      content,
      change_type: changeType,
      created_at: new Date().toISOString(),
    }),
  })
}

// diff 계산
function computeDiff(oldData, newData) {
  if (!oldData) return { isNew: true, changes: ['첫 스냅샷'] }
  const changes = []

  // 버전 변경
  if (oldData.version && newData.version && oldData.version !== newData.version) {
    changes.push(`버전 변경: ${oldData.version} → ${newData.version}`)
  }

  // 릴리즈 노트 변경
  if (oldData.releaseNotes && newData.releaseNotes && oldData.releaseNotes !== newData.releaseNotes) {
    changes.push(`릴리즈 노트 업데이트`)
  }

  return { isNew: false, changes }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  // GET — 최근 변경 피드 조회
  if (req.method === 'GET') {
    const { competitor, limit = 20 } = req.query
    let url = `${SUPABASE_URL}/rest/v1/competitor_changes?order=created_at.desc&limit=${limit}`
    if (competitor) url += `&competitor=eq.${competitor}`

    const resp = await fetch(url, { headers })
    if (!resp.ok) return res.status(500).json({ error: 'DB fetch failed' })
    const changes = await resp.json()
    return res.status(200).json({ ok: true, changes })
  }

  // POST — 크롤링 실행
  if (req.method === 'POST') {
    const results = []

    // App Store 정보 수집 (가장 안정적인 소스)
    const appStoreTargets = [
      { sourceId: 'baemin_appstore', appId: '378084485', competitor: 'baemin', name: '배달의민족' },
      { sourceId: 'coupangeats_appstore', appId: '1445504255', competitor: 'coupangeats', name: '쿠팡이츠' },
    ]

    for (const target of appStoreTargets) {
      try {
        const info = await fetchAppStoreInfo(target.appId)
        if (!info) {
          results.push({ source: target.sourceId, status: 'fetch_failed' })
          continue
        }

        const lastSnapshot = await getLastSnapshot(target.sourceId, headers)
        const diff = computeDiff(lastSnapshot?.data, info)

        if (diff.changes.length > 0) {
          // 변경 감지 — 스냅샷 + 피드 저장
          await saveSnapshot(target.sourceId, target.competitor, info, diff, headers)
          await saveChangeFeed(
            target.competitor,
            target.sourceId,
            `${target.name} ${diff.changes[0]}`,
            JSON.stringify({ ...info, diff }),
            info.version !== lastSnapshot?.data?.version ? 'version_update' : 'content_update',
            headers
          )
          results.push({ source: target.sourceId, status: 'change_detected', diff })
        } else {
          results.push({ source: target.sourceId, status: 'no_change', version: info.version })
        }
      } catch (err) {
        results.push({ source: target.sourceId, status: 'error', message: err.message })
      }
    }

    return res.status(200).json({ ok: true, scannedAt: new Date().toISOString(), results })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
