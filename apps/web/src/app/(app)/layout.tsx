'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@ai-office/ui';
import { useMe } from '@/lib/queries';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me.isError) router.replace('/login');
  }, [me.isError, router]);

  if (!me.data) {
    return (
      <div className="grid h-dvh place-items-center text-muted-foreground" role="status">
        <span className="flex items-center gap-2 text-sm"><Spinner /> Carregando escritório…</span>
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2">Pular para o conteúdo</a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
