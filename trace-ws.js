/* eslint-disable prefer-rest-params */
import { v4 as uuidv4 } from 'uuid';

import {
    PROTOCOL_ITERATION,
    MAX_RECONNECT_TIME,
    messageTypes,
    CONFERENCE_LEAVE_CODE,
    BUFFER_LIMIT,
    CUSTOM_ERROR_CODES,
    DUMP_ERROR_CODE
} from './constants';
import obfuscator from './obfuscator';

/**
 * Function that returns the timeout time for the reconnect based on number of attempts.
 *
 * @param {*} reconnectAttempts
 * @returns
 */
function getTimeout(reconnectAttempts) {
    return ((2 ** reconnectAttempts) * 1000) + Math.floor(Math.random() * 10000);
}

/**
 *
 * @param {*} endpoint
 * @param {*} onCloseCallback
 * @param {*} pingInterval
 */
export default function({ endpoint, meetingFqn, onCloseCallback, useLegacy, obfuscate = true, pingInterval = 30000 }) {
    // Parent stats session id, used when breakout rooms occur to keep track of the initial stats session id.
    let parentStatsSessionId;

    // Buffer for storing stats if there is no connection to the server.
    let buffer = [];
    let statsSessionId = uuidv4();
    let connection;
    let keepAliveInterval;

    // the number of ms spent trying to reconnect to the server.
    let reconnectSpentTime = 0;

    // flag indicating if data can be sent to the server.
    let canSendMessage = false;

    // The sequence number of the last stat.
    let sequenceNumber = 1;

    // Timeout time for the reconnect protocol.
    let reconnectTimeout;

    // We maintain support for legacy chrome rtcstats just in case we need some critical statistic
    // only obtainable from that format, ideally we'd remove this in the future.
    const protocolVersion = useLegacy ? `${PROTOCOL_ITERATION}_LEGACY` : `${PROTOCOL_ITERATION}_STANDARD`;

    // Function setting the timestamp and the sequence number of the entry.
    const setTransportParams = data => {
        data.push(new Date().getTime());
        data.push(sequenceNumber++);
    };

    // Function sending the message to the server if there is a connection.
    const sendMessage = msg => {
        // It creates a copy of the message so that the message from the buffer have the data attribute unstringified
        const copyMsg = Object.assign({}, msg);

        if (copyMsg.type !== 'identity' && copyMsg.data) {
            copyMsg.data = JSON.stringify(copyMsg.data);
        }
        if (connection && (connection.readyState === WebSocket.OPEN) && canSendMessage) {
            connection.send(JSON.stringify(copyMsg));
        }
    };

    const trace = function(msg) {
        sendMessage(msg);
        if (buffer.length < BUFFER_LIMIT && msg.data) {
            buffer.push(msg);
        }
    };

    trace.isConnected = function() {
        if (!connection) {
            return false;
        }
        const { readyState } = connection;

        return readyState === WebSocket.OPEN;
    };

    trace.isClosed = function() {
        if (!connection) {
            return true;
        }

        const { readyState } = connection;

        return readyState === WebSocket.CLOSED;
    };

    trace.identity = function(...data) {
        setTransportParams(data);

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
        setTransportParams(myData);

        const statsEntryMsg = {
            statsSessionId,
            type: 'stats-entry',
            data: myData
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
        connection && connection.close(CONFERENCE_LEAVE_CODE);
    };

    trace.connect = function(isBreakoutRoom, isReconnect = false) {
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
            `${endpoint}/${meetingFqn}?statsSessionId=${statsSessionId}&isReconnect=${isReconnect}`,
            protocolVersion,
            { headers: { 'User-Agent': navigator.userAgent } }
        );

        connection.onclose = function(closeEvent) {
            keepAliveInterval && clearInterval(keepAliveInterval);
            canSendMessage && (canSendMessage = false);

            onCloseCallback({ code: closeEvent.code,
                reason: closeEvent.reason });

            // Do not try to reconnect if connection was closed intentionally.
            if (CUSTOM_ERROR_CODES.includes(closeEvent.code)) {
                return;
            }

            if (reconnectSpentTime < MAX_RECONNECT_TIME) {
                const reconnectTimeoutTimeCandidate = getTimeout(reconnectSpentTime);
                const reconnectTimeoutTime = reconnectSpentTime + reconnectTimeoutTimeCandidate < MAX_RECONNECT_TIME
                    ? reconnectTimeoutTimeCandidate
                    : MAX_RECONNECT_TIME - reconnectSpentTime;

                reconnectSpentTime += reconnectTimeoutTime;
                reconnectTimeout = setTimeout(() => trace.connect(isBreakoutRoom, true), reconnectTimeoutTime);
            }
        };

        connection.onopen = function() {
            keepAliveInterval = setInterval(trace.keepAlive, pingInterval);
        };

        connection.onmessage = async function(msg) {
            const { type, body } = JSON.parse(msg.data);

            // if the server sends back the last sequence number that it has been received.
            if (type === messageTypes.SequenceNumber) {
                const { value, state } = body;

                // if there are entries in the buffer
                if (buffer.length) {
                    const firstSN = buffer[0].data[4];
                    const lastSN = buffer[buffer.length - 1].data[4];

                    // messages would not be in order, some messages might be missing
                    if (value < firstSN - 1 && value > lastSN) {
                        connection && connection.close(DUMP_ERROR_CODE);

                        return;
                    }

                    const lastReceivedSNIndex = buffer.findIndex(statsEntry => statsEntry.data[4] === value);

                    buffer = buffer.slice(lastReceivedSNIndex + 1);
                }

                // this happens when the connection is established
                if (state === 'initial') {
                    reconnectTimeout && clearTimeout(reconnectTimeout);
                    reconnectSpentTime = 0;
                    canSendMessage = true;
                    for (let i = 0; i < buffer.length; i++) {
                        sendMessage(buffer[i]);
                    }
                }
            }
        };
    };

    return trace;
}
