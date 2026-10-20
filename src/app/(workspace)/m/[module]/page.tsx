import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ModuleView } from '@/components/pages/module-view';
import { isModuleId, navItemById } from '@/features/navigation/catalog';

type ModulePageProps = { params: Promise<{ module: string }> };

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const { module } = await params;
  return { title: navItemById(module)?.label ?? 'Help' };
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { module } = await params;
  // Documents was a placeholder here before it became a page.
  if (module === 'documents') redirect('/documents');
  if (!isModuleId(module)) notFound();
  return <ModuleView moduleId={module} />;
}
