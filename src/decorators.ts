import { IValidationContext } from "./validation.js";

export function mapped(
  target: any,
  key: symbol | string | undefined,
  descriptorOrIx?: PropertyDescriptor | number,
): void {
  withMapping(target, key, descriptorOrIx, (mapping) => {});
}

// alias
export function alias(name: string): PropertyDecorator & ParameterDecorator {
  function aliasDecorator(
    target: any,
    key: symbol | string | undefined,
    descriptorOrIx?: PropertyDescriptor | number,
  ): void {
    withMapping(target, key, descriptorOrIx, (mapping) => {
      mapping.aliases.push(name);
    });
  }

  return aliasDecorator;
}

export function required(
  target: any,
  key: symbol | string | undefined,
  descriptorOrIx?: PropertyDescriptor | number,
): void {
  withMapping(target, key, descriptorOrIx, (mapping) => {
    mapping.isRequired = true;
  });
}

// validate
export function validate(
  fn: (v: any, ctx: IValidationContext) => void,
): PropertyDecorator & ParameterDecorator {
  function validateDecorator(
    target: any,
    key: symbol | string | undefined,
    descriptorOrIx?: PropertyDescriptor | number,
  ): void {
    withMapping(target, key, descriptorOrIx, (mapping) => {
      mapping.validations.push(fn);
    });
  }

  return validateDecorator;
}

// transform
export function transform<TIn, TOut>(
  fn: (v: TIn) => TOut,
  preValidation: boolean = false
): PropertyDecorator & ParameterDecorator {
  function transformDecorator(
    target: any,
    key: symbol | string | undefined,
    descriptorOrIx?: PropertyDescriptor | number,
  ): void {
    withMapping(target, key, descriptorOrIx, (mapping) => {
      if (preValidation) {
        mapping.preValidationTransform = fn;
      } else {
        mapping.transform = fn;
      }
    });
  }

  return transformDecorator;
}

export function typeOf<T, TArgs extends any[]>(
  type: new (...args: TArgs) => T,
) {
  function typeOfDecorator(
    target: any,
    key: symbol | string | undefined,
    descriptorOrIx?: PropertyDescriptor | number,
  ): void {
    withMapping(target, key, descriptorOrIx, (mapping) => {
      mapping.mappedAs = type;
    });
  }

  return typeOfDecorator;
}

export function arrayOf<T, TArgs extends any[]>(
  type: new (...args: TArgs) => T,
) {
  function arrayOfDecorator(
    target: any,
    key: symbol | string | undefined,
    descriptorOrIx?: PropertyDescriptor | number,
  ): void {
    withMapping(target, key, descriptorOrIx, (mapping) => {
      mapping.mappedAs = type;
      mapping.isArray = true;
    });
  }

  return arrayOfDecorator;
}

export type MappingMetadata = {
  aliases: (string | number)[];
  preValidationTransform?: (v: any) => any;
  validations: Array<(v: any, ctx: IValidationContext) => void>;
  transform?: (v: any) => any;
  mappedAs?: DecoratedType;
  isArray?: boolean;
  isRequired?: boolean;
};

export type DecoratedType = (new (...args: any[]) => any) & {
  _properties?: {
    [key: string]: MappingMetadata;
  };
  _parameters?: MappingMetadata[];
};

function withMapping(
  target: any,
  key: symbol | string | undefined,
  descriptorOrIx: PropertyDescriptor | number | undefined,
  fn: (mapping: MappingMetadata) => void,
): void {
  if (typeof key == "string") {
    const mapping = ensurePropertyMapping(target.constructor, key);
    fn(mapping);
  } else if (typeof descriptorOrIx === "number") {
    const mapping = ensureParameterMapping(target, descriptorOrIx);
    fn(mapping);
  }
}

function ensurePropertyMapping(
  ctor: new (...args: any[]) => any,
  key: string,
): MappingMetadata {
  let properties = (<DecoratedType>ctor)._properties;
  if (!properties) {
    (<DecoratedType>ctor)._properties = properties = {};
  }
  let mapping = properties[key];
  if (!mapping) {
    properties[key] = mapping = makeMappingMetadata();
  }
  return mapping;
}

function ensureParameterMapping(
  ctor: new (...args: any[]) => any,
  ix: number,
): MappingMetadata {
  let parameters = (<DecoratedType>ctor)._parameters;
  if (!parameters) {
    (<DecoratedType>ctor)._parameters = parameters = [];
  }
  let mapping = parameters[ix];
  if (!mapping) {
    parameters[ix] = mapping = makeMappingMetadata();
  }
  return mapping;
}

function makeMappingMetadata(): MappingMetadata {
  return {
    aliases: <(string | number)[]>[],
    validations: <Array<(v: any, ctx: IValidationContext) => void>>[],
    // transform?: (v: any) => any;
    // mappedAs?: DecoratedType;
    // isArray?: boolean;
  };
}
