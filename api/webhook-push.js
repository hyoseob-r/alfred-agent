import crypto from 'crypto'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // GitHub webhook signature 검증
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (secret) {
    const sig = req.headers['x-hub-signature-256'] || ''
    const body = JSON.stringify(req.body)
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
    if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' })
  }

  const event = req.headers['x-github-event']
  if (event === 'ping') return res.status(200).json({ ok: true, msg: 'pong' })
  if (event !== 'push') return res.status(200).json({ ok: true, msg: 'ignored' })

  const { commits, ref } = req.body
  if (!commits || commits.length === 0) return res.status(200).json({ ok: true, msg: 'no commits' })
  if (ref !== 'refs/heads/main') return res.status(200).json({ ok: true, msg: 'not main branch' })

  // 커밋 메시지 → WORKLOG 엔트리 생성
  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  // 날짜별로 커밋 그룹핑 (KST 기준)
  const byDate = {}
  for (const c of commits) {
    // WORKLOG.md 수정 커밋은 무시 (무한루프 방지)
    if (c.message.startsWith('docs: auto-worklog') || c.message.startsWith('docs: Council 토론 기록')) continue
    // merge 커밋 무시
    if (c.message.startsWith('Merge')) continue

    const kst = new Date(new Date(c.timestamp).getTime() + 9 * 60 * 60 * 1000)
    const date = kst.toISOString().slice(0, 10)
    if (!byDate[date]) byDate[date] = []
    byDate[date].push(`- [완료] ${c.message.split('\n')[0]}`)
  }

  if (Object.keys(byDate).length === 0) return res.status(200).json({ ok: true, msg: 'no relevant commits' })

  try {
    for (const [date, entries] of Object.entries(byDate)) {
      const title = `WORKLOG_${date}`
      const newContent = entries.join('\n')

      // 기존 항목 확인
      const existResp = await fetch(
        `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(title)}&select=id,content`,
        { headers }
      )
      const existing = await existResp.json()

      if (Array.isArray(existing) && existing.length > 0) {
        // 중복 방지: 이미 같은 내용이 있으면 스킵
        const current = existing[0].content
        const dedupEntries = entries.filter(e => !current.includes(e))
        if (dedupEntries.length === 0) continue

        await fetch(`${supabaseUrl}/rest/v1/context_notes?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            content: current + '\n' + dedupEntries.join('\n'),
            tags: ['worklog', date],
          }),
        })
      } else {
        await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            user_id: userId,
            type: 'worklog',
            title,
            content: newContent,
            tags: ['worklog', date],
          }),
        })
      }
    }

    // 태스크 상태 업데이트 (최종 커밋 날짜로)
    const latestDate = Object.keys(byDate).sort().pop()
    const taskTitle = 'WORKLOG_task_status'
    const existTaskResp = await fetch(
      `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(taskTitle)}&select=id,content`,
      { headers }
    )
    const existTask = await existTaskResp.json()
    if (Array.isArray(existTask) && existTask.length > 0) {
      // 기존 태스크 테이블에서 날짜만 갱신
      const updated = existTask[0].content.replace(/\d{4}-\d{2}-\d{2}/g, latestDate)
      await fetch(`${supabaseUrl}/rest/v1/context_notes?id=eq.${existTask[0].id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ content: updated, tags: ['worklog', 'task_status'] }),
      })
    }

    return res.status(200).json({ ok: true, dates: Object.keys(byDate), entries: Object.values(byDate).flat().length })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
