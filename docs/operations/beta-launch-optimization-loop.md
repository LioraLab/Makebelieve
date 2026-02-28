# Beta Launch Optimization Loop Artifacts

## 1) Step 6 목적 (실행 기준)

- 목표: 베타 런칭 후 2주 단위로 전환율 개선 사이클을 빠르게 돌리기
- 산출물: 실험 백로그 + KPI 기준선 + 주간 리포트 자동화
- 제약: 기존 운영/결제/생성 파이프라인 변경 없이 읽기 전용 측정·문서 기반으로 시작

## 2) 실험 Backlog 템플릿

> 담당자: 운영/PD/CS 중 1인

| 실험 ID | 가설 | 실행 구간 | 대상 | 핵심 KPI | 성공 기준 | 롤백 기준 | 상태 | Owner | 시작일 | 종료일 |
|---|---|---|---|---|---|---|---|---|---|
| exp-pricing-copy-001 | 가격·설명 문구 개선이 결제 전환을 높임 | `/pricing`, CTA 직전 | 게스트/유입자 | `preview_to_paid_rate` | +8% 이상 | 2주 기준 -10% 이하면 롤백 | proposed | - | - | - |
| exp-theme-default-001 | 기본 테마를 시즌형/캐릭터형으로 변경 시 완독률/환류가 개선됨 | 프리뷰 화면 | 게스트 신규 | `preview_to_full_queued_rate`, `full_fail_rate` | +5% / -20% | 실험 가설 미달 | proposed | - | - | - |
| exp-onboarding-copy-001 | 첫 문구/스토리 설명 보강 시 프리뷰 이탈 감소 | builder 첫 화면 | 신규 방문자 | `preview_ready_rate`, `time_to_first_preview_ms` | +6% | 7일간 -5% 이하 | proposed | - | - | - |

### 실험 진행 절차

1. 가설 등록 시 `실험 ID`와 `수정 범위`를 한 문단으로 고정
2. 현재 기준선과 비교 가능한 KPI 정의 (예: `preview_to_paid_rate`)
3. 최소 실행일(`planned_start`)과 종료일(`planned_end`)를 설정
4. 운영 배포 이전에 리스크(법무/브랜드/가격/지원 영향) 동의
5. 주간 리뷰에서 결과 반영 후 다음 실험으로 승격/폐기

## 3) KPI 기준선 템플릿

Baseline은 `/api/admin/optimization/weekly-report` API로 산출한다.

- `preview_to_paid_rate` = `orders.paid / jobs.previewReady`
- `preview_fail_rate` = `jobs.preview fail / jobs.preview total`
- `full_fail_rate` = `jobs.full fail / jobs.full total`
- `preview_to_full_queued_rate` = `jobs.fullQueued / jobs.previewReady`
- `avg_job_latency_ms` = `avg(jobs.updated_at - jobs.created_at)`
- `paid_revenue_usd` = `sum(orders.amount_cents) / 100`

### 기준선 캘린더 규칙

- 기본은 최근 7일(`from`, `to`) 창
- 주별 비교를 위해 월요일 00:00 기준으로 고정하면 가독성 상승
- 각 실험은 시작 전 주간 기준선 2개 주 이상 확보

## 4) 주간 리포팅 자동화

실행 스크립트: `scripts/generate-weekly-kpi-report.mjs`

### 환경 변수

- `ADMIN_API_TOKEN` (필수)
- `APP_BASE_URL` 또는 `NEXT_PUBLIC_APP_URL` (기본: `http://localhost:3000`)
- `WEEKLY_REPORT_FROM` / `WEEKLY_REPORT_TO` (ISO date 또는 datetime)
- `WEEKLY_REPORT_OUTPUT_DIR` (기본: `artifacts/weekly-reports`)
- `WEEKLY_REPORT_OUTPUT_NAME` (기본: `kpi-weekly-YYYY-MM-DD.md`)

### 실행 예시

```bash
ADMIN_API_TOKEN=*** \
WEEKLY_REPORT_FROM=2026-02-21T00:00:00.000Z \
WEEKLY_REPORT_TO=2026-02-28T23:59:59.999Z \
npx node scripts/generate-weekly-kpi-report.mjs
```

### 스크립트 출력

- JSON: `artifacts/weekly-reports/<날짜>.json`
- Markdown: `artifacts/weekly-reports/<날짜>.md`

## 5) 운영 API

### `GET /api/admin/optimization/weekly-report`

- Query: `from`, `to` (ISO 문자열, 선택)
- Auth: `x-admin-token` 또는 `Authorization: Bearer <token>`
- Response: jobs/events/orders 기반 KPI 및 집계 결과
- 용도: 실험 기준선, 주간 리포트, 임계치 모니터링

