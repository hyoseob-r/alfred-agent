# YDS 2.0 Figma 컴포넌트 인벤토리

> Figma MCP로 자동 추출한 컴포넌트 목록 (2026-09-17)

## 구현 현황

| # | 컴포넌트 | 소스 파일 | h-storybook | 상태 |
|---|---------|----------|-------------|------|
| 1 | Badge (6 subtypes) | Customer-Component | Badge.jsx | ✅ 완료 |
| 2 | Rating | Customer-Component | Rating.jsx | ✅ 완료 |
| 3 | NumericStepper | Customer-Component | NumericStepper.jsx | ✅ 완료 |
| 4 | StickyCTA | Customer-Component | - | ⬜ 미구현 |
| 5 | ShopList Card | 리뉴얼-2026 | - | ⬜ 미구현 |
| 6 | Swimlane Card | 리뉴얼-2026 | - | ⬜ 미구현 |
| 7 | Shortcut Card | 리뉴얼-2026 | - | ⬜ 미구현 |
| 8 | BrandnewBanner | 리뉴얼-2026 | - | ⬜ 미구현 |
| 9 | 할인 브랜드 스윔레인 | 리뉴얼-2026 | - | ⬜ 미구현 |
| 10 | FloatingPill (요타임딜) | 리뉴얼-2026 | - | ⬜ 미구현 |
| 11 | FloatingPill (주문현황) | 리뉴얼-2026 | - | ⬜ 미구현 |
| 12 | BottomNavNew | 리뉴얼-2026 | - | ⬜ 미구현 |
| 13 | NavNew (pill nav) | 리뉴얼-2026 | - | ⬜ 미구현 |
| 14 | NaviItemNew | 리뉴얼-2026 | - | ⬜ 미구현 |

---

## 상세 스펙

### 1. Badge
- **singleBadge**: colorStyle(primary/secondary/gray/dimmed/disabled), size(small/medium), showLeftIcon, showRightIcon
- **groupBadge**: 2~4개 그룹, colorStyle(secondary/gray), size(small/medium)
- **offersBadge**: 할인 정보, size(small/medium), labelOnly/labelWithIcon
- **notiBadge**: shapeStyle(outlined/filled/dot)
- **logoBadge**: 로고 이미지 표시
- **iconBadge**: 아이콘 상태 표시

### 2. Rating
- type: compact
- size: small/medium
- anatomy: starIcon + grade + total

### 3. NumericStepper
- **compact**: 탭하면 default로 확장, shapeStyle(elevated/outlined), readOnly
- **default**: size(small/medium), shapeStyle(elevated/outlined), section(start/middle/end)
- BuildingBlocks: IconButton(add/subtract), states(enabled/focused/pressed/hovered/disabled)

### 4. StickyCTA
- Bar (16px r16 handle) + Title(icon+text) + Body + Caption(opt) + Gage(opt) + ButtonDocked
- NumericStepper(opt) + PriceButton(strikethrough/countBadge)
- Type: default / deal
- YDS tokens: primary_v2, spacing s7, radius r3/r5, level_1_i shadow

### 5~7. ShopList / Swimlane / Shortcut Cards
- Variant matrix:
  - type1: none / 구독+ypx / 구독+non-ypx / 미구독+ypx / 미구독+non-ypx
  - type2: none / ypx무배+즉할+적립 / 가게무배+즉할+적립 / 단일혜택(즉할/적립/ypx무배/가게무배)
- 총 30+ variant 조합

### 8. BrandnewBanner
- Props: property1(a/b/c), card(boolean)
- a: 선착순 특가 (버거 이미지+왕관), b: 네이버 멤버십, c: 무한적립
- 배달앱최저가/스페셜적립 뱃지, 이미지 인디케이터(1/10 더보기)

### 9. 할인 브랜드 스윔레인
- SectionHeader: "내 주변 할인중인 브랜드" + chevron
- multi_swimlane_2: 로고(48px r16) + 가게명(12r) + 배지(opt) + 혜택(14b)
- 3페이지 × 3아이템, 가로 스크롤, 인디케이터 dots
- auto_transition 버튼 (28px)

### 10. FloatingPill — 요타임딜
- 52px h, r100, level_1 shadow, bg 96% white
- 로띠 아이콘(36px) + "최대 1만원 할인, 지금 단 15분" + 14:59 카운트다운(18px bold primary)

### 11. FloatingPill — 주문현황
- 같은 pill 컨테이너, 7 variant:
  1=주문완료, 2=조리중, 3~6=배달중, 7=배달완료(사진 원형크롭)
- 상태아이콘(36px) + 메인텍스트(14b) + 상태뱃지(primary) · 가게명(gray600)

### 12. BottomNavNew
- 3 variant: nav만 / 주문현황+nav / 요타임딜+nav
- 배경: 그라디언트 fade, gap 12px, pb 20px

### 13. NavNew (pill nav bar)
- r40, 62px, glass effect (level_1_v2 + inner shadow)
- 5탭: 홈/할인·혜택/주문내역/찜/마이요기요
- property1=1~5 (선택 탭)
- 선택: filled 아이콘 + 4% black bg
- 비선택: outline 아이콘

### 14. NaviItemNew
- Props: icon, iconFilled, label, selected
- 28px icon + 10px label (caption_2)
