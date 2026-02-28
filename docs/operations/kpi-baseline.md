# Step 6: KPI Baseline Report Scaffolding

**목적:** 베타 런치 초반 2주를 기준으로 KPI 기준선(베이스라인)과 추적 템플릿을 고정한다.

## KPI 트리 (A/B 실험/운영 모두 공통)

1. **전환 퍼널**
   - 방문 → 프리뷰 요청
   - 프리뷰 완료율
   - 프리뷰 → 결제 시작
   - 결제 완료(paid) → `full_ready` 전달
2. **품질/안정성**
   - `jobs.failed` 비율
   - `jobs.dlq` 비율
   - 실패 후 재시도 성공율
3. **운영/비용**
   - 시간당 신규 주문 수
   - 일일 비용 사용율(`abuse.budget`)
4. **재구매/리텐션(2주)**
   - 중복 주문율
   - 테마 재생성 반복율

## 기초 데이터 정의

API `GET /api/admin/reports/weekly`가 아래 KPI를 반환한다.

| KPI 키 | 정의 | 분자 | 분모 |
|---|---|---|---|
| `preview_request_to_ready_rate` | 프리뷰 완료율 | `fulfillment_status` ∈ {`preview_ready`,`full_queued`,`full_generating`,`full_ready`,`delivery_locked`} | story 생성 수 |
| `checkout_to_paid_rate` | 결제 확정율 | paid 주문 수 | 결제 시작 주문 수 |
| `full_delivery_rate` | 전체 생성 전달율 | `full_ready`인 story 수 | paid story 수 |
| `job_dlq_rate` | DLQ 비율 | `jobs.dlq` 수 | jobs 총합 |
| `full_job_fail_rate` | 전체작업 실패율 | type=`full` & status=`failed` | type=`full` jobs |
| `preview_job_fail_rate` | 프리뷰 작업 실패율 | type=`preview` & status=`failed` | type=`preview` jobs |
| `weekly_new_revenue` | 주간 매출 | paid 주문 금액 합(usd cents) | 7일 윈도우 주문 |

## 샘플 보고서 템플릿

- **주차:** `YYYY-WW`
- **기간:** `windowSince` ~ `windowUntil`
- **핵심 변화:** 전주 대비 KPI Delta
- **실험 상태:** `experimentReadiness` + `openIssues`
- **Next Action:** 지표 악화 항목별 `owner` + `due`

## 기본 임계치(초기 값)

- `job_dlq_rate <= 0.05`
- `full_job_fail_rate <= 0.08`
- `preview_request_to_ready_rate >= 0.75`
- `full_delivery_rate >= 0.90`

임계치 위반 시 `api/admin/reports/weekly`에서 `alerts`를 확인해 운영 알림으로 전파한다.
