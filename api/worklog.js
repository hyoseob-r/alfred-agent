export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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
