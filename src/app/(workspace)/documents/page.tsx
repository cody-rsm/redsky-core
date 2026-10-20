import type { Metadata } from 'next';
import { DocumentsView } from '@/components/pages/documents-view';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { open } = await searchParams;
  return <DocumentsView openId={typeof open === 'string' && /^[0-9a-f-]{36}$/i.test(open) ? open : null} />;
}
