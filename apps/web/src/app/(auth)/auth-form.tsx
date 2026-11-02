'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Spinner } from '@ai-office/ui';
import { api, errorMessage } from '@/lib/api';
import { useAppConfig } from '@/lib/queries';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const qc = useQueryClient();
  const config = useAppConfig();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (body: { email: string; password: string; name?: string }) => {
    setLoading(true);
    setError(null);
    try {
      await api(mode === 'login' ? '/auth/sign-in/email' : '/auth/sign-up/email', { method: 'POST', json: body });
      await qc.invalidateQueries();
      router.replace(mode === 'signup' ? '/projects/new?welcome=1' : '/office');
    } catch (e) {
      const msg = errorMessage(e);
      setError(/invalid/i.test(msg) ? 'E-mail ou senha inválidos.' : /exist/i.test(msg) ? 'Este e-mail já está cadastrado.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submit({ email: String(f.get('email')), password: String(f.get('password')), ...(mode === 'signup' ? { name: String(f.get('name')) } : {}) });
  };

  return (
    <Card className="glass shadow-2xl shadow-violet-950/40">
      <CardHeader>
        <CardTitle>{mode === 'login' ? 'Entrar no escritório' : 'Criar sua conta'}</CardTitle>
        <CardDescription>{mode === 'login' ? 'Acompanhe e coordene sua equipe de agentes.' : 'Monte sua equipe de agentes em poucos minutos.'}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required autoComplete="name" placeholder="Seu nome" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mínimo de 8 caracteres" />
          </div>
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Spinner />} {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
        {mode === 'login' && config.data?.demoLoginEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground"><span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" /></div>
            <Button variant="secondary" className="w-full" disabled={loading} onClick={() => submit({ email: 'demo@aioffice.dev', password: 'aioffice-demo' })}>
              <Sparkles className="text-amber-300" /> Explorar o escritório demo
            </Button>
          </>
        )}
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>Ainda não tem conta? <Link className="text-primary-soft hover:underline" href="/signup">Criar conta</Link></>
          ) : (
            <>Já tem conta? <Link className="text-primary-soft hover:underline" href="/login">Entrar</Link></>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
