# YDS 2.0 Figma 컴포넌트 인벤토리

> Figma MCP로 자동 추출한 컴포넌트 목록 (2026-09-17, 업데이트: 2026-09-23)

## 구현 현황

| # | 컴포넌트 | 소스 파일 | h-storybook | 상태 |
|---|---------|----------|-------------|------|
| 1 | Badge (6 subtypes) | Customer-Component | Badge.jsx | ✅ 완료 |
| 2 | Rating | Customer-Component | Rating.jsx | ✅ 완료 |
| 3 | NumericStepper | Customer-Component | NumericStepper.jsx | ✅ 완료 |
| 4 | StickyCTA | Customer-Component | StickyCTA.jsx | ✅ 완료 |
| 5 | ShopList Card | 리뉴얼-2026 | ShopListCard.jsx | ✅ 완료 |
| 6 | Swimlane Card | 리뉴얼-2026 | SwimlaneCard.jsx | ✅ 완료 |
| 7 | Shortcut Card | 리뉴얼-2026 | ShortcutCard.jsx | ✅ 완료 |
| 8 | BrandnewBanner | 리뉴얼-2026 | BrandnewBanner.jsx | ✅ 완료 |
| 9 | 할인 브랜드 스윔레인 | 리뉴얼-2026 | DiscountBrandSwimlane.jsx | ✅ 완료 |
| 10 | FloatingPill (요타임딜) | 리뉴얼-2026 | BottomNav.jsx | ✅ 완료 |
| 11 | FloatingPill (주문현황) | 리뉴얼-2026 | BottomNav.jsx | ✅ 완료 |
| 12 | BottomNavNew | 리뉴얼-2026 | BottomNav.jsx | ✅ 완료 |
| 13 | NavNew (pill nav) | 리뉴얼-2026 | BottomNav.jsx | ✅ 완료 |
| 14 | NaviItemNew | 리뉴얼-2026 | BottomNav.jsx | ✅ 완료 |

**전체 14/14 완료 ✅**

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

### 5. ShopList Card
- 로고(88px) + 가게명 + 별점 + 배달시간/배달비 + 혜택 배지
- benefitType: none/ypx_free_delivery/store_free_delivery/단일혜택
- subscriptionType: none/ypx_sub/ypx_nonsub
- AD 라벨, offersBadge 지원

### 6. Swimlane Card
- 150x150 썸네일 + 가게명 + 별점 + 배달정보 + 혜택배지
- SwimlaneRow 컨테이너: 섹션 헤더 + 가로 스크롤
- 하트 버튼, AD 라벨, offersBadge 오버레이

### 7. Shortcut Card
- 아이콘(48/40px) + 라벨(12/11px), size(medium/small)
- ShortcutRow: 가로 스크롤 배치
- badge 숫자/텍스트 지원, 커스텀 컬러

### 8. BrandnewBanner
- variant a: 선착순 특가, variant b: 네이버 멤버십, variant c: 무한적립
- card 모드 (그라디언트 배경), 이미지 인디케이터
- BrandnewCarousel: 멀티 배너 + 인디케이터 dots

### 9. 할인 브랜드 스윔레인
- SectionHeader: 제목 + chevron + auto_transition 버튼
- BrandCard: 로고(48px r16) + 가게명(12r) + 배지(opt) + 혜택(14b)
- 3페이지 × 3아이템, 인디케이터 dots
- DiscountBrandSwimlane 컨테이너

### 10~14. BottomNav 관련 (BottomNav.jsx)
- FloatingPill: 범용 pill 컨테이너 (52px h, r100)
- YoTimedealBar: 타임딜 pill (할인금액 + 카운트다운)
- OrderStatusBar: 주문현황 pill (7 variant)
- NavNew: pill glass nav (r40, 62px, 5탭)
- NaviItemNew: 개별 탭 아이템 (28px 아이콘 + 10px 라벨)
- BottomNavNew: 전체 하단 영역 (nav + floating bar)
