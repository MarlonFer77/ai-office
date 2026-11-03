export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Same-origin fetch to the API (proxied by Next). Cookies are httpOnly. */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let issues;
    try {
      const body = await res.json();
      message = body.message ?? message;
      issues = body.issues;
    } catch {
      // Non-JSON 5xx from the Next.js proxy: the API process is not reachable.
      if (res.status >= 500)
        message =
          'Não foi possível falar com a API (porta 4000). Verifique se ela está em execução.';
    }
    if (res.status === 500 && message === 'Erro 500')
      message = 'Erro interno no servidor. Veja o terminal da API para detalhes.';
    throw new ApiError(res.status, message, issues);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.');
