import { runMigrations } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida. Copie .env.example para .env na raiz do projeto.');
  process.exit(1);
}
try {
  await runMigrations(url);
  console.log('Migrações aplicadas.');
} catch (err) {
  const text = `${err instanceof Error ? err.message : ''} ${String((err as { cause?: { code?: string } })?.cause?.code ?? '')}`;
  if (/ECONNREFUSED/.test(text)) {
    console.error(
      [
        '',
        'Não há PostgreSQL respondendo no endereço de DATABASE_URL.',
        '  1. Abra o Docker Desktop e espere ele ficar "running".',
        '  2. Rode: pnpm services:up   (e depois: docker compose ps — postgres deve estar "healthy")',
        '  3. Rode de novo: pnpm db:migrate',
        '',
      ].join('\n'),
    );
  } else if (/password authentication failed/i.test(text)) {
    console.error(
      '\nUsuário/senha do PostgreSQL não conferem com DATABASE_URL. Há outro PostgreSQL na porta 5432?\n',
    );
  } else {
    console.error(err);
  }
  process.exit(1);
}
