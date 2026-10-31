/** A task rule refused the request; `status` is the HTTP status to answer with. */
export class TaskError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
