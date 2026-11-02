'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, Tooltip } from '@ai-office/ui';
import { NAV } from './nav';
import { Logo } from './logo';

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="glass sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col border-r border-border/70 md:flex xl:w-60"
      aria-label="Navegação principal"
    >
      <div className="flex h-14 items-center px-5">
        <Link
          href="/office"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="xl:hidden">
            <Logo compact />
          </span>
          <span className="hidden xl:inline">
            <Logo />
          </span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Tooltip key={href} content={label} side="right">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'bg-primary/12 text-foreground',
                )}
              >
                {active && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_12px_var(--color-primary)]" />
                )}
                <Icon className={cn('size-[18px] shrink-0', active && 'text-primary-soft')} />
                <span className="hidden xl:inline">{label}</span>
              </Link>
            </Tooltip>
          );
        })}
      </nav>
      <div className="hidden px-5 pb-5 text-[11px] leading-relaxed text-muted-foreground/70 xl:block">
        As animações refletem eventos reais do sistema.
      </div>
    </aside>
  );
}
