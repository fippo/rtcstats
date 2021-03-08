/* eslint-disable prefer-rest-params */
import uuid from 'uuid';

const PROTOCOL_ITERATION = '3.1';

/**
 *
 * @param {*} endpoint
 * @param {*} onCloseCallback
 * @param {*} pingInterval
 */
export default function({ endpoint, onCloseCallback, useLegacy, pingInterval = 30000 }) {
    const buffer = [];
    const statsSessionId = uuid.v4();
    let connection;
    let keepAliveInterval;

    // We maintain support for legacy chrome rtcstats just in case we need some critical statistic
    // only obtainable from that format, ideally we'd remove this in the future.
    const protocolVersion = useLegacy ? `${PROTOCOL_ITERATION}_LEGACY` : `${PROTOCOL_ITERATION}_STANDARD`;

    const trace = function(msg) {
        const serializedMsg = JSON.stringify(msg);

        if (connection && (connection.readyState === WebSocket.OPEN)) {
            connection.send(serializedMsg);
        } else if (connection && (connection.readyState >= WebSocket.CLOSING)) {
            // no-op
        } else if (buffer.length < 300) {
            // We need to cache the initial getStats calls as they are used by the delta compression algorithm and
            // without the data from the initial calls the server wouldn't know how to decompress.
            // Ideally we wouldn't reach this limit as the connect should fairly soon after the PC init, but just
            // in case add a limit to the buffer, so we don't transform this into a memory leek.
            buffer.push(serializedMsg);
        }
    };

    trace.identity = function(...data) {

        data.push(new Date().getTime());

        const identityMsg = {
            statsSessionId,
            type: 'identity',
            data
        };

        trace(identityMsg);
    };

    trace.statsEntry = function(...data) {

        data.push(new Date().getTime());

        const statsEntryMsg = {
            statsSessionId,
            type: 'stats-entry',
            data: JSON.stringify(data)
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
    trace.connect = function() {
    // Because the connect function can be deferred now, we don't want to clear the buffer on connect so that
    // we don't lose queued up operations.
    // buffer = [];
        if (connection) {
            connection.close();
        }
        connection = new WebSocket(endpoint + window.location.pathname, protocolVersion);

        connection.onclose = function(closeEvent) {
            keepAliveInterval && clearInterval(keepAliveInterval);

            // reconnect?
            onCloseCallback({ code: closeEvent.code,
                reason: closeEvent.reason });
        };

        connection.onopen = function() {
            keepAliveInterval = setInterval(trace.keepAlive, pingInterval);

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
