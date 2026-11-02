'use client';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@ai-office/ui';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6" role="alert">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" />
        <h1 className="mt-3 text-lg font-semibold">Algo deu errado nesta tela</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {error.message || 'Erro inesperado.'} Seus dados estão salvos no servidor.
        </p>
        <Button className="mt-4" onClick={reset}>
          <RotateCcw /> Tentar novamente
        </Button>
      </div>
    </div>
  );
}
