var iwhen;
(function (iwhen) {
    function when(promiseOrValue, onFulfilled, onRejected, onProgress) {
        return resolve(promiseOrValue).then(onFulfilled, onRejected, onProgress);
    }
    iwhen.when = when;

    var TrustedPromise = (function () {
        function TrustedPromise(then, inspect) {
            this.then = then;
            this.inspect = inspect;
        }
        TrustedPromise.prototype.otherwise = function (onRejected) {
            return this.then(undef, onRejected);
        };

        TrustedPromise.prototype.ensure = function (onFulfilledOrRejected) {
            return this.then(injectHandler, injectHandler).yield(this);

            function injectHandler(valueOrReason) {
                return resolve(onFulfilledOrRejected(valueOrReason));
            }
        };

        TrustedPromise.prototype.yield = function (value) {
            return this.then(function () {
                return value;
            });
        };

        TrustedPromise.prototype.spread = function (onFulfilled) {
            return this.then(function (array) {
                return all.apply(undef, array).then(function (array) {
                    return onFulfilled.apply(undef, array);
                });
            });
        };

        TrustedPromise.prototype.always = function (onFulfilledOrRejected, onProgress) {
            return this.then(onFulfilledOrRejected, onFulfilledOrRejected, onProgress);
        };
        return TrustedPromise;
    })();

    function resolve(value) {
        return promise(function (resolve) {
            return resolve(value);
        });
    }
    iwhen.resolve = resolve;

    function reject(promiseOrValue) {
        return when(promiseOrValue, rejected);
    }
    iwhen.reject = reject;

    function defer() {
        var deferred, pending, resolved;

        deferred = {
            promise: undef,
            resolve: undef,
            reject: undef,
            notify: undef,
            resolver: { resolve: undef, reject: undef, notify: undef }
        };

        deferred.promise = pending = promise(makeDeferred);

        return deferred;

        function makeDeferred(resolvePending, rejectPending, notifyPending) {
            deferred.resolve = deferred.resolver.resolve = function (value) {
                if (resolved) {
                    return resolve(value);
                }
                resolved = true;
                resolvePending(value);
                return pending;
            };

            deferred.reject = deferred.resolver.reject = function (reason) {
                if (resolved) {
                    return resolve(rejected(reason));
                }
                resolved = true;
                rejectPending(reason);
                return pending;
            };

            deferred.notify = deferred.resolver.notify = function (update) {
                notifyPending(update);
                return update;
            };
        }
    }
    iwhen.defer = defer;

    function promise(resolver) {
        var value;
        var handlers = [];

        try  {
            resolver(promiseResolve, promiseReject, promiseNotify);
        } catch (e) {
            promiseReject(e);
        }

        return new TrustedPromise(then, inspect);

        function then(onFulfilled, onRejected, onProgress) {
            return promise(function (resolve, reject, notify) {
                if (handlers) {
                    handlers.push(function (value) {
                        value.then(onFulfilled, onRejected, onProgress).then(resolve, reject, notify);
                    });
                } else {
                    enqueue(function () {
                        value.then(onFulfilled, onRejected, onProgress).then(resolve, reject, notify);
                    });
                }
            });
        }

        function inspect() {
            return value ? value.inspect() : toPendingState();
        }

        function promiseResolve(val) {
            if (!handlers) {
                return;
            }

            value = coerce(val);
            scheduleHandlers(handlers, value);

            handlers = undef;
        }

        function promiseReject(reason) {
            promiseResolve(rejected(reason));
        }

        function promiseNotify(update) {
            if (handlers) {
                scheduleHandlers(handlers, progressing(update));
            }
        }
    }
    iwhen.promise = promise;

    function coerce(x) {
        if (x instanceof TrustedPromise) {
            return x;
        }

        if (!(x === Object(x) && 'then' in x)) {
            return fulfilled(x);
        }

        return promise(function (resolve, reject, notify) {
            enqueue(function () {
                try  {
                    var untrustedThen = x.then;

                    if (typeof untrustedThen === 'function') {
                        fcall(untrustedThen, x, resolve, reject, notify);
                    } else {
                        resolve(fulfilled(x));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    function fulfilled(value) {
        var self = new TrustedPromise(function (onFulfilled) {
            try  {
                return typeof onFulfilled == 'function' ? coerce(onFulfilled(value)) : self;
            } catch (e) {
                return rejected(e);
            }
        }, function () {
            return toFulfilledState(value);
        });

        return self;
    }

    function rejected(reason) {
        var self = new TrustedPromise(function (_, onRejected) {
            try  {
                return typeof onRejected == 'function' ? coerce(onRejected(reason)) : self;
            } catch (e) {
                return rejected(e);
            }
        }, function () {
            return toRejectedState(reason);
        });

        return self;
    }

    function progressing(update) {
        var self = new TrustedPromise(function (_, __, onProgress) {
            try  {
                return typeof onProgress == 'function' ? progressing(onProgress(update)) : self;
            } catch (e) {
                return progressing(e);
            }
        });

        return self;
    }

    function scheduleHandlers(handlers, value) {
        enqueue(function () {
            var handler, i = 0;
            while (handler = handlers[i++]) {
                handler(value);
            }
        });
    }

    function isPromise(promiseOrValue) {
        return promiseOrValue && typeof promiseOrValue.then === 'function';
    }
    iwhen.isPromise = isPromise;

    function some(promisesOrValues, howMany) {
        return when(promisesOrValues, function (promisesOrValues) {
            return promise(resolveSome);

            function resolveSome(resolve, reject, notify) {
                var toResolve, toReject, values, reasons, fulfillOne, rejectOne, len, i;

                len = promisesOrValues.length >>> 0;

                toResolve = Math.max(0, Math.min(howMany, len));
                values = [];

                toReject = (len - toResolve) + 1;
                reasons = [];

                if (!toResolve) {
                    resolve(values);
                } else {
                    rejectOne = function (reason) {
                        reasons.push(reason);
                        if (!--toReject) {
                            fulfillOne = rejectOne = identity;
                            reject(reasons);
                        }
                    };

                    fulfillOne = function (val) {
                        values.push(val);
                        if (!--toResolve) {
                            fulfillOne = rejectOne = identity;
                            resolve(values);
                        }
                    };

                    for (i = 0; i < len; ++i) {
                        if (i in promisesOrValues) {
                            when(promisesOrValues[i], fulfiller, rejecter, notify);
                        }
                    }
                }

                function rejecter(reason) {
                    rejectOne(reason);
                }

                function fulfiller(val) {
                    fulfillOne(val);
                }
            }
        });
    }
    iwhen.some = some;

    function any(promisesOrValues) {
        function unwrapSingleResult(val) {
            return val[0];
        }

        return some(promisesOrValues, 1).then(function (value) {
            return unwrapSingleResult(value);
        });
    }
    iwhen.any = any;

    function all() {
        var promisesOrValues = [];
        for (var _i = 0; _i < (arguments.length - 0); _i++) {
            promisesOrValues[_i] = arguments[_i + 0];
        }
        return _map(promisesOrValues, identity);
    }
    iwhen.all = all;

    function join() {
        var promises = [];
        for (var _i = 0; _i < (arguments.length - 0); _i++) {
            promises[_i] = arguments[_i + 0];
        }
        return _map(promises, identity);
    }
    iwhen.join = join;

    function settle(arrayOrPromiseOfArray) {
        return _map(arrayOrPromiseOfArray, toFulfilledState, toRejectedState);
    }
    iwhen.settle = settle;

    function map(arrayOrPromiseOfArray, mapFunc) {
        return _map(arrayOrPromiseOfArray, mapFunc);
    }
    iwhen.map = map;

    function _map(array, mapFunc, fallback) {
        return when(array, function (array) {
            return promise(resolveMap);

            function resolveMap(resolve, reject, notify) {
                var results, len, toResolve, resolveOne, i;

                toResolve = len = array.length >>> 0;
                results = [];

                if (!toResolve) {
                    resolve(results);
                    return;
                }

                resolveOne = function (item, i) {
                    when(item, mapFunc, fallback).then(function (mapped) {
                        results[i] = mapped;

                        if (!--toResolve) {
                            resolve(results);
                        }
                    }, reject, notify);
                };

                for (i = 0; i < len; i++) {
                    if (i in array) {
                        resolveOne(array[i], i);
                    } else {
                        --toResolve;
                    }
                }
            }
        });
    }

    function reduce(promise, reduceFunc, initialValue) {
        var args = fcall(slice, arguments, 1);

        return when(promise, function (array) {
            var total;

            total = array.length;

            args[0] = function (current, val, i) {
                return when(current, function (c) {
                    return when(val, function (value) {
                        return reduceFunc(c, value, i, total);
                    });
                });
            };

            return reduceArray.apply(array, args);
        });
    }
    iwhen.reduce = reduce;

    function toFulfilledState(x) {
        return { state: 'fulfilled', value: x };
    }

    function toRejectedState(x) {
        return { state: 'rejected', reason: x };
    }

    function toPendingState() {
        return { state: 'pending' };
    }

    var undef;

    var funcProto = Function.prototype;
    var call = funcProto.call;
    var fcall = funcProto.bind ? call.bind(call) : function (f, context) {
        return f.apply(context, slice.call(arguments, 2));
    };

    var arrayProto = [];
    var slice = arrayProto.slice;

    var reduceArray = arrayProto.reduce || function (reduceFunc) {
        var arr, args, reduced, len, i;

        i = 0;
        arr = Object(this);
        len = arr.length >>> 0;
        args = arguments;

        if (args.length <= 1) {
            for (; ; ) {
                if (i in arr) {
                    reduced = arr[i++];
                    break;
                }

                if (++i >= len) {
                    throw new TypeError();
                }
            }
        } else {
            reduced = args[1];
        }

        for (; i < len; ++i) {
            if (i in arr) {
                reduced = reduceFunc(reduced, arr[i], i, arr);
            }
        }

        return reduced;
    };

    function enqueue(task) {
        task();
    }

    function identity(x) {
        return x;
    }
})(iwhen || (iwhen = {}));
//@ sourceMappingURL=iwhen.js.map
