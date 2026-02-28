# Weekly Reporting Automation (Starter)

Use this automation flow to generate a weekly optimization report artifact from the new admin API.

## What it produces

- Pulls `/api/admin/optimization?report=weekly&hours=168`
- Renders a Markdown summary
- Writes the file into:
  - `docs/launch-optimization/weekly-reports/weekly-<YYYY-MM-DD>.md`

## Script

A starter script is added at:

- `scripts/generate-weekly-launch-report.mjs`

### Environment variables

- `MAKEBELIEVE_APP_URL` (default: `http://localhost:3000`)
- `ADMIN_API_TOKEN` (required)
- `MAKEBELIEVE_WEEKLY_REPORT_HOURS` (default: `168`)

### Command

```bash
node scripts/generate-weekly-launch-report.mjs
```

Optional: run from a cron job (every Monday 10:00 UTC).

```cron
0 10 * * 1 cd /path/to/repo && ADMIN_API_TOKEN=... node scripts/generate-weekly-launch-report.mjs
```

## Verification checklist

- Script exits with non-zero if API fails or unauthenticated.
- Artifact file exists under `docs/launch-optimization/weekly-reports/`.
- KPI values match API payload in team channel before sharing externally.
