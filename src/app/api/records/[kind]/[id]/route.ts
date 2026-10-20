import { RECORD_KINDS, type RecordKind } from '@/features/ai/types';
import { getDataProvider } from '@/server/data';
import { authedRoute } from '@/server/http/api';
import { notFound } from '@/server/http/errors';
import { buildProviderContext } from '@/server/services/workspace-service';

const KINDS = [...RECORD_KINDS, 'company'] as const;

export const GET = authedRoute<{ kind: string; id: string }>(async ({ params, user, actor }) => {
  if (!(KINDS as ReadonlyArray<string>).includes(params.kind)) throw notFound('Unknown record type');
  const record = await getDataProvider().record(params.kind as RecordKind | 'company', decodeURIComponent(params.id).slice(0, 200), await buildProviderContext(user, actor));
  if (!record) throw notFound('Record not found');
  return record;
});
