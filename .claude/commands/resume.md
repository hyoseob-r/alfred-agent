다음을 순서대로 실행하세요.

**Step 1 — 서버에서 전체 컨텍스트 로드**

아래 API를 Bash 도구로 호출하세요:
```
curl -s https://alfred-agent-nine.vercel.app/api/get-context
```

응답의 `briefing` 필드를 읽고 전체 내용을 숙지하세요.
`latest_full.rounds` 배열을 통해 각 라운드별 에이전트 발언과 사용자 보정 내용을 파악하세요.

**Step 2 — WORKLOG.md 조회**

```
Read ~/Desktop/alfred-agent/WORKLOG.md
```

최근 항목부터 읽어 현재 진행 중인 작업을 파악하세요.

**Step 3 — 사용자에게 브리핑**

다음 형식으로 한 줄 상태 보고:
- 진행 중인 Council ID와 주제
- 마지막으로 합의된 전략 방향
- 홀드/대기 중인 항목
- 다음 액션

예시:
> Council #c-00001 이어받았습니다. 요기요 전략 12라운드 완료. 포천 파일럿 1순위, 건강식 버티컬 홀드. 다음: 포천 주문 M/S 데이터 확인 후 실행 계획 구체화.
