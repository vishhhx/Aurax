/**
 * A message that can never be processed successfully (bad payload, crossed
 * book, ...). Consumers log, count and skip it instead of retrying forever.
 * Any other error is treated as transient and retried by Kafka.
 */
export class InvalidEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEventError";
  }
}
