import {
  IssueLevel,
  IValidationContext,
  ValidationContext,
  ValidationError,
  Validator,
} from "./validation.js";
import { DecoratedType, MappingMetadata } from "./decorators.js";

function getProperty(propertyRef: string | number, data: any): { found: boolean, value?: any } {
  if (typeof propertyRef === "number") {
    return {
      found: propertyRef in data,
      value: data[propertyRef]
    };
  }

  const parts = propertyRef.split(".");
  let current = data;
  let path = [];
  for (const part of parts) {
    path.push(part);
    if (current == null) {
      return { found: false };
    }

    const ix = Number(part);
    const ixOrName = Number.isNaN(ix) ? part : ix;
    if (ixOrName in current) {
      current = current[ixOrName];
    } else {
      return { found: false };
    }
  }

  return {
    found: true,
    value: current,
  };
}

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
    if (data === null || data === undefined) {
      return data;
    }

    const paramMappings: MappingMetadata[] | undefined = ctor._parameters;
    const propMappings: { [key: string]: MappingMetadata } | undefined =
      ctor._properties;

    const params: any[] = [];

    if (paramMappings) {
      for (let index = 0; index < paramMappings.length; index++) {
        const mapping: MappingMetadata = paramMappings[index];
        let mapped = false;
        for (const mappedNameOrIx of ifEmpty(mapping?.aliases, index)) {
          let { found, value: val } = getProperty(mappedNameOrIx, data);
          if (found) {
            path.push(mappedNameOrIx);

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

        if (!mapped) {
          if (mapping?.isRequired) {
            ctx.error(`Required parameter not found: ${ifEmpty(mapping?.aliases, index)}`);
          } else if(mapping?.defaultValue) {
            params[index] = mapping.defaultValue;
          }
        }
      }
    }

    const result = new ctor(...params);

    if (propMappings) {
      for (const key of Object.getOwnPropertyNames(propMappings)) {
        const mapping: MappingMetadata = propMappings[key];
        let mapped = false;
        for (const mappedNameOrIx of ifEmpty(mapping.aliases, key)) {
          let { found, value: val } = getProperty(mappedNameOrIx, data);
          if (found) {
            path.push(mappedNameOrIx);

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

        if (!mapped) {
          if (mapping.isRequired) {
            ctx.error(`Required property or field not found: ${key}`);
          } else if (mapping.defaultValue) {
            result[key] = mapping.defaultValue;
          }
        }
      }
    }

    if (implementsCustomMapping(result)) {
      result.mapData(data, ctx);
    }

    if (implementsCustomValidation(result)) {
      result.validate(ctx);
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

  return objectOrUnspecified("_properties") && arrayOrUnspecified("_parmeters");
}

export interface ICustomMapping {
  mapData(data: any, ctx: IValidationContext): void
}

function implementsCustomMapping(obj: any): obj is ICustomMapping {
  return obj && typeof obj === "object" && "mapData" in obj && typeof obj.mapData === "function";
}

export interface ICustomValidation {
  validate(ctx: IValidationContext): void
}

function implementsCustomValidation(obj: any): obj is ICustomValidation {
  return obj && typeof obj === "object" && "validate" in obj && typeof obj.validate === "function";
}
