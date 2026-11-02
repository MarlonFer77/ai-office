import { Bot, Building2, FolderKanban, History, Library, ListChecks, PackageCheck, Settings } from 'lucide-react';

export const NAV = [
  { href: '/office', label: 'Escritório', icon: Building2 },
  { href: '/projects', label: 'Projetos', icon: FolderKanban },
  { href: '/agents', label: 'Agentes', icon: Bot },
  { href: '/tasks', label: 'Tarefas', icon: ListChecks },
  { href: '/deliveries', label: 'Entregas', icon: PackageCheck },
  { href: '/library', label: 'Biblioteca', icon: Library },
  { href: '/history', label: 'Histórico', icon: History },
  { href: '/settings', label: 'Configurações', icon: Settings },
] as const;
