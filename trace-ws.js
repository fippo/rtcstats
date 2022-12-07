/* eslint-disable prefer-rest-params */
import { v4 as uuidv4 } from 'uuid';

import obfuscator from './obfuscator';

const PROTOCOL_ITERATION = '3.1';

/**
 *
 * @param {*} endpoint
 * @param {*} onCloseCallback
 * @param {*} pingInterval
 */
export default function({ endpoint, meetingFqn, onCloseCallback, useLegacy, obfuscate = true, pingInterval = 30000 }) {
    // Parent stats session id, used when breakout rooms occur to keep track of the initial stats session id.
    let parentStatsSessionId;
    let buffer = [];
    let statsSessionId = uuidv4();
    let connection;
    let keepAliveInterval;

    // We maintain support for legacy chrome rtcstats just in case we need some critical statistic
    // only obtainable from that format, ideally we'd remove this in the future.
    const protocolVersion = useLegacy ? `${PROTOCOL_ITERATION}_LEGACY` : `${PROTOCOL_ITERATION}_STANDARD`;

    const trace = function(msg) {
        if (connection && (connection.readyState === WebSocket.OPEN)) {
            connection.send(JSON.stringify(msg));
        } else if (connection && (connection.readyState >= WebSocket.CLOSING)) {
            // no-op
        } else if (buffer.length < 300) {
            // We need to cache the initial getStats calls as they are used by the delta compression algorithm and
            // without the data from the initial calls the server wouldn't know how to decompress.
            // Ideally we wouldn't reach this limit as the connect should fairly soon after the PC init, but just
            // in case add a limit to the buffer, so we don't transform this into a memory leek.
            buffer.push(msg);
        }
    };

    trace.isConnected = function() {
        const { readyState } = connection;

        return readyState === WebSocket.OPEN;
    };

    trace.isClosed = function() {
        const { readyState } = connection;

        return readyState === WebSocket.CLOSED;
    };

    trace.identity = function(...data) {
        data.push(new Date().getTime());

        if (parentStatsSessionId) {
            data[2].parentStatsSessionId = parentStatsSessionId;
        }

        const identityMsg = {
            statsSessionId,
            type: 'identity',
            data
        };

        trace(identityMsg);
    };

    trace.statsEntry = function(...data) {

        let myData = data;

        if (obfuscate) {
            switch (data[0]) {
            case 'addIceCandidate':
            case 'onicecandidate':
            case 'setLocalDescription':
            case 'setRemoteDescription':
                // These functions need to original values to work with
                // so we need a deep copy to do the obfuscation on.
                myData = JSON.parse(JSON.stringify(myData));
                break;
            default:
                break;
            }

            // Obfuscate the ips is required.
            obfuscator(myData);
        }

        myData.push(new Date().getTime());

        const statsEntryMsg = {
            statsSessionId,
            type: 'stats-entry',
            data: JSON.stringify(myData)
        };

        trace(statsEntryMsg);
    };

    trace.keepAlive = function() {

        const keepaliveMsg = {
            statsSessionId,
            type: 'keepalive'
        };

        trace(keepaliveMsg);
    };

    trace.close = function() {
        connection && connection.close();
    };

    trace.connect = function(isBreakoutRoom) {
    // Because the connect function can be deferred now, we don't want to clear the buffer on connect so that
    // we don't lose queued up operations.
    // buffer = [];
        if (isBreakoutRoom && !parentStatsSessionId) {
            parentStatsSessionId = statsSessionId;
        }
        if (parentStatsSessionId) {
            statsSessionId = uuidv4();
            buffer.forEach(entry => {
                entry.statsSessionId = statsSessionId;
            });
        }
        if (connection) {
            connection.close();
        }

        connection = new WebSocket(
            `${endpoint}/${meetingFqn}`,
            protocolVersion,
            { headers: { 'User-Agent': navigator.userAgent } }
        );


        connection.onclose = function(closeEvent) {
            keepAliveInterval && clearInterval(keepAliveInterval);

            // reconnect?
            onCloseCallback({ code: closeEvent.code,
                reason: closeEvent.reason });
        };

        connection.onopen = function() {
            keepAliveInterval = setInterval(trace.keepAlive, pingInterval);
            buffer = buffer.map(entry => JSON.stringify(entry));

            while (buffer.length) {
                // Buffer contains serialized msg's so no need to stringify
                connection.send(buffer.shift());
            }
        };

    /*
    connection.onmessage = function(msg) {
      // no messages from the server defined yet.
    };
    */
    };

    return trace;
}
