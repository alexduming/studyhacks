const MASKED_NEXT_ERROR_PATTERNS = [
  'An error occurred in the Server Components render',
  'The specific message is omitted in production builds',
  'A digest property is included on this error instance',
];

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || '';
  }

  return String(error ?? '');
}

export function isInsufficientCreditsMessage(message: string): boolean {
  return (
    message.includes('Insufficient credits') || message.includes('积分不足')
  );
}

export function isMaskedNextErrorMessage(message: string): boolean {
  return MASKED_NEXT_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern)
  );
}

export function getUserFacingErrorMessage({
  error,
  fallbackMessage,
  insufficientCreditsMessage,
}: {
  error: unknown;
  fallbackMessage: string;
  insufficientCreditsMessage?: string;
}): string {
  const message = getErrorMessage(error);

  if (
    insufficientCreditsMessage &&
    isInsufficientCreditsMessage(message)
  ) {
    return insufficientCreditsMessage;
  }

  if (isMaskedNextErrorMessage(message)) {
    return fallbackMessage;
  }

  return message || fallbackMessage;
}
