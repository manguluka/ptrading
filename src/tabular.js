// tabular.js
/*
 *  Copyright (c) 2016-2017 James Leigh, Some Rights Reserved
 *
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are met:
 *
 *  1. Redistributions of source code must retain the above copyright notice,
 *  this list of conditions and the following disclaimer.
 *
 *  2. Redistributions in binary form must reproduce the above copyright
 *  notice, this list of conditions and the following disclaimer in the
 *  documentation and/or other materials provided with the distribution.
 *
 *  3. Neither the name of the copyright holder nor the names of its
 *  contributors may be used to endorse or promote products derived from this
 *  software without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 *  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 *  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 *  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 *  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 *  CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 *  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 *  INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 *  CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const process = require('process');
const _ = require('underscore');
const spawn = require('child_process').spawn;
const Writable = require('stream').Writable;
const csv = require('fast-csv');
const logger = require('./logger.js');
const config = require('./config.js');

module.exports = function(data) {
    var filename = getOutputFile();
    return new Promise(finished => {
        var output = createWriteStream(filename);
        output.on('finish', finished);
        var transpose = config('transpose') && config('transpose').toString() != 'false';
        var reverse = config('reverse') && config('reverse').toString() != 'false';
        if (transpose) {
            var writer = csv.createWriteStream({
                headers: false,
                rowDelimiter: '\r\n',
                includeEndRowDelimiter: true
            });
            writer.pipe(output);
            if (_.isArray(data)) {
                var keys = data.reduce((keys, datum) => _.union(keys, _.keys(datum)), []);
                var rows = keys.map(key => {
                    var values = _.pluck(data, key);
                    if (reverse) values.reverse();
                    return [key].concat(values);
                });
                rows.forEach(row => writer.write(row));
            } else {
                _.pairs(data).forEach(datum => writer.write(datum));
            }
            writer.end();
        } else {
            var writer = csv.createWriteStream({
                headers: _.union(_.keys(_.first(data)), _.keys(_.last(data))),
                rowDelimiter: '\r\n',
                includeEndRowDelimiter: true
            });
            writer.pipe(output);
            if (_.isArray(data) && reverse) data.reduceRight((m,datum) => writer.write(datum), 0);
            else if (_.isArray(data)) data.forEach(datum => writer.write(datum));
            else writer.write(data);
            writer.end();
        }
    }).then(() => {
        return launchOutput(filename);
    });
};

function getOutputFile() {
    var output = config('output');
    if (output) return output;
    else if (!config('launch')) return null;
    var name = process.title.replace(/\W/g,'') + process.pid + Date.now().toString(16) + '.csv';
    return path.resolve(os.tmpdir(), name);
}

function createWriteStream(outputFile) {
    if (outputFile) return fs.createWriteStream(outputFile);
    var delegate = process.stdout;
    var output = Object.create(Writable.prototype);
    output.cork = delegate.cork.bind(delegate);
    output.end = function(chunk) {
        if (chunk) delegate.write.apply(delegate, arguments);
        delegate.uncork();
        output.emit('finish');
    };
    output.setDefaultEncoding = encoding => delegate.setDefaultEncoding(encoding);
    output.uncork = delegate.uncork.bind(delegate);
    output.write = delegate.write.bind(delegate);
    return output;
}

function launchOutput(outputFile) {
    var launch = config('launch');
    if (!launch) return outputFile;
    var command = (_.isArray(launch) ? launch : launch.split(' ')).concat(outputFile);
    return new Promise((ready, exit) => {
        logger.debug("launching", command);
        var p = spawn(_.first(command), _.rest(command), {
            detached: true,
            stdio: 'inherit'
        }).on('error', exit).on('exit', code => {
            if (code) exit(Error("Process exitted with code " + code));
            else ready();
        }).unref();
        _.delay(ready, 500); // give child process a chance to error
    }).then(_.constant(outputFile));
}
