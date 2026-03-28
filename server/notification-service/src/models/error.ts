export class BaseError extends Error {
  type: string;
  code: number;
  message: string;

  constructor(type: string, code: number, message: string) {
    super(message);
    this.type = type;
    this.code = code;
    this.message = message;
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super("Validation Error", 400 , message);
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string) {
    super("Not Found Error", 404, message);
  }
}

export class InternalError extends BaseError {
  constructor(message: string) {
    super("Internal Error", 500, message);
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message: string) {
    super("Unauthorized Error", 401, message);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string) {
    super("Forbidden Error", 403, message);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string) {
    super("Conflict Error", 409, message);
  }
}