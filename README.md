[![Build](https://github.com/sflanker/type-mapper/actions/workflows/build.yml/badge.svg)](https://github.com/sflanker/type-mapper/actions/workflows/build.yml)

# Type-Mapper - Declarative Mapping Between Untyped Data and JavaScript Classes

If you have untyped data in JavaScript, from `JSON.parse` for example, and you want to transform it into a JavaScript class using a combination of constructor arguments and properties, then `type-mapper` is a solution.

# Installation

```
npm install @sflanker/type-mapper
```

# Usage

Given some untyped data:

```json
{
  "make": "Ford",
  "model": "Mustang",
  "year": 1969
}
```

Decorate your class using Type-Mapper:

```typescript
import { mapped, alias, required, defaultValue } from '@sflanker/type-mapper';

class Vehicle {
    @mapped
    public year: number = 0

    constructor(
        @alias('make')
        @alias('manufaturer')
        @required
        public make: string,
        @alias('model')
        @defaultValue('UNKNOWN')
        public model: string) {
    }
}
```

Then use `Mapper` to convert your untyped data to an instance of your class:

```typescript
import { Mapper } from '@sflanker/type-mapper'

const myVehicle = Mapper.convert(Vehicle, myData)
```

# Features

 * Complex Types (via the `typeOf` and `arrayOf` decorators)
 * Mapping nested data via simple "dot" syntax
 * Mapping Arrays -> Objects via Positional Arguments
 * Required fields and Default Values
 * Validation
 * Transformation