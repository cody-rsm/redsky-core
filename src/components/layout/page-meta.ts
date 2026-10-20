import type { IconName } from '@/components/ui/icon';
import { isModuleId, navItemById } from '@/features/navigation/catalog';

export function pageMetaFor(pathname: string): { title: string; icon: IconName } {
  if (pathname.startsWith('/people')) return { title: 'People', icon: 'people' };
  if (pathname.startsWith('/pipeline')) return { title: 'Deal Pipeline', icon: 'pipeline' };
  const moduleMatch = pathname.match(/^\/m\/([a-z]+)/);
  if (moduleMatch?.[1] && isModuleId(moduleMatch[1])) {
    if (moduleMatch[1] === 'help') return { title: 'Help', icon: 'help' };
    const item = navItemById(moduleMatch[1]);
    if (item) return { title: item.label, icon: item.icon };
  }
  return { title: 'Home', icon: 'home' };
}
