var iwhen;
(function (iwhen) {
    var setTimer;
    setTimer = typeof window['vertx'] === 'object' ? function (f, ms) {
        return window['vertx'].setTimer(ms, f);
    } : setTimeout;
    function delay(msec, value) {
        return iwhen.promise(function (resolve, reject, notify) {
            iwhen.when(value, function (val) {
                setTimer(function () {
                    resolve(val);
                }, msec);
            }, reject, notify);
        });
    }
    iwhen.delay = delay;
})(iwhen || (iwhen = {}));
//@ sourceMappingURL=idelay.js.map
