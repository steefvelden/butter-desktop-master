(function (App) {
    'use strict';

    var captions = require('node-captions');

    var self;

    var findSrt = function (input) {
        var files = fs.readdirSync(input);
        for (var f in files) {
            var stats = fs.lstatSync(path.join(input, files[f]));
            if (path.extname(files[f]) === '.srt' && stats.isFile()) {
                return path.join(input, files[f]);
            }
            if (stats.isDirectory()) {
                var found = findSrt(path.join(input, files[f]));
                if (found) {
                    return found;
                }
            }
        }
    };

    var downloadZip = function (data) {
        return Q.Promise(function (resolve, reject) {
            var filePath = data.path;
            var subUrl = data.url;

            var fileFolder = path.dirname(filePath);
            var fileExt = path.extname(filePath);
            var newName = filePath.substring(0, filePath.lastIndexOf(fileExt)) + '.srt';

            var zipPath = filePath.substring(0, filePath.lastIndexOf(fileExt)) + '.zip';

            var unzipPath = filePath.substring(0, filePath.lastIndexOf(fileExt));
            unzipPath = unzipPath.substring(0, unzipPath.lastIndexOf(path.sep));

            var out = fs.createWriteStream(zipPath);

            var req = request({
                method: 'GET',
                uri: subUrl
            });

            req.on('error', function (e) {
                win.error('Error downloading subtitle: ' + e);
                reject(e);
            });
            req.on('end', function () {
                out.end(function () {
                    try {
                        var zip = new AdmZip(zipPath),
                            zipEntries = zip.getEntries();
                        zip.extractAllTo( /*target path*/ unzipPath, /*overwrite*/ true);
                        fs.unlink(zipPath, function (err) {});
                        win.debug('Subtitles extracted to : ' + newName);
                        var found = findSrt(unzipPath);
                        if (found) {
                            fs.renameSync(found, newName);
                            resolve(newName);
                        } else {
                            throw 'no SRT file in the downloaded archive';
                        }
                    } catch (e) {
                        win.error('Error downloading subtitle: ' + e);
                        reject(e);
                    }
                });
            });
            req.pipe(out);
        });
    };

    var downloadSRT = function (data, callback) {
        return Q.Promise(function (resolve, reject) {
            var filePath = data.path;
            var subUrl = data.url;
            var fileExt = path.extname(filePath);
            var srtPath = filePath.substring(0, filePath.lastIndexOf(fileExt)) + '.srt';
            var out = fs.createWriteStream(srtPath);
            var req = request({
                method: 'GET',
                uri: subUrl
            });

            req.on('end', function () {
                out.end(function () {
                    win.debug('Subtitles downloaded to : ' + srtPath);
                    resolve(srtPath);
                });
            });
            req.pipe(out);
        });

    };
    var Subtitles = Backbone.Model.extend({
        defaults: {
            id: 'generic',
            name: 'Generic'
        },
        initialize: function () {
            App.vent.on('subtitle:download', this.download);
            App.vent.on('subtitle:convert', this.convert);
            self = this;
        },
        download: function (data) {
            if (data.path && data.url) {
                win.debug('Subtitles download url:', data.url);
                var fileFolder = path.dirname(data.path);

                // Fix cases of OpenSubtitles appending data after file extension.
                var subExt = data.url.split('.').pop();
                if (subExt.indexOf('/') > -1) {
                    subExt = subExt.split('/')[0];
                }

                try {
                    mkdirp.sync(fileFolder);
                } catch (e) {
                    // Ignore EEXIST
                }
                if (subExt === 'zip') {

                    downloadZip(data)
                        .then(function (location) {
                            App.vent.trigger('subtitle:downloaded', location);
                        })
                        .catch(function (error) {
                            App.vent.trigger('subtitle:downloaded', null);
                        });

                } else if (subExt === 'srt') {

                    downloadSRT(data)
                        .then(function (location) {
                            App.vent.trigger('subtitle:downloaded', location);
                        })
                        .catch(function (error) {
                            App.vent.trigger('subtitle:downloaded', null);
                        });
                } else {
                    win.error('Subtitle Error, unknown file format: ' + data.url);
                    App.vent.trigger('notification:show', new App.Model.Notification({
                        title: i18n.__('Unknown subtitle format'),
                        body: i18n.__('Try another subtitle or drop one in the player'),
                        showRestart: false,
                        type: 'error',
                        autoclose: true
                    }));
                    App.vent.trigger('subtitle:downloaded', null);
                }
            } else {
                if (Settings.subtitle_language !== 'none') {
                    win.info('No subtitles downloaded. None picked or language not available');
                    App.vent.trigger('notification:show', new App.Model.Notification({
                        title: i18n.__('No subtitles found'),
                        body: i18n.__('Try again later or drop a subtitle in the player'),
                        showRestart: false,
                        type: 'warning',
                        autoclose: true
                    }));
                }
                App.vent.trigger('subtitle:downloaded', null);
            }
        },
        convert: function (data, cb) { // Converts .srt's to .vtt's
            try {
                var srtPath = data.path;
                var vttPath = srtPath.replace('.srt', '.vtt');
                var srtData = fs.readFileSync(srtPath);
                self.decode(srtData, data.language, function (srtDecodedData) {
                    captions.srt.parse(srtDecodedData, function (err, vttData) {
                        if (err) {
                            return cb(err, null);
                        }
                        // Overwrite srt with UTF-8 encoding
                        fs.writeFile(srtPath, srtDecodedData, 'utf8');
                        // Save vtt as UTF-8 encoded, so that foreign subs will be shown correctly on ext. devices.
                        fs.writeFile(vttPath, captions.vtt.generate(captions.srt.toJSON(vttData)), 'utf8', function (err) {
                            if (err) {
                                return cb(err, null);
                            } else {
                                cb(null, {
                                    vtt: vttPath,
                                    srt: srtPath,
                                    encoding: 'utf8'
                                });
                            }
                        });
                    });
                });
            } catch (e) {
                cb(e, null);
            }
        },
        // Handles charset encoding
        decode: function (dataBuff, language, callback) {
            var targetEncodingCharset = 'utf8';

            var charset = charsetDetect.detect(dataBuff);
            var detectedEncoding = charset.encoding;
            win.debug('SUB charset detected: ', detectedEncoding);
            // Do we need decoding?
            if (detectedEncoding.toLowerCase().replace('-', '') === targetEncodingCharset) {
                callback(dataBuff.toString('utf8'));
                // We do
            } else {
                var langInfo = App.Localization.langcodes[language] || {};
                win.debug('SUB charset expected for \'%s\': ', language, langInfo.encoding);
                if (langInfo.encoding !== undefined && langInfo.encoding.indexOf(detectedEncoding) < 0) {
                    // The detected encoding was unexepected to the language, so we'll use the most common
                    // encoding for that language instead.
                    detectedEncoding = langInfo.encoding[0];
                }
                win.debug('SUB charset used: ', detectedEncoding);
                dataBuff = iconv.encode(iconv.decode(dataBuff, detectedEncoding), targetEncodingCharset);
                callback(dataBuff.toString('utf8'));
            }
        }

    });

    App.Subtitles = {
        Generic: new Subtitles()
    };
})(window.App);
