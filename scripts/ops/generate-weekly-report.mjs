#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.ADMIN_API_BASE?.replace(/\/$/, '') || 'http://localhost:3000';
const TOKEN = process.env.ADMIN_API_TOKEN;

function parseArgs(argv) {
  const out = {
    days: '7',
    out: 'artifacts/weekly-report.json',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--days' && argv[i + 1]) {
      out.days = argv[++i];
      continue;
    }
    if (arg === '--out' && argv[i + 1]) {
      out.out = argv[++i];
      continue;
    }
    if (arg === '--help') {
      return null;
    }
  }

  return out;
}

const args = parseArgs(process.argv);
if (!args) {
  console.log('Usage: node scripts/ops/generate-weekly-report.mjs [--days 7] [--out artifacts/weekly-report.json]');
  process.exit(0);
}

if (!TOKEN) {
  console.error('[report] ADMIN_API_TOKEN is required');
  process.exit(1);
}

const url = new URL('/api/admin/reports/weekly', BASE_URL);
url.searchParams.set('days', args.days);
url.searchParams.set('eventLimit', '300');

async function main() {
  const res = await fetch(url.toString(), {
    headers: {
      'x-admin-token': TOKEN,
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[report] request failed (${res.status})`, text);
    process.exit(1);
  }

  const payload = await res.json();
  const outputDir = path.dirname(args.out);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(args.out, JSON.stringify(payload, null, 2), 'utf8');

  const k = payload.data?.kpis;
  console.log('[report] saved:', path.resolve(args.out));
  console.log('[report] window:', payload.data?.window?.since, '->', payload.data?.window?.until);
  if (k) {
    console.log('[report] preview->ready:', k.funnel?.previewRequestToReadyRate);
    console.log('[report] paid->full:', k.funnel?.fullDeliveryRate);
    console.log('[report] job dlq:', k.jobs?.jobDlqRate);
  }
}

main().catch((error) => {
  console.error('[report] unexpected error', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
