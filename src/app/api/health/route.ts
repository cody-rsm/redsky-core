import { NextResponse } from 'next/server';
import { getConfig } from '@/server/config/env';
import { pingDatabase } from '@/server/db/client';

// Public liveness/readiness probe for Railway. Reports only coarse status — no hostnames, versions of
// dependencies, user counts or configuration values.
export async function GET() {
  const config = getConfig();
  const database = await pingDatabase();
  const healthy = database === 'ok';
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'unavailable',
      version: (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.REDSKY_VERSION ?? 'dev').slice(0, 12),
      checks: {
        database,
        auth: config.auth.mode === 'none' ? 'unconfigured' : 'configured',
        mode: config.dataMode,
      },
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
