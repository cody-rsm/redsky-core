import 'server-only';
import { getConfig } from '@/server/config/env';
import { demoProvider } from './demo/demo-provider';
import { productionProvider } from './production-provider';
import type { WorkspaceDataProvider } from './types';

export function getDataProvider(): WorkspaceDataProvider {
  return getConfig().dataMode === 'demo' ? demoProvider : productionProvider;
}
