import * as assert from "node:assert";
import { describe, it } from "node:test";

import {
  IssueLevel,
  Mapper,
  ValidationContext,
  nullable,
  validate,
  isNumber,
  isString,
} from "../src/index.js";

function testValidationContext(
  path: string[],
  level: IssueLevel,
  message: string,
): ValidationContext {
  const testPath = [...path];
  const context = new ValidationContext(testPath);
  context.addIssue(level, message);
  testPath.splice(0, testPath.length);
  return context;
}

// test @validate(nullable())
class TestNullableValidateExample {
  @validate(nullable().isString())
  public foo: string | undefined = "def";
}

describe("nullable string validation", () => {
  it("does not error on null", () => {
    const e = Mapper.convert(TestNullableValidateExample, { foo: null });

    assert.equal(e.foo, null);
  });

  it("does not error on null", () => {
    const e = Mapper.convert(TestNullableValidateExample, {
      foo: undefined,
    });

    assert.equal(e.foo, undefined);
  });

  it("does not error on missing", () => {
    const e = Mapper.convert(TestNullableValidateExample, {});

    assert.equal(e.foo, "def");
  });

  it("errors on wrong type", () => {
    assert.throws(() => {
      Mapper.convert(TestNullableValidateExample, { foo: 42 });
    });
  });

  it("issues callback on wrong type", () => {
    let callbackReceived = false;

    const e = Mapper.convert(
      TestNullableValidateExample,
      { foo: 42 },
      (val, ctx) => {
        assert.ok(val);
        assert.equal(val.foo, "def");
        assert.equal(ctx.issues.length, 1);
        assert.equal(ctx.issues[0].level, IssueLevel.error);
        callbackReceived = true;
      },
    );

    assert.ok(callbackReceived);
    assert.equal(e.foo, "def");
  });
});

// test @validate(isString())
class TestStringValidationsExample {
  @validate(isString())
  public foo: string = "def";

  @validate(isString().enum(["one", "two", "three"]))
  public bar: string = "one";

  @validate(isString().maxLength(10).minLength(4))
  public baz: string = "asdf";
}

class TestValidationOrderExample {
  // This is always invalid, the maxLength error should take precedence
  @validate(nullable().isString().maxLength(1).minLength(5))
  public foo: string | undefined;
}

describe("string validation", () => {
  it("throws when value is the wrong type", () => {
    assert.throws(
      () => Mapper.convert(TestStringValidationsExample, { foo: 42 }),
      {
        name: "ValidationError",
        message: /^Validation failed with 1 errors:/,
        context: testValidationContext(
          ["foo"],
          IssueLevel.error,
          "Expected type string, but found: number",
        ),
      },
    );
  });

  it("throws when value violates enum list", () => {
    assert.throws(
      () => Mapper.convert(TestStringValidationsExample, { bar: "four" }),
      {
        name: "ValidationError",
        message: /^Validation failed with 1 errors:/,
        context: testValidationContext(
          ["bar"],
          IssueLevel.error,
          "Value did not match one of the 3 expected options: four",
        ),
      },
    );
  });

  it("throws when value violates maxLength", () => {
    assert.throws(
      () => Mapper.convert(TestStringValidationsExample, { baz: "the quick brown fox" }),
      {
        name: "ValidationError",
        message: /^Validation failed with 1 errors:/,
        context: testValidationContext(
          ["baz"],
          IssueLevel.error,
          "Maximum length exceeded (max: 10, actual: 19)",
        ),
      },
    );
  });

  it("throws when value violates minLength", () => {
    assert.throws(
      () => Mapper.convert(TestStringValidationsExample, { baz: "1" }),
      {
        name: "ValidationError",
        message: /^Validation failed with 1 errors:/,
        context: testValidationContext(
          ["baz"],
          IssueLevel.error,
          "Minimum length violated (max: 4, actual: 1)",
        ),
      },
    );
  });

  it("validation rules are applied in order", () => {
    assert.throws(
      () => Mapper.convert(TestValidationOrderExample, { foo: "two" }),
      {
        name: "ValidationError",
        message: /^Validation failed with 1 errors:/,
        context: testValidationContext(
          ["foo"],
          IssueLevel.error,
          "Maximum length exceeded (max: 1, actual: 3)",
        ),
      },
    );
  });
});

// test @validate(isNumber())
class TestNumberValidationsExample {
  @validate(isNumber())
  public foo: number = 1;

  @validate(isNumber().max(10).min(5))
  public bar: number = 7;
}

describe("string validation", () => {
  it("throws when value is the wrong type", () => {
    assert.throws(
      () => Mapper.convert(TestNumberValidationsExample, { foo: "42" }),
      {
        name: "ValidationError",
        message: /^Validation failed with 1 errors:/,
        context: testValidationContext(
          ["foo"],
          IssueLevel.error,
          "Expected type number, but found: string",
        ),
      },
    );
  });

  it("throws when value violates max constraint", () => {
    assert.throws(
      () => Mapper.convert(TestNumberValidationsExample, { bar: 42 }),
      {
        name: "ValidationError",
        message: /^Validation failed with 1 errors:/,
        context: testValidationContext(
          ["bar"],
          IssueLevel.error,
          "Value (42) is greater than the maximum: 10",
        ),
      },
    );
  })

  it("throws when value violates min constraint", () => {
    assert.throws(
      () => Mapper.convert(TestNumberValidationsExample, { bar: -1 }),
      {
        name: "ValidationError",
        message: /^Validation failed with 1 errors:/,
        context: testValidationContext(
          ["bar"],
          IssueLevel.error,
          "Value (-1) is less than the minimum: 5",
        ),
      },
    );
  })
})