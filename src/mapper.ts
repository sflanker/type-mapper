import {
  IssueLevel,
  IValidationContext,
  ValidationContext,
  ValidationError,
  Validator,
} from "./validation.js";
import { DecoratedType, MappingMetadata } from "./decorators.js";

export class Mapper {
  // Sequence: alias -> validate -> transform -> recurse
  static convert<T, TArgs extends any[] = []>(
    ctor: new (...args: TArgs) => T,
    data: any,
    cb?: (result: T, ctx: IValidationContext) => void,
  ): T {
    if (!isDecoratedType(ctor)) {
      throw new Error(
        "The specified type contains invalid metadata for a type-mapper decorated type.",
      );
    }

    const path: (string | number)[] = [];
    const ctx = new ValidationContext(path);
    const result = Mapper.internalCreateInstance(ctor, data, ctx, path);

    if (cb) {
      cb(result, ctx);
    } else {
      // throw on error
      const errors = ctx.issues.filter((iss) => iss.level === IssueLevel.error);
      if (errors.length) {
        throw new ValidationError(
          `Validation failed with ${errors.length} errors: ${errors.map((iss) => iss.message)}`,
          ctx,
        );
      }
    }

    return result;
  }

  private static internalCreateInstance(
    ctor: DecoratedType,
    data: any,
    ctx: ValidationContext,
    path: (string | number)[],
  ): any {
    const paramMappings: MappingMetadata[] | undefined = ctor._parameters;
    const propMappings: { [key: string]: MappingMetadata } | undefined =
      ctor._properties;

    const params: any[] = [];

    if (paramMappings) {
      for (let index = 0; index < paramMappings.length; index++) {
        const mapping = paramMappings[index];
        let mapped = false;
        for (const mappedNameOrIx of ifEmpty(mapping?.aliases, index)) {
          if (mappedNameOrIx in data) {
            path.push(mappedNameOrIx);
            let val: any = data[mappedNameOrIx];

            if (mapping.preValidationTransform) {
              val = mapping.preValidationTransform(val);
            }

            let validationResult: IssueLevel | undefined = undefined;
            if (mapping?.validations.length) {
              validationResult = Validator.validateValue(
                mapping.validations,
                val,
                ctx,
              );
            }

            // Ignore values if they have validation errors
            if (validationResult !== IssueLevel.error) {
              if (mapping?.transform) {
                val = mapping.transform(val);
              }

              if (mapping?.mappedAs) {
                val = this.handleRecursiveMapping(
                  mapping.mappedAs,
                  !!mapping.isArray,
                  val,
                  ctx,
                  path,
                );
              }
              mapped = true;
              params[index] = val;
            }
            path.pop();
            break;
          }
        }

        if (!mapped && mapping?.isRequired) {
          ctx.error(`Required parameter not found: ${index}`);
        }
      }
    }

    const result = new ctor(...params);

    if (propMappings) {
      for (const key of Object.getOwnPropertyNames(propMappings)) {
        const mapping = propMappings[key];
        let mapped = false;
        for (const mappedNameOrIx of ifEmpty(mapping.aliases, key)) {
          if (mappedNameOrIx in data) {
            path.push(mappedNameOrIx);
            let val: any = data[mappedNameOrIx];

            if (mapping.preValidationTransform) {
              val = mapping.preValidationTransform(val);
            }

            let validationResult: IssueLevel | undefined = undefined;
            if (mapping.validations.length) {
              validationResult = Validator.validateValue(
                mapping.validations,
                val,
                ctx,
              );
            }

            if (validationResult !== IssueLevel.error) {
              if (mapping.transform) {
                val = mapping.transform(val);
              }

              if (mapping.mappedAs) {
                val = this.handleRecursiveMapping(
                  mapping.mappedAs,
                  !!mapping.isArray,
                  val,
                  ctx,
                  path,
                );
              }
              mapped = true;
              result[key] = val;
            }
            path.pop();
            break;
          }
        }

        if (!mapped && mapping?.isRequired) {
          ctx.error(`Required property or field not found: ${key}`);
        }
      }
    }

    return result;
  }

  private static handleRecursiveMapping(
    ctor: DecoratedType,
    isArray: boolean,
    data: any,
    ctx: ValidationContext,
    path: (string | number)[],
  ): any {
    if (isArray) {
      if (data != null) {
        if (!Array.isArray(data)) {
          ctx.error(
            `Expected an array but found a non array type for property ${path.join(".")}`,
          );
          return;
        }
        return data.map((v, ix) => {
          path.push(ix);
          const r = Mapper.internalCreateInstance(ctor, v, ctx, path);
          path.pop();
          return r;
        });
      }
    } else {
      return Mapper.internalCreateInstance(ctor, data, ctx, path);
    }
  }
}

function ifEmpty<T>(ary: T[] | undefined, val: T) {
  return ary?.length ? ary : [val];
}

function isDecoratedType(
  ctor: new (...args: any[]) => any,
): ctor is DecoratedType {
  function objectOrUnspecified(name: string) {
    if (name in ctor) {
      const val = (<any>ctor)[name];
      if (!(val instanceof Object)) {
        return false;
      }
    }
    return true;
  }
  function arrayOrUnspecified(name: string) {
    if (name in ctor) {
      const val = (<any>ctor)[name];
      if (!Array.isArray(val)) {
        return false;
      }
    }
    return true;
  }
  if (!objectOrUnspecified("_properties")) {
    return false;
  }
  if (!arrayOrUnspecified("_parmeters")) {
    return false;
  }
  return true;
}
