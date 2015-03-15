/**
 * A lightweight CommonJS Promises/A and when() implementation
 * when is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @author Brian Cavalier
 * @author John Hann
 * @version 2.1.0
 *
 * Ported to typescript and changed the behavior so that all callbacks are run
 * immediately in their respective contexts.
 *
 */
var iwhen;
(function (iwhen) {
    /**
     * Register an observer for a promise or immediate value.
     *
     * @param {*} promiseOrValue
     * @param {function?} [onFulfilled] callback to be called when promiseOrValue is
     *   successfully fulfilled.  If promiseOrValue is an immediate value, callback
     *   will be invoked immediately.
     * @param {function?} [onRejected] callback to be called when promiseOrValue is
     *   rejected.
     * @param {function?} [onProgress] callback to be called when progress updates
     *   are issued for promiseOrValue.
     * @returns {Promise} a new {@link Promise} that will complete with the return
     *   value of callback or errback or the completion value of promiseOrValue if
     *   callback and/or errback is not supplied.
     */
    function when(promiseOrValue, onFulfilled, onRejected, onProgress) {
        // Get a trusted promise for the input promiseOrValue, and then
        // register promise handlers
        return resolve(promiseOrValue).then(onFulfilled, onRejected, onProgress);
    }
    iwhen.when = when;
    var TrustedPromise = (function () {
        /**
         * Trusted Promise constructor.  A Promise created from this constructor is
         * a trusted when.js promise.  Any other duck-typed promise is considered
         * untrusted.
         * @constructor
         * @name Promise
         */
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
                // array may contain promises, so resolve its contents.
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
        return promise(function (resolve) { return resolve(value); });
    }
    iwhen.resolve = resolve;
    function reject(promiseOrValue) {
        return when(promiseOrValue, rejected);
    }
    iwhen.reject = reject;
    function defer() {
        var deferred, pending, resolved;
        // Optimize object shape
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
        try {
            resolver(promiseResolve, promiseReject, promiseNotify);
        }
        catch (e) {
            promiseReject(e);
        }
        // Return the promise
        return new TrustedPromise(then, inspect);
        /**
         * Register handlers for this promise.
         * @param [onFulfilled] {Function} fulfillment handler
         * @param [onRejected] {Function} rejection handler
         * @param [onProgress] {Function} progress handler
         * @return {Promise} new Promise
         */
        function then(onFulfilled, onRejected, onProgress) {
            return promise(function (resolve, reject, notify) {
                if (handlers) {
                    // Call handlers later, after resolution
                    handlers.push(function (value) {
                        value.then(onFulfilled, onRejected, onProgress).then(resolve, reject, notify);
                    });
                }
                else {
                    // Call handlers soon, but not in the current stack
                    enqueue(function () {
                        value.then(onFulfilled, onRejected, onProgress).then(resolve, reject, notify);
                    });
                }
            });
        }
        function inspect() {
            return value ? value.inspect() : toPendingState();
        }
        /**
         * Transition from pre-resolution state to post-resolution state, notifying
         * all listeners of the ultimate fulfillment or rejection
         * @param {*|Promise} val resolution value
         */
        function promiseResolve(val) {
            if (!handlers) {
                return;
            }
            value = coerce(val);
            scheduleHandlers(handlers, value);
            handlers = undef;
        }
        /**
         * Reject this promise with the supplied reason, which will be used verbatim.
         * @param {*} reason reason for the rejection
         */
        function promiseReject(reason) {
            promiseResolve(rejected(reason));
        }
        /**
         * Issue a progress event, notifying all progress listeners
         * @param {*} update progress event payload to pass to all listeners
         */
        function promiseNotify(update) {
            if (handlers) {
                scheduleHandlers(handlers, progressing(update));
            }
        }
    }
    iwhen.promise = promise;
    /**
     * Coerces x to a trusted Promise
     *
     * @private
     * @param {*} x thing to coerce
     * @returns {Promise} Guaranteed to return a trusted Promise.  If x
     *   is trusted, returns x, otherwise, returns a new, trusted, already-resolved
     *   Promise whose resolution value is:
     *   * the resolution value of x if it's a foreign promise, or
     *   * x if it's a value
     */
    function coerce(x) {
        if (x instanceof TrustedPromise) {
            return x;
        }
        if (!(x === Object(x) && 'then' in x)) {
            return fulfilled(x);
        }
        return promise(function (resolve, reject, notify) {
            enqueue(function () {
                try {
                    // We must check and assimilate in the same tick, but not the
                    // current tick, careful only to access promiseOrValue.then once.
                    var untrustedThen = x.then;
                    if (typeof untrustedThen === 'function') {
                        fcall(untrustedThen, x, resolve, reject, notify);
                    }
                    else {
                        // It's a value, create a fulfilled wrapper
                        resolve(fulfilled(x));
                    }
                }
                catch (e) {
                    // Something went wrong, reject
                    reject(e);
                }
            });
        });
    }
    /**
     * Create an already-fulfilled promise for the supplied value
     * @private
     * @param {*} value
     * @return {Promise} fulfilled promise
     */
    function fulfilled(value) {
        var self = new TrustedPromise(function (onFulfilled) {
            try {
                return typeof onFulfilled == 'function' ? coerce(onFulfilled(value)) : self;
            }
            catch (e) {
                return rejected(e);
            }
        }, function () {
            return toFulfilledState(value);
        });
        return self;
    }
    /**
     * Create an already-rejected promise with the supplied rejection reason.
     * @private
     * @param {*} reason
     * @return {Promise} rejected promise
     */
    function rejected(reason) {
        var self = new TrustedPromise(function (_, onRejected) {
            try {
                return typeof onRejected == 'function' ? coerce(onRejected(reason)) : self;
            }
            catch (e) {
                return rejected(e);
            }
        }, function () {
            return toRejectedState(reason);
        });
        return self;
    }
    /**
     * Create a progress promise with the supplied update.
     * @private
     * @param {*} update
     * @return {Promise} progress promise
     */
    function progressing(update) {
        var self = new TrustedPromise(function (_, __, onProgress) {
            try {
                return typeof onProgress == 'function' ? progressing(onProgress(update)) : self;
            }
            catch (e) {
                return progressing(e);
            }
        });
        return self;
    }
    /**
     * Schedule a task that will process a list of handlers
     * in the next queue drain run.
     * @private
     * @param {Array} handlers queue of handlers to execute
     * @param {*} value passed as the only arg to each handler
     */
    function scheduleHandlers(handlers, value) {
        enqueue(function () {
            var handler, i = 0;
            while (handler = handlers[i++]) {
                handler(value);
            }
        });
    }
    /**
     * Determines if promiseOrValue is a promise or not
     *
     * @param {*} promiseOrValue anything
     * @returns {boolean} true if promiseOrValue is a {@link Promise}
     */
    function isPromise(promiseOrValue) {
        return promiseOrValue && typeof promiseOrValue.then === 'function';
    }
    iwhen.isPromise = isPromise;
    /**
     * Initiates a competitive race, returning a promise that will resolve when
     * howMany of the supplied promisesOrValues have resolved, or will reject when
     * it becomes impossible for howMany to resolve, for example, when
     * (promisesOrValues.length - howMany) + 1 input promises reject.
     *
     * @param {Array} promisesOrValues array of anything, may contain a mix
     *      of promises and values
     * @param howMany {number} number of promisesOrValues to resolve
     * @returns {Promise} promise that will resolve to an array of howMany values that
     *  resolved first, or will reject with an array of
     *  (promisesOrValues.length - howMany) + 1 rejection reasons.
     */
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
                // No items in the input, resolve immediately
                if (!toResolve) {
                    resolve(values);
                }
                else {
                    rejectOne = function (reason) {
                        reasons.push(reason);
                        if (!--toReject) {
                            fulfillOne = rejectOne = identity;
                            reject(reasons);
                        }
                    };
                    fulfillOne = function (val) {
                        // This orders the values based on promise resolution order
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
    /**
     * Initiates a competitive race, returning a promise that will resolve when
     * any one of the supplied promisesOrValues has resolved or will reject when
     * *all* promisesOrValues have rejected.
     *
     * @param {Array|Promise} promisesOrValues array of anything, may contain a mix
     *      of {@link Promise}s and values
     * @returns {Promise} promise that will resolve to the value that resolved first, or
     * will reject with an array of all rejected inputs.
     */
    function any(promisesOrValues) {
        function unwrapSingleResult(val) {
            return val[0];
        }
        return some(promisesOrValues, 1).then(function (value) { return unwrapSingleResult(value); });
    }
    iwhen.any = any;
    /**
     * Return a promise that will resolve only once all the supplied promisesOrValues
     * have resolved. The resolution value of the returned promise will be an array
     * containing the resolution values of each of the promisesOrValues.
     * @memberOf when
     *
     * @param {Array|Promise} promisesOrValues array of anything, may contain a mix
     *      of {@link Promise}s and values
     * @returns {Promise}
     */
    function all() {
        var promisesOrValues = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            promisesOrValues[_i - 0] = arguments[_i];
        }
        return _map(promisesOrValues, identity);
    }
    iwhen.all = all;
    /**
     * Joins multiple promises into a single returned promise.
     * @return {Promise} a promise that will fulfill when *all* the input promises
     * have fulfilled, or will reject when *any one* of the input promises rejects.
     */
    function join() {
        var promises = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            promises[_i - 0] = arguments[_i];
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
    /**
     * Internal map that allows a fallback to handle rejections
     * @param {Array|Promise} array array of anything, may contain promises and values
     * @param {function} mapFunc map function which may return a promise or value
     * @param {function?} fallback function to handle rejected promises
     * @returns {Promise} promise that will fulfill with an array of mapped values
     *  or reject if any input promise rejects.
     */
    function _map(array, mapFunc, fallback) {
        return when(array, function (array) {
            return promise(resolveMap);
            function resolveMap(resolve, reject, notify) {
                var results, len, toResolve, resolveOne, i;
                // Since we know the resulting length, we can preallocate the results
                // array to avoid array expansions.
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
                    }
                    else {
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
            // Wrap the supplied reduceFunc with one that handles promises and then
            // delegates to the supplied.
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
    // Snapshot states
    /**
     * Creates a fulfilled state snapshot
     * @private
     * @param {*} x any value
     * @returns {{state:'fulfilled',value:*}}
     */
    function toFulfilledState(x) {
        return { state: 'fulfilled', value: x };
    }
    /**
     * Creates a rejected state snapshot
     * @private
     * @param {*} x any reason
     * @returns {{state:'rejected',reason:*}}
     */
    function toRejectedState(x) {
        return { state: 'rejected', reason: x };
    }
    /**
     * Creates a pending state snapshot
     * @private
     * @returns {{state:'pending'}}
     */
    function toPendingState() {
        return { state: 'pending' };
    }
    //
    // Utilities, etc.
    //
    var undef;
    // Safe function calls
    var funcProto = Function.prototype;
    var call = funcProto.call;
    var fcall = funcProto.bind ? call.bind(call) : function (f, context) {
        return f.apply(context, slice.call(arguments, 2));
    };
    // Safe array ops
    var arrayProto = [];
    var slice = arrayProto.slice;
    // ES5 reduce implementation if native not available
    // See: http://es5.github.com/#x15.4.4.21 as there are many
    // specifics and edge cases.  ES5 dictates that reduce.length === 1
    // This implementation deviates from ES5 spec in the following ways:
    // 1. It does not check if reduceFunc is a Callable
    var reduceArray = arrayProto.reduce || function (reduceFunc /*, initialValue */) {
        /*jshint maxcomplexity: 7*/
        var arr, args, reduced, len, i;
        i = 0;
        arr = Object(this);
        len = arr.length >>> 0;
        args = arguments;
        // If no initialValue, use first item of array (we know length !== 0 here)
        // and adjust i to start at second item
        if (args.length <= 1) {
            for (;;) {
                if (i in arr) {
                    reduced = arr[i++];
                    break;
                }
                // If we reached the end of the array without finding any real
                // elements, it's a TypeError
                if (++i >= len) {
                    throw new TypeError();
                }
            }
        }
        else {
            // If initialValue provided, use it
            reduced = args[1];
        }
        for (; i < len; ++i) {
            if (i in arr) {
                reduced = reduceFunc(reduced, arr[i], i, arr);
            }
        }
        return reduced;
    };
    /**
     * Enqueue a task. If the queue is not currently scheduled to be
     * drained, schedule it.
     *
     * Note that this is the only effective change compared to the original when.js implementation.
     * We don't enqueue the task, we run it immediately.
     *
     * @param {function} task
     */
    function enqueue(task) {
        task();
    }
    function identity(x) {
        return x;
    }
})(iwhen || (iwhen = {}));
//# sourceMappingURL=iwhen.js.map