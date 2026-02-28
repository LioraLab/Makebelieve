# KPI Baseline Report (Scaffold)

The baseline KPI report is used to establish a first-pass production-safe starting point for
beta iteration.

## Required Baseline Fields

- `stories.created`
- `orders.total`, `orders.paidCount`, `orders.refundedCount`, `orders.disputedCount`
- `orders.totalPaidAmountCents`
- `jobs.total`, `jobs.byType`, `jobs.byStatus`
- `jobs.failures` (`previewFailed`, `fullFailed`, `dlq`)
- `rates.previewSuccessRate`, `rates.fullSuccessRate`, `rates.orderPaidRate`
- `latency.previewP95Ms`, `latency.fullP95Ms`
- `events.paidWebhookEvents`, `events.unknownEventRate`

## Baseline Run

```
GET /api/admin/optimization?report=baseline&hours=168
```

- `hours` should be at least `168` for an initial weekly baseline, lower for ad-hoc checks.
- Token header: `x-admin-token` (or `Authorization: Bearer <token>`)

## Baseline Interpretation Guide

- **Preview success rate** should stay stable before any pricing/copy/theme change.
- **DLQ rate** and **unknown event rate** should remain low; if they spike, pause experiments.
- **Latency P95** (preview/full) is the health gate for quality assumptions.
- Use the same endpoint every week with unchanged window for consistency.

## Weekly Baseline Template (Copy)

| Window | Preview Success | Full Success | Order Paid Rate | Unknown Event Rate | Preview P95ms | Full P95ms | Paid Cents |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {from} ~ {to} | {value} | {value} | {value} | {value} | {value} | {value} | {value} |
