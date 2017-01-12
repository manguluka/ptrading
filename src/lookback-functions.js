// lookback-functions.js
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

const _ = require('underscore');
const moment = require('moment-timezone');
const periods = require('./periods.js');
const like = require('./like.js');
const expect = require('chai').use(like).expect;

module.exports = {
    /* Offset value N periods ago */
    OFFSET(opts, n_periods, calc) {
        var n = asPositiveInteger(n_periods, "OFFSET");
        return _.extend(bars => {
            return calc(bars.slice(0, bars.length - n));
        }, {
            warmUpLength: n + calc.warmUpLength
        });
    },
    /* Highest historic Maximum */
    HIGHEST(opts, n_periods, calc) {
        var n = asPositiveInteger(n_periods, "HIGHEST");
        return _.extend(bars => {
            var maximum = _.max(getValues(n, calc, bars));
            if (_.isFinite(maximum)) return maximum;
            else return undefined;
        }, {
            warmUpLength: n + calc.warmUpLength - 1
        });
    },
    /* Lowest historic Minimum */
    LOWEST(opts, num, calc) {
        var n = asPositiveInteger(num, "LOWEST");
        return _.extend(bars => {
            var minimum = _.min(getValues(n, calc, bars));
            if (_.isFinite(minimum)) return minimum;
            else return undefined;
        }, {
            warmUpLength: n + calc.warmUpLength - 1
        });
    },
    /* Age Of High */
    AOH(opts, num, high) {
        var n = asPositiveInteger(num, "AOH");
        return _.extend(bars => {
            var highs = getValues(n, high, bars);
            var highest = _.max(highs);
            return bars.length - highs.indexOf(highest) -1;
        }, {
            warmUpLength: n -1
        });
    },
    /* Simple Moveing Average */
    SMA(opts, num, calc) {
        var n = asPositiveInteger(num, "SMA");
        return _.extend(bars => {
            var values = getValues(n, calc, bars);
            return sum(values) / values.length;
        }, {
            warmUpLength: n + calc.warmUpLength -1
        });
    },
    /* Exponential Moveing Average */
    EMA(opts, num, calc) {
        var n = asPositiveInteger(num, "EMA");
        return _.extend(bars => {
            var values = getValues(n * 10, calc, bars);
            var a = 2 / (n + 1);
            var firstN = values.slice(0, n);
            var sma = _.reduce(firstN, function(memo, value, index){
                return memo + value;
            }, 0) / firstN.length;
            return _.reduce(values.slice(n), function(memo, value, index){
                return a * value + (1 - a) * memo;
            }, sma);
        }, {
            warmUpLength: n * 10 + calc.warmUpLength - 1
        });
    },
    PF(opts, num, calc) {
        var n = asPositiveInteger(num, "PF");
        return _.extend(bars => {
            var prices = getValues(n+1, calc, bars);
            var changes = prices.map((price, i, prices) => {
                if (i === 0) return 0;
                var prior = prices[i-1];
                return price - prior;
            });
            var profit = 0;
            var loss = 0;
            changes.forEach(change => {
                if (change > 0) {
                    profit += change;
                } else {
                    loss += change;
                }
            });
            return profit / -loss;
        }, {
            warmUpLength: n + calc.warmUpLength
        });
    },
    SLOPE(opts, num, calc) {
        var n = asPositiveInteger(num, "SLOPE");
        return _.extend(bars => {
            var values = getValues(n, calc, bars);
            var sx = values.reduce(function(sum, value, i){
                return sum + value;
            }, 0);
            var sy = values.reduce(function(sum, value, i){
                return sum + i;
            }, 0);
            var sxx = values.reduce(function(sum, value, i){
                return sum + value * value;
            }, 0);
            var sxy = values.reduce(function(sum, value, i){
                return sum + value * i;
            }, 0);
            return (sxy*values.length - sx*sy) / (sxx*values.length - sx*sx);
        }, {
            warmUpLength: n * 10 + calc.warmUpLength - 1
        });
    },
    /* Standard Deviation */
    STDEV(opts, num, calc) {
        var n = asPositiveInteger(num, "STDEV");
        return _.extend(bars => {
            var prices = getValues(n, calc, bars);
            var avg = sum(prices) / prices.length;
            var sd = Math.sqrt(sum(prices.map(function(num){
                var diff = num - avg;
                return diff * diff;
            })) / Math.max(prices.length,1));
            return sd || 1;
        }, {
            warmUpLength: n - 1 + calc.warmUpLength
        });
    },
    /* Relative Strength Index */
    RSI(opts, num, calc) {
        var n = asPositiveInteger(num, "RSI");
        return _.extend(bars => {
            var values = getValues(n +250, calc, bars);
            var gains = values.map(function(value, i, values){
                var change = value - values[i-1];
                if (change > 0) return change;
                return 0;
            }).slice(1);
            var losses = values.map(function(value, i, values){
                var change = value - values[i-1];
                if (change < 0) return change;
                return 0;
            }).slice(1);
            var firstGains = gains.slice(0, n);
            var firstLosses = losses.slice(0, n);
            var gain = gains.slice(n).reduce(function(smoothed, gain){
                return (smoothed * (n-1) + gain) / n;
            }, sum(firstGains) / firstGains.length);
            var loss = losses.slice(n).reduce(function(smoothed, loss){
                return (smoothed * (n-1) + loss) / n;
            }, sum(firstLosses) / firstLosses.length);
            if (loss === 0) return 100;
            return 100 - (100 / (1 - (gain / loss)));
        }, {
            warmUpLength: n +250 + calc.warmUpLength
        });
    },
    /* Prior value N days ago */
    PRIOR(opts, days, field) {
        var d = asPositiveInteger(days, "PRIOR");
        var dayLength = getDayLength(opts);
        var interval = opts.interval;
        var n = Math.ceil((d + 1) * dayLength * 2); // extra for after hours activity
        return _.extend(bars => {
            var day = periods(_.defaults({interval:'day'}, opts));
            var ending = day.dec(_.last(bars)[interval].ending, d);
            if (!ending.isValid()) throw Error("Invalid date: " + _.last(bars)[interval].ending);
            var closes = ending.format('YYYY-MM-DD') + 'T' + opts.marketClosesAt;
            var prior = moment.tz(closes, opts.tz).format();
            var end = _.sortedIndex(bars, {
                [interval]: {
                    ending: prior
                }
            }, bar => bar[interval].ending);
            if (bars[end] && bars[end][interval].ending == prior) end++;
            var start = Math.max(end - field.warmUpLength -1, 0);
            return field(bars.slice(start, end));
        }, {
            fields: ['ending'],
            warmUpLength: n + field.warmUpLength
        });
    },
    /* Since N days ago */
    SINCE(opts, days, calc) {
        var d = asPositiveInteger(days, "SINCE");
        var dayLength = getDayLength(opts);
        var interval = opts.interval;
        var n = Math.ceil((d + 1) * dayLength * 2); // extra for after hours activity
        return _.extend(bars => {
            if (_.isEmpty(bars)) return calc(bars);
            var ending = moment(_.last(bars)[interval].ending).tz(opts.tz);
            var day = periods(_.defaults({interval:'day'}, opts));
            var since = day.dec(ending, d-1).format();
            var start = _.sortedIndex(bars, {
                [interval]: {
                    ending: since
               }
            }, bar => bar[interval].ending);
            if (bars[start] && bars[start][interval].ending == since) start++;
            if (start >= bars.length) return calc([]);
            var end = Math.min(start + calc.warmUpLength +1, bars.length);
            return calc(bars.slice(start, end));
        }, {
            fields: ['ending'],
            warmUpLength: n + calc.warmUpLength - 1
        });
    },
    /* Past N days */
    PAST(opts, days, calc) {
        var d = asPositiveInteger(days, "PAST");
        var dayLength = getDayLength(opts);
        var interval = opts.interval;
        var n = Math.ceil((d + 1) * dayLength * 2); // extra for after hours activity
        return _.extend(bars => {
            if (_.isEmpty(bars)) return calc(bars);
            var ending = moment(_.last(bars)[interval].ending).tz(opts.tz);
            var day = periods(_.defaults({interval:'day'}, opts));
            var diff = ending.diff(day.dec(ending, d), 'days');
            var days = ending.isoWeekday() == 7 ? diff + 1 : diff;
            var since = ending.subtract(days, 'days').format();
            var start = _.sortedIndex(bars, {
                [interval]: {
                    ending: since
               }
            }, bar => bar[interval].ending);
            if (bars[start] && bars[start][interval].ending == since) start++;
            if (start >= bars.length) return calc([]);
            var end = Math.min(start + calc.warmUpLength +1, bars.length);
            return calc(bars.slice(start, end));
        }, {
            fields: ['ending'],
            warmUpLength: n + calc.warmUpLength - 1
        });
    },
    /* Normal Market Hour Session */
    SESSION(opts, calc) {
        var dayLength = getDayLength(opts);
        var interval = opts.interval;
        var n = Math.ceil(dayLength * 2); // extra for after hours activity
        return _.extend(bars => {
            if (_.isEmpty(bars))
                return calc(bars);
            var start = "2000-01-01T".length;
            var first = moment(_.first(bars)[interval].ending).tz(opts.tz);
            var last = moment(_.last(bars)[interval].ending).tz(opts.tz);
            var opens = moment.tz(first.format('YYYY-MM-DD') + 'T' + opts.marketOpensAt, opts.tz);
            var closes = moment.tz(last.format('YYYY-MM-DD') + 'T' + opts.marketClosesAt, opts.tz);
            var ohms = opens.hour() *60 *60 + opens.minute() *60 + opens.seconds();
            var chms = closes.hour() *60 *60 + closes.minute() *60 + closes.seconds();
            if (ohms == chms)
                return calc(bars); // 24 hour market
            if (opens.isDST() == closes.isDST() && closes.diff(opens, 'months') < 2) {
                // Use string comparison for faster filter
                var after = opens.format().substring(start);
                var before = closes.format().substring(start);
                return calc(bars.filter(after < before ? function(bar) {
                    var time = bar[interval].ending.substring(start);
                    return after < time && time <= before;
                } : function(bar) {
                    var time = bar[interval].ending.substring(start);
                    return after < time || time <= before;
                }));
            } else {
                return calc(bars.filter(function(bar){
                    var ending = moment(bar[interval].ending).tz(opts.tz);
                    var hms = ending.hour() *60 *60 + ending.minute() *60 + ending.seconds();
                    return ohms < hms && hms <= chms;
                }));
            }
        }, {
            fields: ['ending'],
            warmUpLength: n + calc.warmUpLength - 1
        });
    },
    /* use only this Time Of Day */
    TOD(opts, calc) {
        var dayLength = getDayLength(opts);
        var interval = opts.interval;
        return _.extend(bars => {
            if (_.isEmpty(bars))
                return calc(bars);
            var start = "2000-01-01T".length;
            var first = moment(_.first(bars)[interval].ending).tz(opts.tz);
            var last = moment(_.last(bars)[interval].ending).tz(opts.tz);
            if (first.isDST() == last.isDST() && last.diff(first, 'months') < 2) {
                // Use string comparison for faster filter
                var time = last.format().substring(start);
                return calc(bars.filter(function(bar){
                    return bar[interval].ending.substring(start) == time;
                }));
            } else {
                var hms = last.hour() *60 *60 + last.minute() *60 + last.seconds();
                return calc(bars.filter(function(bar){
                    var ending = moment(bar[interval].ending).tz(opts.tz);
                    var ahms = ending.hour() *60 *60 + ending.minute() *60 + ending.seconds();
                    return ahms == hms;
                }));
            }
        }, {
            fields: ['ending'],
            warmUpLength: (calc.warmUpLength +1) * dayLength *2 // extra for after hours activity
        });
    },
    /* Entry point */
    OPENING(opts, calc) {
        return _.extend(points => {
            return calc(points.slice(0, 1));
        }, {
            fields: calc.fields,
            warmUpLength: Infinity
        });
    }
};

