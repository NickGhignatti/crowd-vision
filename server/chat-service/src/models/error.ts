export class BaseError extends Error {
  constructor(
    public type: string,
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super("Validation Error", 400, message);
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message: string) {
    super("Unauthorized Error", 401, message);
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string) {
    super("Not Found Error", 404, message);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string) {
    super("Conflict Error", 409, message);
  }
}

export class BadGatewayError extends BaseError {
  constructor(message: string) {
    super("Bad Gateway Error", 502, message);
  }
}

export class InternalError extends BaseError {
  constructor(message: string) {
    super("Internal Error", 500, message);
  }
}
