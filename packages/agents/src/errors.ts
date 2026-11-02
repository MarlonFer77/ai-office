export type ProviderErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'aborted'
  | 'bad_request'
  | 'not_found'
  | 'unavailable'
  | 'refusal'
  | 'budget'
  | 'unknown';

/** Normalised provider error. Messages never include credentials. */
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function isRetryable(err: unknown): boolean {
  return err instanceof ProviderError ? err.retryable : false;
}

/** Shared mapping from HTTP status to a normalised error. */
export function errorFromStatus(status: number | undefined, message: string): ProviderError {
  if (status === 401 || status === 403)
    return new ProviderError(
      'auth',
      'Credenciais inválidas ou sem permissão no provedor.',
      false,
      status,
    );
  if (status === 429)
    return new ProviderError(
      'rate_limit',
      'Limite de requisições do provedor atingido.',
      true,
      status,
    );
  if (status === 404)
    return new ProviderError(
      'not_found',
      `Modelo ou recurso não encontrado: ${message}`,
      false,
      status,
    );
  if (status === 400 || status === 422)
    return new ProviderError(
      'bad_request',
      `Requisição rejeitada pelo provedor: ${message}`,
      false,
      status,
    );
  if (status !== undefined && status >= 500)
    return new ProviderError('unavailable', 'Provedor indisponível no momento.', true, status);
  return new ProviderError('unknown', message, true, status);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
