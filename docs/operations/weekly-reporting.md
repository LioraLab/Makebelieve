# Step 6: Weekly Reporting Automation Starter

## 제공 산출물

1. API: `GET /api/admin/reports/weekly`
2. 운영 문서: `docs/operations/kpi-baseline.md`
3. 자동화 스크립트: `scripts/ops/generate-weekly-report.mjs`

## API 스펙 (관리자 권한 필요)

- 인증 헤더
  - `x-admin-token` 또는 `Authorization: Bearer <ADMIN_API_TOKEN>`
- 쿼리
  - `days` (기본 `7`, 범위 `1..30`)
  - `eventLimit` (기본 `200`, 최대 `1000`)
- 응답
  - `window`: 기간 정보
  - `kpis.jobs`: 작업 KPI(총합/상태별/유형별/실패율)
  - `kpis.payments`: 결제 KPI(상태별/매출)
  - `kpis.funnel`: 전환 KPI
  - `alerts`: 임계치 알림 목록
  - `events`: 최근 이벤트 상위 목록 + 샘플 카운트

### 예시

```bash
curl -H "x-admin-token: $ADMIN_API_TOKEN" \
  "http://localhost:3000/api/admin/reports/weekly?days=7&eventLimit=200"
```

## 운영 실행 (주간 자동화)

- `scripts/ops/generate-weekly-report.mjs`는 위 API를 호출해:
  1. JSON을 생성/저장
  2. 콘솔에 간단한 요약 출력
  3. CI/스케줄러에서 주 1회 실행 가능

### GitHub Actions 예시

```yaml
name: weekly-kpi-report
on:
  schedule:
    - cron: '0 8 * * 1'
jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node scripts/ops/generate-weekly-report.mjs
        env:
          ADMIN_API_BASE: https://example.com
          ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
```

## 책임자/주기

- 실행: 운영자 (주 1회, 월요일)
- 리뷰: PM + Growth
- 리포트 승인: 운영 리드
