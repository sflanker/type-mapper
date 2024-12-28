export interface IValidationContext {
  readonly issues: ValidationIssue[];
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  addIssue(level: IssueLevel, message: string): void;
}

export class ValidationContext implements IValidationContext {
  public readonly issues: ValidationIssue[] = [];

  constructor(private readonly _path: (string | number)[]) {}

  public info(message: string) {
    this.addIssue(IssueLevel.info, message);
  }

  public warn(message: string) {
    this.addIssue(IssueLevel.warn, message);
  }

  public error(message: string) {
    this.addIssue(IssueLevel.error, message);
  }

  public addIssue(level: IssueLevel, message: string) {
    this.issues.push(new ValidationIssue(this.pathString(), level, message));
  }

  private pathString(): string {
    let str = "";
    for (const p of this._path) {
      if (typeof p === "string") {
        if (str) {
          str += `.${p}`;
        } else {
          str += p;
        }
      } else {
        str += `[${p}]`;
      }
    }
    return str;
  }
}

export class ValidationIssue {
  constructor(
    public readonly path: string,
    public readonly level: IssueLevel,
    public readonly message: string,
  ) {}
}

export enum IssueLevel {
  info = 0,
  warn = 1,
  error = 2,
}

export class ValidationError extends Error {
  override get name() {
    return "ValidationError";
  }

  constructor(
    message: string,
    public readonly context: IValidationContext,
  ) {
    super(message);
  }
}

export class Validator {
  public static validateValue(
    validations: ((v: any, ctx: IValidationContext) => void)[],
    value: any,
    context: ValidationContext,
  ): IssueLevel | undefined {
    const trackingContext = new TrackingValidationContext(context);
    for (const validation of validations) {
      validation(value, trackingContext);
    }

    return trackingContext.maximumSeverity;
  }
}

class TrackingValidationContext implements IValidationContext {
  public maximumSeverity: IssueLevel | undefined;

  public get issues() {
    return this.context.issues;
  }

  constructor(private context: IValidationContext) {}

  public info(message: string): void {
    if (!this.maximumSeverity || IssueLevel.info > this.maximumSeverity) {
      this.maximumSeverity = IssueLevel.info;
    }

    this.context.info(message);
  }

  public warn(message: string): void {
    if (!this.maximumSeverity || IssueLevel.warn > this.maximumSeverity) {
      this.maximumSeverity = IssueLevel.warn;
    }

    this.context.warn(message);
  }

  public error(message: string): void {
    if (!this.maximumSeverity || IssueLevel.error > this.maximumSeverity) {
      this.maximumSeverity = IssueLevel.error;
    }

    this.context.error(message);
  }

  public addIssue(level: IssueLevel, message: string): void {
    if (!this.maximumSeverity || level > this.maximumSeverity) {
      this.maximumSeverity = level;
    }

    this.context.addIssue(level, message);
  }
}

type ValidatorFn<T> = (value: T, ctx: IValidationContext) => void;

type ValidatorChain<TIn, TOut> = ValidatorFn<TIn> & {
  refine<TRefined>(fn: ValidatorFn<TOut>): ValidatorChain<TIn, TRefined>;
};

function makeValidatorChain<TIn, TOut>(
  fn: ValidatorFn<TIn>,
  ignoreNull: boolean = false,
): ValidatorChain<TIn, TOut> {
  function validate(value: TIn, ctx: IValidationContext) {
    if (!ignoreNull || value != null) {
      fn(value, ctx);
    }
  }

  validate.refine = function <TRefined>(
    next: ValidatorFn<TOut>,
  ): ValidatorChain<TIn, TRefined> {
    return refineValidatorChain<TIn, TOut, TRefined>(
      validate,
      next,
      ignoreNull,
    );
  };

  return validate;
}

function refineValidatorChain<TIn, TCurrent, TRefined>(
  chain: ValidatorChain<TIn, TCurrent>,
  next: ValidatorFn<TCurrent>,
  ignoreNull: boolean = false,
): ValidatorChain<TIn, TRefined> {
  function validate(value: TIn, ctx: IValidationContext) {
    if (!ignoreNull || value != null) {
      const wrappedContext = new TrackingValidationContext(ctx);
      chain(value, wrappedContext);
      if (wrappedContext.maximumSeverity !== IssueLevel.error) {
        // If no error is reported we can assume the type has been refined
        next(<TCurrent>(<any>value), wrappedContext);
      }
    }
  }

  validate.refine = function <TInnerRefined>(
    next: ValidatorFn<TRefined>,
  ): ValidatorChain<TIn, TInnerRefined> {
    return refineValidatorChain<TIn, TRefined, TInnerRefined>(
      validate,
      next,
      ignoreNull,
    );
  };

  return validate;
}

