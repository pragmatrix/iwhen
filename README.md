# iwhen, Immediate Promises

This is an unfinished and untested port of [when.js](https://github.com/cujojs/when) to
[typescript](http://www.typescriptlang.org/) that is specifically built to avoid delaying callbacks.

In this implementation, every callback passed to the library gets either called immediately or directly from within the
context of the asynchronous function that fulfills the promise.

This change may have consequences in several areas, like making bugs harder to reproduce, or consuming a lot of stack
space when the fulfillment runs synchronously.

But when used carefully, this library may be used for asynchronous APIs that are incompatible with the current
promise implementations.

## APIs that may be used with iwhen

### [IndexedDB](http://www.w3.org/TR/IndexedDB/)

In IndexedDB, a transaction lives as long as new requests are initiated in response to success callbacks from previous requests.
If a promise library would delay the callback, the transaction may commit too early and before all the requests
went through.

## Incompatibilities to when.js

- deprecated parameters were removed.
- `iwhen.all()` is a variadic function and so does not expect arrays. To wait for multiple promises, use
`iwhen.all(a, b)` instead of `iwhen.all([a,b])`.

## License

Licensed under the [MIT License](http://www.opensource.org/licenses/mit-license.php).
