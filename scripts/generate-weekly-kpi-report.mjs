#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || '';
const FROM = process.env.WEEKLY_REPORT_FROM || '';
const TO = process.env.WEEKLY_REPORT_TO || '';
const OUTPUT_DIR = process.env.WEEKLY_REPORT_OUTPUT_DIR || 'artifacts/weekly-reports';
const OUTPUT_NAME = process.env.WEEKLY_REPORT_OUTPUT_NAME || `kpi-weekly-${new Date().toISOString().slice(0, 10)}.md`;

function resolveUrl() {
  const query = new URLSearchParams();
  if (FROM) {
    query.set('from', FROM);
  }
  if (TO) {
    query.set('to', TO);
  }

  const url = new URL('/api/admin/optimization/weekly-report', BASE_URL);
  url.search = query.toString();
  return url;
}

function formatCurrencyFromCents(cents) {
  return (cents / 100).toFixed(2);
}

function markdownTable(rows, headers) {
  const headerRow = `| ${headers.join(' | ')} |`;
  const dividerRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyRows = rows
    .map((row) => `| ${row.map((cell) => String(cell)).join(' | ')} |`)
    .join('\n');

  return [headerRow, dividerRow, bodyRows].filter(Boolean).join('\n');
}

function renderMarkdownReport(payload) {
  const jobs = payload.data.jobs;
  const events = payload.data.events;
  const orders = payload.data.orders;

  const jobStatusRows = Object.entries(jobs.totals.byStatus).map(([status, count]) => [status, count]);
  const jobTypeRows = Object.entries(jobs.totals.byType).map(([type, count]) => [type, count]);

  return `# Weekly KPI Baseline Report\n\nGenerated: ${payload.data.generatedAt}\nWindow: ${payload.data.window.from} ~ ${payload.data.window.to}\n\n## KPI Snapshot\n\n- Preview failure rate: ${(jobs.quality.previewFailRate * 100).toFixed(2)}%\n- Full failure rate: ${(jobs.quality.fullFailRate * 100).toFixed(2)}%\n- Preview\u2192Full queued: ${(jobs.previewToFullQueuedRate * 100).toFixed(2)}%\n- Preview\u2192Paid: ${(orders.previewToPaidRate * 100).toFixed(2)}%\n- Paid orders: ${orders.paid}\n- Paid revenue: $${formatCurrencyFromCents(orders.paidRevenueCents)}\n\n## Jobs by Status\n${markdownTable(jobStatusRows, ['status', 'count'])}\n\n## Jobs by Type\n${markdownTable(jobTypeRows, ['type', 'count'])}\n\n## Top Error Codes\n${jobs.topErrorCodes.length ? markdownTable(jobs.topErrorCodes.map((item) => [item.error_code, item.count]), ['error_code', 'count']) : 'No errors in this window.'}\n\n## Top Event Codes\n${markdownTable(events.topCodes, ['event_code', 'count'])}\n\n## Recommendations\n- Investigate any top event/error spikes by drill-down into \/api\/admin\/events and \/api\/admin\/telemetry before release decisions.\n- Keep this report attached to Step 6 weekly experiments for experiment owners and operations handoff.\n`;
}

async function main() {
  if (!ADMIN_TOKEN) {
    throw new Error('ADMIN_API_TOKEN is required for report generation. Set env var and retry.');
  }

  const url = resolveUrl();
  const response = await fetch(url, {
    headers: {
      'x-admin-token': ADMIN_TOKEN,
      'content-type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Report API request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(`Report API returned error: ${payload.error?.message ?? 'unknown'}`);
  }

  const outputDir = path.resolve(process.cwd(), OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, OUTPUT_NAME.replace(/\.md$/i, '.json'));
  const markdownPath = path.join(outputDir, OUTPUT_NAME);

  await fs.writeFile(jsonPath, JSON.stringify(payload.data, null, 2), 'utf8');
  await fs.writeFile(markdownPath, renderMarkdownReport(payload), 'utf8');

  console.log(`Weekly KPI report written:\n- ${jsonPath}\n- ${markdownPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
