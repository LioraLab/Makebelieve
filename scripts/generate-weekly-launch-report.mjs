#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.MAKEBELIEVE_APP_URL?.trim() || 'http://localhost:3000';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN?.trim();
const HOURS = Number.parseInt(process.env.MAKEBELIEVE_WEEKLY_REPORT_HOURS?.trim() ?? '168', 10);

if (!ADMIN_API_TOKEN) {
  console.error('[launch-report] ADMIN_API_TOKEN is required.');
  process.exit(1);
}

if (!Number.isFinite(HOURS) || HOURS <= 0) {
  console.error('[launch-report] MAKEBELIEVE_WEEKLY_REPORT_HOURS must be a positive number.');
  process.exit(1);
}

const reportUrl = new URL('/api/admin/optimization', BASE_URL);
reportUrl.searchParams.set('report', 'weekly');
reportUrl.searchParams.set('hours', String(HOURS));

let response;
try {
  response = await fetch(reportUrl, {
    method: 'GET',
    headers: {
      'x-admin-token': ADMIN_API_TOKEN,
      'content-type': 'application/json',
    },
  });
} catch (error) {
  console.error('[launch-report] API request failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!response.ok) {
  console.error(`[launch-report] API call failed with ${response.status}: ${response.statusText}`);
  const text = await response.text();
  console.error(text);
  process.exit(1);
}

let payload;
try {
  payload = await response.json();
} catch (error) {
  console.error('[launch-report] failed to parse response JSON:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!payload?.ok) {
  console.error('[launch-report] API returned an error payload:');
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

const { data } = payload;
const windowFrom = data.window?.from ? new Date(data.window.from).toISOString().slice(0, 10) : 'windowed';
const windowTo = data.window?.to ? new Date(data.window.to).toISOString().slice(0, 10) : 'windowed';
const runDate = new Date().toISOString().slice(0, 10);

const summaryRows = Object.entries(data.summary?.rates ?? {}).map(
  ([label, value]) => `- **${label}**: ${value}`,
);

const topBacklog = (data.backlog ?? [])
  .map((item) => `- [${item.status}] ${item.id} (${item.type}): ${item.title}`)
  .join('\n');

const weeklyRows = (data.weekly ?? []).map((row) => {
  const revenue = Number(row.paidCents ?? 0);
  return `| ${row.date} | ${row.storiesCreated} | ${row.previewReady} | ${row.fullReady} | ${row.paidOrders} | ${revenue} | ${row.paidEvents} |`;
});

const markdown = `# Makebelieve Weekly Optimization Report (${runDate})

- Generated at: ${new Date(data.generatedAt ?? Date.now()).toISOString()}
- Window: ${windowFrom} ~ ${windowTo} (${data.window?.hours || HOURS}h)

## KPI Snapshot (Current Window)

${summaryRows.join('\n')}

## Active Experiment Backlog

${topBacklog || '- (No experiments configured.)'}

## Daily Series

| Date | Stories Created | Preview Ready | Full Ready | Paid Orders | Paid Cents | Paid Webhook Events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${weeklyRows.join('\n')}
`;

const outDir = path.resolve(process.cwd(), 'docs', 'launch-optimization', 'weekly-reports');
const outPath = path.join(outDir, `weekly-launch-report-${runDate}.md`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, markdown, 'utf8');

console.log(`[launch-report] Wrote weekly report: ${outPath}`);