function asPositiveInteger(calc, msg) {
    try {
        var n = calc();
        if (n > 0 && _.isFinite(n) && Math.round(n) == n) return n;
    } catch (e) {}
    throw Error("Expected a literal positive interger in " + msg + " not " + n);
}

function getDayLength(opts) {
    expect(opts).to.be.like({
        interval: _.isString,
        premarketOpensAt: /^\d\d:\d\d(:00)?$/,
        afterHoursClosesAt: /^\d\d:\d\d(:00)?$/,
        tz: /^\S+\/\S+$/
    });
    var opens = moment.tz('2010-03-01T' + opts.premarketOpensAt, opts.tz);
    var closes = moment.tz('2010-03-01T' + opts.afterHoursClosesAt, opts.tz);
    if (!opens.isValid())
        throw Error("Invalid premarketOpensAt: " + opts.premarketOpensAt);
    if (!closes.isValid())
        throw Error("Invalid afterHoursClosesAt: " + opts.afterHoursClosesAt);
    return periods(opts).diff(closes, opens);
}

function getValues(size, calc, bars) {
    if (!bars) return [];
    var n = calc.warmUpLength +1;
    var m = Math.min(size, bars.length);
    return _.range(bars.length - m, bars.length).map(i => {
        return calc(bars.slice(Math.max(i - n + 1, 0), i + 1));
    });
}

function sum(values) {
    return _.reduce(values, function(memo, value){
        return memo + (value || 0);
    }, 0);
}