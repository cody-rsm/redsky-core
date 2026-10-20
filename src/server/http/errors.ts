export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, 'not_found', what);
export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
// A capability that exists in RedSky but whose backing system is not connected yet. Production never
// pretends these succeeded.
export const unavailable = (message: string) => new HttpError(409, 'unavailable', message);
export const tooManyRequests = () => new HttpError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.');
