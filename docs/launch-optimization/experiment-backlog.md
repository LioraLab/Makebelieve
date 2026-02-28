# Beta Launch Experiment Backlog (Step 6)

This document tracks lightweight experiments for the beta optimization loop: pricing, copy, and theme
adjustments that can be run without backend risk while preserving production stability.

## Objectives

- Build first 2-week improvement loop before public scale-up.
- Keep each experiment measurable with explicit success metrics and owner.
- Tie experiment cadence to weekly KPI cadence so changes can be reviewed predictably.

## Runbook Snapshot

- **Report refresh cadence:** weekly
- **Owner alias:** `growth@makebelieve`, `editorial@makebelieve`
- **Source of truth:** `/api/admin/optimization?report=backlog`

## Experiment Backlog (Starter Set)

| ID | Type | Owner | Status | Title | Hypothesis | Success Metric | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EXP-001 | pricing | growth@makebelieve | proposed | Pricing tier optimization for premium conversion | A temporary discount improves first-time paid conversion without hurting margin. | Checkout completion rate +4% vs baseline; trial-to-paid +2pp. | Keep if improvement persists for 2 consecutive daily cohorts. |
| EXP-002 | copy | growth@makebelieve | ready | Copy experiment for hero CTA and trust messaging | Trust-first copy improves preview→checkout conversion. | Preview→Checkout ratio +3pp and preview dropout -2pp. | Pass on both metrics over two full weekdays. |
| EXP-003 | theme | editorial@makebelieve | ready | Theme defaults and seasonal variants | Curated seasonal themes increase resonance and reduce early abandonment. | Time-to-first-preview -10%; preview→checkout +2pp. | Keep preview completion >= 92% and full retry rate unchanged. |

## Experiment Execution Template

Use this template when adding new experiments:

- **ID/Title/Type**
- **Hypothesis**
- **Metric + target uplift**
- **Traffic segment** (e.g., new visitors, returning visitors)
- **Owner + reviewer**
- **Planned start/end**
- **Status** (`proposed` → `ready` → `running` → `complete` → `archived`)
- **Postmortem note** (why passed/failed and follow-up action)

## Operational Safety

- Do not alter pricing/theme/copy logic outside feature flags approved by the lead.
- Keep experiments tied to observable metrics in `/api/admin/optimization`.
- Archive inactive experiments to avoid stale hypotheses.
