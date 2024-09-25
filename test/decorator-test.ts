import * as assert from "node:assert";
import { describe, it } from "node:test";

import {
  IssueLevel,
  IValidationContext,
  Mapper,
  alias,
  arrayOf,
  mapped,
  nullable,
  required,
  typeOf,
  validate,
  transform,
  isString
} from "../src/index.js";

// Test @mapped
class TestNestedMappedExample {
  @mapped
  public baz: string = "";
}

class TestMappedExample {
  @mapped
  public foo: string = "";

  private _bar: string = "default";

  public get bar(): string {
    return this._bar;
  }

  @mapped
  public set bar(value: string) {
    this._bar = value;
  }

  @mapped
  @typeOf(TestNestedMappedExample)
  public nestedProp: TestNestedMappedExample | undefined;
}

const exampleMappedObj = {
  foo: "one",
  bar: "two",
  nestedProp: {
    baz: "three",
  },
};

describe("mapped decorator", () => {
  const e = Mapper.convert(TestMappedExample, exampleMappedObj);

  it("correctly maps fields", () => {
    assert.equal(e.foo, "one");
  });

  it("correctly maps properties", () => {
    assert.equal(e.bar, "two");
  });

  it("works with nested objects", () => {
    assert.ok(e.nestedProp);
    assert.equal(e.nestedProp.baz, "three");
  });
});

// Test @alias
class TestNestedAliasExample {
  @alias("nested-foo")
  public foo: string = "";

  public bar: string = "";

  constructor(@alias("nested-bar") bar: string) {
    this.bar = "init:" + bar;
  }
}

class TestAliasExample {
  @alias("test-field")
  public foo: string = "";

  private _baz: string = "default";

  public get baz(): string {
    return this._baz;
  }

  @alias("test-setter")
  public set baz(value: string) {
    this._baz = value;
  }

  public bar: string = "";

  @alias("test-nested-prop")
  @typeOf(TestNestedAliasExample)
  public nestedProp: TestNestedAliasExample | undefined;

  constructor(
    @alias("test-param") _bar: string,
    unused: string | undefined,
    @alias("another-param") public huh: string,
  ) {
    this.bar = _bar;
    if (unused) {
      console.log(unused);
    }
  }
}

const exampleAliasObj = {
  "test-field": "one",
  "test-setter": "two",
  "test-param": "three",
  "another-param": "four",
  "test-nested-prop": {
    "nested-foo": "five",
    "nested-bar": "six",
  },
};

describe("alias decorator", () => {
  const e = Mapper.convert(TestAliasExample, exampleAliasObj);

  it("correctly maps fields", () => {
    assert.equal(e.foo, "one");
  });

  it("correctly maps properties", () => {
    assert.equal(e.baz, "two");
  });

  it("correctly maps parameters", () => {
    assert.equal(e.bar, "three");
    assert.equal(e.huh, "four");
  });

  it("works with nested objects", () => {
    assert.ok(e.nestedProp);
    assert.equal(e.nestedProp.foo, "five");
    assert.equal(e.nestedProp.bar, "init:six");
  });
});

// test @arrayOf
class TestArrayOfExample {
  @arrayOf(TestNestedMappedExample)
  public nestedArray: TestNestedMappedExample[] | undefined;
}

const exampleMappedArrayObj = {
  nestedArray: [{ baz: "one" }, { baz: "two" }],
};

describe("mapped array", () => {
  const e = Mapper.convert(TestArrayOfExample, exampleMappedArrayObj);

  it("correctly maps array entries", () => {
    assert.ok(e.nestedArray);
    assert.equal(e.nestedArray.length, 2);
    assert.equal(e.nestedArray[0].baz, "one");
    assert.equal(e.nestedArray[1].baz, "two");
  });
});

// test @required
class TestRequiredExample {
  @required
  public foo: string = "";

  private _bar: string = "";

  public get bar() {
    return this._bar;
  }

  constructor(@required @alias("bar") bar: string) {
    this._bar = "init:" + bar;
  }
}

