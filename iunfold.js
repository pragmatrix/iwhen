var iwhen;
(function (iwhen) {
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
//@ sourceMappingURL=iunfold.js.map
