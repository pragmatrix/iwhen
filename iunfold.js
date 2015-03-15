/// <reference path="iwhen.ts"/>
/** @license MIT License (c) copyright B Cavalier & J Hann */
/**
 * unfold
 * @author: brian@hovercraftstudios.com
 */
var iwhen;
(function (iwhen) {
    /**
     * Anamorphic unfold/map that generates values by applying
     * handler(generator(seed)) iteratively until condition(seed)
     * returns true.
     * @param {function} unspool function that generates a [value, newSeed]
     *  given a seed.
     * @param {function} condition function that, given the current seed, returns
     *  truthy when the unfold should stop
     * @param {function} handler function to handle the value produced by generator
     * @param seed {*|Promise} any value or promise
     * @return {Promise} the result of the unfold
     */
    function unfold(unspool, condition, handler, seed) {
        return iwhen.when(seed, function (seed) {
            return iwhen.when(condition(seed), function (done) {
                return done ? seed : iwhen.resolve(unspool(seed)).spread(next);
            });
            function next(item, newSeed) {
                return iwhen.when(handler(item), function () {
                    return unfold(unspool, condition, handler, newSeed);
                });
            }
        });
    }
    iwhen.unfold = unfold;
})(iwhen || (iwhen = {}));
//# sourceMappingURL=iunfold.js.map