export type StringValidator = ValidatorFn<any> & {
  maxLength(len: number, level?: IssueLevel, message?: string): StringValidator;
  minLength(len: number, level?: IssueLevel, message?: string): StringValidator;
  enum(values: string[], level?: IssueLevel, message?: string): StringValidator;
};

function makeStringValidator(
  baseValidator: ValidatorChain<any, string>,
): StringValidator {
  const newValidator: StringValidator = <any>baseValidator;

  newValidator.maxLength = (
    len: number,
    level = IssueLevel.error,
    message = undefined,
  ) => {
    return makeStringValidator(
      baseValidator.refine<string>((str, ctx) => {
        if (str?.length > len) {
          ctx.addIssue(
            level,
            message ??
              `Maximum length exceeded (max: ${len}, actual: ${str.length})`,
          );
        }
      }),
    );
  };

  newValidator.minLength = (
    len: number,
    level = IssueLevel.error,
    message = undefined,
  ) => {
    return makeStringValidator(
      baseValidator.refine<string>((str, ctx) => {
        if (str?.length < len) {
          ctx.addIssue(
            level,
            message ??
              `Minimum length violated (max: ${len}, actual: ${str.length})`,
          );
        }
      }),
    );
  };

  newValidator.enum = (
    values: string[],
    level = IssueLevel.error,
    message = undefined,
  ) => {
    return makeStringValidator(
      baseValidator.refine<string>((str, ctx) => {
        if (!values.includes(str)) {
          ctx.addIssue(
            level,
            message ??
              `Value did not match one of the ${values.length} expected options: ${str}`,
          );
        }
      }),
    );
  };

  return newValidator;
}

export type NumberValidator = ValidatorFn<any> & {
  max(limit: number, level?: IssueLevel, message?: string): NumberValidator;
  min(limit: number, level?: IssueLevel, message?: string): NumberValidator;
};

function makeNumberValidator(
  baseValidator: ValidatorChain<any, number>,
): NumberValidator {
  const newValidator: NumberValidator = <any>baseValidator;

  newValidator.max = (limit, level = IssueLevel.error, message = undefined) => {
    return makeNumberValidator(
      baseValidator.refine<number>((num, ctx) => {
        if (num > limit) {
          ctx.addIssue(
            level,
            message ?? `Value (${num}) is greater than the maximum: ${limit}`,
          );
        }
      }),
    );
  };

  newValidator.min = (limit, level = IssueLevel.error, message = undefined) => {
    return makeNumberValidator(
      baseValidator.refine<number>((num, ctx) => {
        if (num < limit) {
          ctx.addIssue(
            level,
            message ?? `Value (${num}) is less than the minimum: ${limit}`,
          );
        }
      }),
    );
  };

  return newValidator;
}

export const isString = () =>
  makeStringValidator(
    makeValidatorChain<any, string>((value: any, ctx: IValidationContext) => {
      if (typeof value !== "string") {
        ctx.error(`Expected type string, but found: ${typeof value}`);
      }
    }),
  );

export const isNumber = (allowNaN: boolean = false) =>
  makeNumberValidator(
    makeValidatorChain<any, number>((value: any, ctx: IValidationContext) => {
      if (typeof value !== "number") {
        ctx.error(`Expected type number, but found: ${typeof value}`);
      } else if (!allowNaN && isNaN(value)) {
        ctx.error("Unexpected value: NaN");
      }
    })
  );

export type NullableValidator = ValidatorFn<any> & {
  isNumber(): NumberValidator;
  isString(): StringValidator;
};

function makeNullableValidator(
  baseValidator: ValidatorChain<any, number>,
): NullableValidator {
  const newValidator = <NullableValidator>(<any>baseValidator);

  newValidator.isNumber = () =>
    makeNumberValidator(
      makeValidatorChain<any, number>((value: any, ctx: IValidationContext) => {
        if (typeof value !== "number") {
          ctx.error(`Expected type number, but found: ${typeof value}`);
        }
      }, true),
    );

  newValidator.isString = () =>
    makeStringValidator(
      makeValidatorChain<any, string>((value: any, ctx: IValidationContext) => {
        if (typeof value !== "string") {
          ctx.error(`Expected type string, but found: ${typeof value}`);
        }
      }, true),
    );

  return newValidator;
}

export const nullable = () =>
  makeNullableValidator(makeValidatorChain<any, any>(() => {}, true));
