// promise-text.js
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

const http = require('http');
const logger = require('./logger.js');

module.exports = function(url) {
    return new Promise(function(resolve, reject) {
        logger.debug(url);
        http.get(url, res => {
            var buffer = [];
            res.setEncoding('utf8');
            res.on('data', data => {
                buffer.push(data);
            }).on('end', () => {
                var code = res.statusCode;
                var body = buffer.join('');
                if (code == 404 || code == 410) {
                    resolve();
                } else if (code != 200 && code != 203) {
                    logger.warn(res.statusMessage, code, url);
                    reject(Error(titleOf(body, res.statusMessage)));
                } else {
                    resolve(body);
                }
            });
        }).on('error', reject);
    });
}

function titleOf(html, status) {
    var lower = html.toLowerCase();
    var start = lower.indexOf('<title');
    var end = lower.indexOf('</title>');
    if (start < 0 || end < 0) return status;
    var text = html.substring(html.indexOf('>', start) + 1, end);
    var decoded = text.replace('&lt;','<').replace('&gt;', '>').replace('&amp;', '&');
    if (decoded.indexOf(status) >= 0) return decoded;
    else return decoded + ' ' + status;
}
