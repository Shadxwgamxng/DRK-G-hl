export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "UNAUTHENTICATED" = "VALIDATION",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Keine Berechtigung für diese Aktion.") => new AppError(msg, "FORBIDDEN");
export const notFound = (msg = "Datensatz nicht gefunden oder kein Zugriff.") => new AppError(msg, "NOT_FOUND");
export const conflict = (msg: string) => new AppError(msg, "CONFLICT");
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new AppError(msg, "VALIDATION", fieldErrors);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
