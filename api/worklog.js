import crypto from 'crypto'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // GitHub webhook은 x-github-event 헤더로 감지
  const githubEvent = req.headers['x-github-event']
  if (githubEvent) return handleWebhookPush(req, res, githubEvent)

  // action: "save" (default) | "update-github"
  const { action = 'save', date, content, tasks, summary, topic } = req.body

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (action === 'update-github') {
    const token = process.env.GITHUB_TOKEN
    const owner = 'hyoseob-r'
    const repo = 'alfred-agent'
    const path = 'WORKLOG.md'
    const entryDate = new Date().toISOString().slice(0, 10)

    try {
      const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      })
      if (!getResp.ok) return res.status(500).json({ error: 'WORKLOG 파일 조회 실패' })
      const fileData = await getResp.json()
      const currentContent = Buffer.from(fileData.content, 'base64').toString('utf8')

      const newEntry = `- [Council] ${entryDate} — ${topic}\n${summary.split('\n').map(l => `  ${l}`).join('\n')}\n`
      const updatedContent = currentContent.replace(
        /### \d{4}-\d{2}-\d{2}/,
        `### ${entryDate}\n${newEntry}\n### ` + currentContent.match(/### (\d{4}-\d{2}-\d{2})/)?.[1]
      )

      const putResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' },
        body: JSON.stringify({
          message: `docs: Council 토론 기록 — ${topic.slice(0, 60)}`,
          content: Buffer.from(updatedContent).toString('base64'),
          sha: fileData.sha,
        }),
      })
      if (!putResp.ok) {
        const err = await putResp.json()
        return res.status(500).json({ error: err.message })
      }
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // default: save to Supabase
  if (!content) return res.status(400).json({ error: 'content required' })
  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  const entryDate = date || new Date().toISOString().slice(0, 10)
  const title = `WORKLOG_${entryDate}`

  try {
    const existResp = await fetch(
      `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(title)}&select=id,content`,
      { headers }
    )
    const existing = await existResp.json()

    let finalContent = content
    if (Array.isArray(existing) && existing.length > 0) {
      finalContent = existing[0].content + '\n' + content
    }

    let resp
    if (Array.isArray(existing) && existing.length > 0) {
      resp = await fetch(
        `${supabaseUrl}/rest/v1/context_notes?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ content: finalContent, tags: ['worklog', entryDate] }),
        }
      )
    } else {
      resp = await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: userId, type: 'worklog', title, content: finalContent, tags: ['worklog', entryDate] }),
      })
    }

    if (!resp.ok) {
      const err = await resp.text()
      return res.status(500).json({ error: err })
    }

    if (tasks && Array.isArray(tasks)) {
      const taskContent = tasks.map(t => `| ${t.name} | ${t.status} | ${entryDate} |`).join('\n')
      const taskTitle = 'WORKLOG_task_status'

      const existTaskResp = await fetch(
        `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(taskTitle)}&select=id`,
        { headers }
      )
      const existTask = await existTaskResp.json()

      if (Array.isArray(existTask) && existTask.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/context_notes?id=eq.${existTask[0].id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ content: taskContent, tags: ['worklog', 'task_status'] }),
        })
      } else {
        await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: userId, type: 'worklog', title: taskTitle, content: taskContent, tags: ['worklog', 'task_status'] }),
        })
      }
    }

    return res.status(200).json({ ok: true, date: entryDate })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

// GitHub webhook push handler (이전 webhook-push.js에서 이동)
async function handleWebhookPush(req, res, event) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (secret) {
    const sig = req.headers['x-hub-signature-256'] || ''
    const body = JSON.stringify(req.body)
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
    if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' })
  }

  if (event === 'ping') return res.status(200).json({ ok: true, msg: 'pong' })
  if (event !== 'push') return res.status(200).json({ ok: true, msg: 'ignored' })

  const { commits, ref } = req.body
  if (!commits || commits.length === 0) return res.status(200).json({ ok: true, msg: 'no commits' })
  if (ref !== 'refs/heads/main') return res.status(200).json({ ok: true, msg: 'not main branch' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID
  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }

  const byDate = {}
  for (const c of commits) {
    if (c.message.startsWith('docs: auto-worklog') || c.message.startsWith('docs: Council 토론 기록') || c.message.startsWith('Merge')) continue
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
      const existResp = await fetch(`${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(title)}&select=id,content`, { headers })
      const existing = await existResp.json()

      if (Array.isArray(existing) && existing.length > 0) {
        const current = existing[0].content
        const dedupEntries = entries.filter(e => !current.includes(e))
        if (dedupEntries.length === 0) continue
        await fetch(`${supabaseUrl}/rest/v1/context_notes?id=eq.${existing[0].id}`, {
          method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ content: current + '\n' + dedupEntries.join('\n'), tags: ['worklog', date] }),
        })
      } else {
        await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
          method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: userId, type: 'worklog', title, content: newContent, tags: ['worklog', date] }),
        })
      }
    }

    const latestDate = Object.keys(byDate).sort().pop()
    const taskTitle = 'WORKLOG_task_status'
    const existTaskResp = await fetch(`${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(taskTitle)}&select=id,content`, { headers })
    const existTask = await existTaskResp.json()
    if (Array.isArray(existTask) && existTask.length > 0) {
      const updated = existTask[0].content.replace(/\d{4}-\d{2}-\d{2}/g, latestDate)
      await fetch(`${supabaseUrl}/rest/v1/context_notes?id=eq.${existTask[0].id}`, {
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ content: updated, tags: ['worklog', 'task_status'] }),
      })
    }

    return res.status(200).json({ ok: true, dates: Object.keys(byDate), entries: Object.values(byDate).flat().length })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
