/// <reference path="iwhen.ts"/>

/** @license MIT License (c) copyright 2011-2013 original author or authors */

/**
 * delay.js
 *
 * Helper that returns a promise that resolves after a delay.
 *
 * @author Brian Cavalier
	 * @author John Hann
	 */

	module iwhen
	{
		/*global vertx,setTimeout*/
		var setTimer;

		setTimer = typeof window['vertx'] === 'object'
			? function (f, ms) { return window['vertx'].setTimer(ms, f); }
			: setTimeout;

		/**
		 * Creates a new promise that will resolve after a msec delay.  If promise
		 * is supplied, the delay will start *after* the supplied promise is resolved.
		 *
		 * @param {number} msec delay in milliseconds
		 * @param {*} [value] any promise or value after which the delay will start
		 * @returns {Promise}
	 */
	export function delay(msec : number, value?) {
		return promise((resolve, reject?, notify?) => {
			when(value, val => {
					setTimer(() => {
						resolve(val);
					}, msec);
				},
				reject, notify);
		});
	}
}
