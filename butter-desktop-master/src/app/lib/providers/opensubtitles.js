(function (App) {
    'use strict';
    var OS = require('opensubtitles-api');

    var OpenSubtitles = function () {};
    OpenSubtitles.prototype.constructor = OpenSubtitles;

    var normalizeLangCodes = function (data) {
        if ('pb' in data) {
            data['pt-br'] = data['pb'];
            delete data['pb'];
        }
        return data;
    };

    var formatForButter = function (data) {
        data = normalizeLangCodes(data);
        for (var lang in data) {
            data[lang] = data[lang].url;
        }
        return Common.sanitize(data);
    };

    OpenSubtitles.prototype.fetch = function (queryParams) {
        var openSRT = new OS('Butter Time v' + (Settings.version || 1), Settings.opensubtitlesUsername, Settings.opensubtitlesPassword);
        return openSRT.search(queryParams)
            .then(formatForButter);
    };

    OpenSubtitles.prototype.upload = function (queryParams) {
        var openSRT = new OS('Butter v' + (Settings.version || 1), Settings.opensubtitlesUsername, Settings.opensubtitlesPassword);
        return openSRT.upload(queryParams);
    };

    App.Providers.OpenSubtitles = OpenSubtitles;

})(window.App);
