export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { summary, topic } = req.body
  const token = process.env.GITHUB_TOKEN
  const owner = 'hyoseob-r'
  const repo = 'alfred-agent'
  const path = 'WORKLOG.md'
  const date = new Date().toISOString().slice(0, 10)

  try {
    // 현재 WORKLOG.md 가져오기
    const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    })
    if (!getResp.ok) return res.status(500).json({ error: 'WORKLOG 파일 조회 실패' })
    const fileData = await getResp.json()
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf8')

    // 작업 로그 섹션에 새 항목 추가
    const newEntry = `- [Council] ${date} — ${topic}\n${summary.split('\n').map(l => `  ${l}`).join('\n')}\n`
    const updatedContent = currentContent.replace(
      /### \d{4}-\d{2}-\d{2}/,
      `### ${date}\n${newEntry}\n### ` + currentContent.match(/### (\d{4}-\d{2}-\d{2})/)?.[1]
    )

    // GitHub API로 업데이트
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
