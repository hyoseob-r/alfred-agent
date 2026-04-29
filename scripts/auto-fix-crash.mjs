/**
 * auto-fix-crash.mjs
 * GitHub Actions에서 실행. 크래시 피드백을 분석하고 자동으로 수정합니다.
 * Usage: node scripts/auto-fix-crash.mjs '<json payload>'
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FEEDBACK_API = 'https://alfred-agent-nine.vercel.app/api';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

// ─── 소스 파일 수집 (스택트레이스 직접 언급 파일만) ─────────────────────────
function collectSourceFiles(stackTrace = '', errorMessage = '') {
  const files = {};
  const MAX_CHARS = 6000;

  const readFile = (p) => {
    if (files[p] || !fs.existsSync(p)) return;
    const content = fs.readFileSync(p, 'utf-8');
    files[p] = content.length > MAX_CHARS ? content.slice(0, MAX_CHARS) + '\n// ... (truncated)' : content;
  };

  // 스택트레이스에서 로컬 파일 경로 추출 (번들된 URL 제외)
  const localPaths = [...(stackTrace + '\n' + errorMessage)
    .matchAll(/\b(src\/[\w/.%-]+\.jsx?|api\/[\w/.%-]+\.js)/g)]
    .map(m => m[1]);

  for (const p of [...new Set(localPaths)]) readFile(p);

  // 로컬 파일이 없으면 (번들된 minified 스택트레이스) — App.jsx만
  if (Object.keys(files).length === 0) {
    readFile('src/App.jsx');
  }

  return files;
}

// ─── Claude API 호출 ──────────────────────────────────────────────────────────
async function callClaude(errorMessage, stackTrace, sourceFiles) {
  const fileList = Object.entries(sourceFiles)
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join('\n\n');

  const prompt = `당신은 React 앱의 자동 버그 수정 에이전트입니다.

## 발생한 에러
${errorMessage}

## 스택 트레이스
${stackTrace || '(없음)'}

## 소스 코드
${fileList}

## 지시사항
1. 에러의 원인을 정확히 파악하세요.
2. 만약 "[TEST CRASH]"로 시작하는 의도적 테스트 에러라면, 테스트 코드(CrashTrigger 컴포넌트 및 testCrash 관련 코드)를 제거하세요.
3. 실제 버그라면 최소한의 수정으로 고치세요.
4. 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만:

{
  "analysis": "에러 원인 한 줄 설명",
  "files": [
    {
      "path": "수정할 파일 경로",
      "old": "정확히 교체할 기존 코드 (공백/줄바꿈 포함 완전 일치)",
      "new": "교체될 새 코드"
    }
  ]
}

수정이 필요 없으면 files를 빈 배열로 반환하세요.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  const data = await resp.json();
  if (!resp.ok) {
    console.error('Gemini API 에러:', JSON.stringify(data));
    return null;
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log('Gemini 응답:\n', text);

  try {
    // JSON만 추출
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.error('JSON 파싱 실패:', e.message);
    return null;
  }
}

// ─── 파일 수정 적용 ───────────────────────────────────────────────────────────
function applyFix(fileChange) {
  const { path: filePath, old: oldCode, new: newCode } = fileChange;
  if (!fs.existsSync(filePath)) {
    console.warn(`파일 없음: ${filePath}`);
    return false;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes(oldCode)) {
    console.warn(`교체 대상 코드를 찾을 수 없음: ${filePath}`);
    return false;
  }
  fs.writeFileSync(filePath, content.replace(oldCode, newCode), 'utf-8');
  console.log(`✅ 수정 적용: ${filePath}`);
  return true;
}

// ─── 피드백 코멘트 등록 ───────────────────────────────────────────────────────
async function postComment(feedbackId, content) {
  await fetch(`${FEEDBACK_API}/feedback-comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback_id: feedbackId, author: 'claude', content }),
  }).catch(console.error);
}

async function updateFeedbackStatus(feedbackId, status) {
  await fetch(`${FEEDBACK_API}/feedback`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: feedbackId, status }),
  }).catch(console.error);
}

// ─── Slack 알림 ───────────────────────────────────────────────────────────────
async function notifySlack(message, analysis, success) {
  if (!SLACK_WEBHOOK_URL) return;
  const emoji = success ? '✅' : '⚠️';
  const text = success
    ? `${emoji} *크래시 자동 수정 완료*\n> ${message}\n\n*분석*: ${analysis}`
    : `${emoji} *크래시 수동 검토 필요*\n> ${message}\n\n*분석*: ${analysis}`;
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(console.error);
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const payload = JSON.parse(process.argv[2] || '{}');
  const { feedback_id, message, stack_trace } = payload;

  if (!feedback_id) {
    console.error('feedback_id가 없습니다.');
    process.exit(1);
  }

  console.log(`\n🔍 크래시 분석 시작\nID: ${feedback_id}\n에러: ${message}\n`);
  await updateFeedbackStatus(feedback_id, 'in_progress');
  await postComment(feedback_id, `🤖 자동 분석 시작됨. GitHub Actions에서 수정 중...`);

  // 소스 파일 수집
  const sourceFiles = collectSourceFiles(stack_trace, message);
  console.log(`📂 소스 파일 ${Object.keys(sourceFiles).length}개 로드됨`);

  // Claude 분석
  const fix = await callClaude(message, stack_trace, sourceFiles);

  if (!fix) {
    await postComment(feedback_id, `⚠️ 분석 실패: Claude 응답을 파싱할 수 없습니다. 수동 검토 필요.`);
    await notifySlack(message, '분석 실패 — 수동 검토 필요', false);
    return;
  }

  console.log(`\n📋 분석 결과: ${fix.analysis}`);
  console.log(`🔧 수정 파일 수: ${fix.files.length}`);

  if (fix.files.length === 0) {
    await postComment(feedback_id, `ℹ️ 분석 완료: ${fix.analysis}\n\n자동 수정 불필요 또는 수동 검토 권장.`);
    await notifySlack(message, fix.analysis, false);
    return;
  }

  // 수정 적용
  let appliedCount = 0;
  for (const fileChange of fix.files) {
    if (applyFix(fileChange)) appliedCount++;
  }

  if (appliedCount === 0) {
    await postComment(feedback_id, `⚠️ 수정 코드를 찾았으나 파일에 적용 실패. 수동 검토 필요.\n\n분석: ${fix.analysis}`);
    await notifySlack(message, fix.analysis + ' (적용 실패)', false);
    return;
  }

  // 빌드 확인
  console.log('\n🏗️ 빌드 확인 중...');
  try {
    execSync('npm run build', { stdio: 'pipe' });
    console.log('✅ 빌드 성공');
  } catch (e) {
    await postComment(feedback_id, `⚠️ 수정 적용됐으나 빌드 실패. 수동 검토 필요.\n\n빌드 에러:\n${e.stderr?.toString().slice(0, 500)}`);
    await notifySlack(message, fix.analysis + ' (빌드 실패)', false);
    return;
  }

  // Git commit & push
  console.log('\n📤 커밋 & 푸시 중...');
  execSync(`git config user.email "${process.env.GIT_USER_EMAIL || 'bot@alfred-agent.app'}"`);
  execSync(`git config user.name "${process.env.GIT_USER_NAME || 'Alfred Auto-Fix'}"`);
  execSync('git add -A');
  execSync(`git commit -m "fix: 크래시 자동 수정 [${feedback_id.slice(0, 8)}]\n\n${fix.analysis}"`);
  execSync('git push');
  console.log('✅ 푸시 완료');

  // 상태 업데이트 & 코멘트
  await updateFeedbackStatus(feedback_id, 'done');
  await postComment(
    feedback_id,
    `✅ 자동 수정 완료\n\n**원인**: ${fix.analysis}\n\n**수정된 파일**:\n${fix.files.map(f => `- \`${f.path}\``).join('\n')}\n\nVercel 자동 배포 진행 중.`
  );
  await notifySlack(message, fix.analysis, true);

  console.log('\n🎉 자동 수정 완료!');
}

main().catch(async (err) => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
