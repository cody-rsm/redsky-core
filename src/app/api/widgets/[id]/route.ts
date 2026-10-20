import { WIDGET_IDS } from '@/features/personalization/catalog';
import type { WidgetDataMap } from '@/lib/api/contracts';
import { authedRoute } from '@/server/http/api';
import { notFound } from '@/server/http/errors';
import { buildProviderContext, loadWidget } from '@/server/services/workspace-service';

export const GET = authedRoute<{ id: string }>(async ({ params, user, actor }) => {
  if (!(WIDGET_IDS as ReadonlyArray<string>).includes(params.id)) throw notFound('Unknown widget');
  return loadWidget(params.id as keyof WidgetDataMap, await buildProviderContext(user, actor));
});
