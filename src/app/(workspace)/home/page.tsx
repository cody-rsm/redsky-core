import type { Metadata } from 'next';
import { HomeView } from '@/components/dashboard/home-view';
import { HOME_TABS, type HomeTab } from '@/features/personalization/catalog';

export const metadata: Metadata = { title: 'Home' };

const isHomeTab = (value: unknown): value is HomeTab => typeof value === 'string' && (HOME_TABS as ReadonlyArray<string>).includes(value);

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tab } = await searchParams;
  return <HomeView tab={isHomeTab(tab) ? tab : 'overview'} />;
}