describe("required decorator", () => {
  it("errors if required field is unspecified", () => {
    assert.throws(() => {
      Mapper.convert(TestRequiredExample, { bar: "two" });
    });
  });

  it("errors if required param is unspecified", () => {
    assert.throws(() => {
      Mapper.convert(TestRequiredExample, { foo: "one" });
    });
  });

  it("does not error if all required fields and parameters are specified", () => {
    const e = Mapper.convert(TestRequiredExample, {
      foo: undefined,
      bar: undefined,
    });

    assert.equal(e.foo, undefined);
    assert.equal(e.bar, "init:undefined");
  });
});

// test @validate
function testValidationFn(message: string) {
  return function (val: any, ctx: IValidationContext) {
    ctx.info(`${message}:${val}`);
  };
}

class TestValidateExample {
  @validate(testValidationFn("foo"))
  public foo: string = "";

  private _bar: string;

  public get bar() {
    return this._bar;
  }

  constructor(@validate(testValidationFn("bar")) @alias("bar") bar: string = "def") {
    this._bar = "init:" + bar;
  }
}

describe("validate decorator", () => {
  it("calls validation for fields with values", () => {
    let callbackFired = false;

    Mapper.convert(
      TestValidateExample,
      { foo: "one" },
      (_, ctx: IValidationContext) => {
        assert.equal(ctx.issues.length, 1);
        assert.equal(ctx.issues[0].level, IssueLevel.info);
        assert.equal(ctx.issues[0].message, "foo:one");
        callbackFired = true;
      },
    );

    assert.ok(callbackFired);
  });

  it("calls validation for fields with null values", () => {
    let callbackFired = false;

    Mapper.convert(
      TestValidateExample,
      { foo: null },
      (_, ctx: IValidationContext) => {
        assert.equal(ctx.issues.length, 1);
        assert.equal(ctx.issues[0].level, IssueLevel.info);
        assert.equal(ctx.issues[0].message, "foo:null");
        callbackFired = true;
      },
    );

    assert.ok(callbackFired);
  });

  it("calls validation for params with values", () => {
    let callbackFired = false;

    Mapper.convert(
      TestValidateExample,
      { bar: "two" },
      (_, ctx: IValidationContext) => {
        assert.equal(ctx.issues.length, 1);
        assert.equal(ctx.issues[0].level, IssueLevel.info);
        assert.equal(ctx.issues[0].message, "bar:two");
        callbackFired = true;
      },
    );

    assert.ok(callbackFired);
  });

  it("calls validation for params with null values", () => {
    let callbackFired = false;

    Mapper.convert(
      TestValidateExample,
      { bar: undefined },
      (_, ctx: IValidationContext) => {
        assert.equal(ctx.issues.length, 1);
        assert.equal(ctx.issues[0].level, IssueLevel.info);
        assert.equal(ctx.issues[0].message, "bar:undefined");
        callbackFired = true;
      },
    );

    assert.ok(callbackFired);
  });
});

// test @transform
class TestTransformExample {
  @transform((v: any) => v?.toString(), true)
  @validate(isString())
  @transform((v: string) => v.toUpperCase())
  public foo: string = "";

  private _bar: string;

  public get bar() {
    return this._bar;
  }

  constructor(
    @transform((v: any) => v?.toString(), true)
    @validate(isString())
    @transform((v: string) => v.toLowerCase())
    @alias("bar")
    bar: string = "def"
  ) {
    this._bar = "init:" + bar;
  }
}

describe("transform decorator", () => {
  it("applies transforms to fields", () => {
    const e = Mapper.convert(TestTransformExample, { foo: Symbol("foo") })

    assert.equal(e.foo, "SYMBOL(FOO)")
    assert.equal(e.bar, "init:def")
  })

  it("applies transforms to parameters", () => {
    const e = Mapper.convert(TestTransformExample, { bar: Symbol("BAR") })

    assert.equal(e.bar, "init:symbol(bar)")
    assert.equal(e.foo, "")
  })
})