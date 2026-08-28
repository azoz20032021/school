import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express 4 does not catch rejected promises from async handlers — an
 * unhandled rejection there leaves the request hanging until it times out,
 * which is exactly what several of the old routes did on a Firestore hiccup.
 */
export function wrap(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Throwable HTTP error carrying an Arabic message for the UI. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export const notFound = (message = "العنصر المطلوب غير موجود") => new HttpError(404, message);
export const badRequest = (message: string) => new HttpError(400, message);
export const forbidden = (message = "ليس لديك صلاحية للقيام بهذا الإجراء") => new HttpError(403, message);
