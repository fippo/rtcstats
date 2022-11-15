/* eslint-disable prefer-rest-params */
/* eslint-disable no-param-reassign */
import { BrowserDetection } from '@jitsi/js-utils/browser-detection';

import { PC_CON_STATE_CHANGE, PC_ICE_CON_STATE_CHANGE } from './events';

/**
 * transforms a maplike to an object. Mostly for getStats + JSON.parse(JSON.stringify())
 * @param {*} m
 */
function map2obj(m) {
    if (!m.entries) {
        return m;
    }
    const o = {};

    m.forEach((v, k) => {
        o[k] = v;
    });

    return o;
}

/**
 *
 * @param {*} pc
 * @param {*} response
 */
function mangleChromeStats(pc, response) {
    const standardReport = {};
    const reports = response.result();

    reports.forEach(report => {
        const standardStats = {
            id: report.id,
            timestamp: report.timestamp.getTime(),
            type: report.type
        };

        report.names().forEach(name => {
            standardStats[name] = report.stat(name);
        });
        standardReport[standardStats.id] = standardStats;
    });

    return standardReport;
}

/**
 * Apply a delta compression to the stats report. Reduces size by ~90%.
 * To reduce further, report keys could be compressed.
 * @param {*} oldStats
 * @param {*} newStats
 */
function deltaCompression(oldStats, newStatsArg) {
    const newStats = JSON.parse(JSON.stringify(newStatsArg));

    // Go through each report of the newly fetches stats entry and compare it with the previous one (old)
    // If a field value (e.g. ssrc.id) from the new report matches the corresponding one from the old report
    // delete it.
    // The new stats entry will be returned thus any reports from the old stats entry that are no longer found
    // in the new one will me considered as removed.
    // stats entries are expected to have the following format:
    // {reportName1: {
    //    key1: value,
    //    key2: value2
    // },
    // reportName2: {
    //    key1: value,
    //    key2, value2,
    // }}

    Object.keys(newStats).forEach(id => {
        const report = newStats[id];

        delete report.id;
        if (!oldStats[id]) {
            return;
        }
        Object.keys(report).forEach(name => {
            if (report[name] === oldStats[id][name]) {
                delete newStats[id][name];
            }
        });
    });

    // TODO Snippet bellow adds the last timestamp as a stats level fields, probably used in feature extraction on the
    // rtcstats-server side, most likely not used anymore, verify if this can be removed.
    let timestamp = -Infinity;

    Object.keys(newStats).forEach(id => {
        const report = newStats[id];

        if (report.timestamp > timestamp) {
            timestamp = report.timestamp;
        }
    });
    Object.keys(newStats).forEach(id => {
        const report = newStats[id];

        if (report.timestamp === timestamp) {
            report.timestamp = 0;
        }
    });
    newStats.timestamp = timestamp;

    return newStats;
}

/**
 *
 * @param {*} stream
 */
function dumpStream(stream) {
    return {
        id: stream.id,
        tracks: stream.getTracks().map(track => {
            return {
                id: track.id, // unique identifier (GUID) for the track
                kind: track.kind, // `audio` or `video`
                label: track.label, // identified the track source
                enabled: track.enabled, // application can control it
                muted: track.muted, // application cannot control it (read-only)
                readyState: track.readyState // `live` or `ended`
            };
        })
    };
}

/**
 *
 * @param {*} trace
 * @param {*} getStatsInterval
 * @param {*} prefixesToWrap
 * @param {*} connectionFilter
 */
export default function(
        { statsEntry: sendStatsEntry },
        { connectionFilter,
            pollInterval,
            useLegacy,
            sendSdp = false,
            prefixesToWrap = [ '' ],
            eventCallback }
) {
    let peerconnectioncounter = 0;

    const browserDetection = new BrowserDetection();
    const isFirefox = browserDetection.isFirefox();
    const isSafari = browserDetection.isSafari();
    const isChrome = browserDetection.isChrome();
    const isElectron = browserDetection.isElectron();
    const isReactNative = browserDetection.isReactNative();

    // Only initialize rtcstats if it's run in a supported browser
    if (!(isFirefox || isSafari || isChrome || isElectron || isReactNative)) {
        throw new Error('RTCStats unsupported browser.');
    }

    prefixesToWrap.forEach(prefix => {
        if (!window[`${prefix}RTCPeerConnection`]) {
            return;
        }

        const OrigPeerConnection = window[`${prefix}RTCPeerConnection`];
        const peerconnection = function(config, constraints) {
            // We want to make sure that any potential errors that occur at this point, caused by rtcstats logic,
            // does not affect the normal flow of any application that might integrate it.
            const origConfig = { ...config };
            const origConstraints = { ...constraints };
            const { optional = [] } = constraints;
            let isP2P = false;

            try {
                // Verify if the connection is configured as P2P
                optional.some(option => option.rtcStatsSFUP2P === true) && (isP2P = true);

                const pc = new OrigPeerConnection(config, constraints);

                // In case the client wants to skip some rtcstats connections, a filter function can be provided which
                // will return the original PC object without any strings attached.
                if (connectionFilter && connectionFilter(config)) {
                    return pc;
                }

                const id = `PC_${peerconnectioncounter++}`;

                pc.__rtcStatsId = id;

                if (!config) {
                    config = { nullConfig: true };
                }

                config = JSON.parse(JSON.stringify(config)); // deepcopy
                // don't log credentials
                ((config && config.iceServers) || []).forEach(server => {
                    delete server.credential;
                });

                if (isFirefox) {
                    config.browserType = 'moz';
                } else {
                    config.browserType = 'webkit';
                }

                sendStatsEntry('create', id, config);

                pc.__dtlsTransport = null;

                // TODO: do we want to log constraints here? They are chrome-proprietary.
                // eslint-disable-next-line max-len
                // http://stackoverflow.com/questions/31003928/what-do-each-of-these-experimental-goog-rtcpeerconnectionconstraints-do
                if (constraints) {
                    sendStatsEntry('constraints', id, constraints);
                }

                pc.addEventListener('icecandidate', e => {
                    sendStatsEntry('onicecandidate', id, e.candidate);
                });
                pc.addEventListener('addstream', e => {
                    sendStatsEntry(
                        'onaddstream',
                        id,
                        `${e.stream.id} ${e.stream.getTracks().map(t => `${t.kind}:${t.id}`)}`
                    );
                });
                pc.addEventListener('track', e => {
                    sendStatsEntry(
                        'ontrack',
                        id,
                        `${e.track.kind}:${e.track.id} ${e.streams.map(stream => `stream:${stream.id}`)}`
                    );
                });
                pc.addEventListener('removestream', e => {
                    sendStatsEntry(
                        'onremovestream',
                        id,
                        `${e.stream.id} ${e.stream.getTracks().map(t => `${t.kind}:${t.id}`)}`
                    );
                });
                pc.addEventListener('signalingstatechange', () => {
                    sendStatsEntry('onsignalingstatechange', id, pc.signalingState);
                });
                pc.addEventListener('iceconnectionstatechange', () => {
                    const { iceConnectionState } = pc;

                    sendStatsEntry('oniceconnectionstatechange', id, iceConnectionState);
                    eventCallback?.({
                        type: PC_ICE_CON_STATE_CHANGE,
                        body: {
                            pcId: id,
                            isP2P,
                            state: iceConnectionState
                        }
                    });
                });
                pc.addEventListener('icegatheringstatechange', () => {
                    sendStatsEntry('onicegatheringstatechange', id, pc.iceGatheringState);
                });
                pc.addEventListener('connectionstatechange', () => {
                    const { connectionState } = pc;

                    sendStatsEntry('onconnectionstatechange', id, pc.connectionState);
                    eventCallback?.({
                        type: PC_CON_STATE_CHANGE,
                        body: {
                            pcId: id,
                            isP2P,
                            state: connectionState
                        }
                    });
                });
                pc.addEventListener('negotiationneeded', () => {
                    sendStatsEntry('onnegotiationneeded', id, undefined);
                });
                pc.addEventListener('datachannel', event => {
                    sendStatsEntry('ondatachannel', id, [ event.channel.id, event.channel.label ]);
                });

                let prev = {};

                const getStats = function() {
                    if (isFirefox || isSafari || isReactNative || ((isChrome || isElectron) && !useLegacy)) {
                        pc.getStats(null).then(res => {
                            const now = map2obj(res);
                            const base = JSON.parse(JSON.stringify(now)); // our new prev

                            sendStatsEntry('getstats', id, deltaCompression(prev, now));
                            prev = base;
                        });
                    } else if (isChrome || isElectron) {
                        // for chromium based env we have the option of using the chrome getstats api via the
                        // useLegacy flag.
                        pc.getStats(res => {
                            const now = mangleChromeStats(pc, res);
                            const base = JSON.parse(JSON.stringify(now)); // our new prev

                            sendStatsEntry('getstats', id, deltaCompression(prev, now));
                            prev = base;
                        });
                    }

                    // If the current env doesn't support any getstats call do nothing.
                };

                // TODO: do we want one big interval and all peerconnections
                //    queried in that or one setInterval per PC?
                //    we have to collect results anyway so...
                if (pollInterval) {
                    const interval = window.setInterval(() => {
                        if (pc.signalingState === 'closed' || pc.iceConnectionState === 'closed') {
                            window.clearInterval(interval);

                            return;
                        }
                        getStats();
                    }, pollInterval);
                }

                pc.addEventListener('connectionstatechange', () => {
                    if ([ 'connected', 'failed' ].includes(pc.connectionState)) {
                        getStats();
                    }
                });

                return pc;
            } catch (error) {
                // If something went wrong, return a normal PeerConnection
                console.error('RTCStats PeerConnection bind failed: ', error);

                return new OrigPeerConnection(origConfig, origConstraints);
            }
        };

        [ 'createDataChannel', 'close' ].forEach(method => {
            const nativeMethod = OrigPeerConnection.prototype[method];

            if (nativeMethod) {
                OrigPeerConnection.prototype[method] = function() {
                    try {
                        sendStatsEntry(method, this.__rtcStatsId, arguments);
                    } catch (error) {
                        console.error(`RTCStats ${method} bind failed: `, error);
                    }

                    return nativeMethod.apply(this, arguments);
                };
            }
        });

        [ 'addStream', 'removeStream' ].forEach(method => {
            const nativeMethod = OrigPeerConnection.prototype[method];

            if (nativeMethod) {
                OrigPeerConnection.prototype[method] = function() {
                    try {
                        const stream = arguments[0];
                        const streamInfo = stream
                            .getTracks()
                            .map(t => `${t.kind}:${t.id}`)
                            .join(',');

                        sendStatsEntry(method, this.__rtcStatsId, `${stream.id} ${streamInfo}`);
                    } catch (error) {
                        console.error(`RTCStats ${method} bind failed: `, error);
                    }

                    return nativeMethod.apply(this, arguments);
                };
            }
        });

        [ 'addTrack' ].forEach(method => {
            const nativeMethod = OrigPeerConnection.prototype[method];

            if (nativeMethod) {
                OrigPeerConnection.prototype[method] = function() {
                    try {
                        const track = arguments[0];
                        const streams = [].slice.call(arguments, 1);

                        sendStatsEntry(
                            method,
                            this.__rtcStatsId,
                            `${track.kind}:${track.id} ${streams.map(s => `stream:${s.id}`).join(';') || '-'}`
                        );
                    } catch (error) {
                        console.error(`RTCStats ${method} bind failed: `, error);
                    }

                    return nativeMethod.apply(this, arguments);
                };
            }
        });

        [ 'removeTrack' ].forEach(method => {
            const nativeMethod = OrigPeerConnection.prototype[method];

            if (nativeMethod) {
                OrigPeerConnection.prototype[method] = function() {
                    try {
                        const track = arguments[0].track;

                        sendStatsEntry(method, this.__rtcStatsId, track ? `${track.kind}:${track.id}` : 'null');
                    } catch (error) {
                        console.error(`RTCStats ${method} bind failed: `, error);
                    }

                    return nativeMethod.apply(this, arguments);
                };
            }
        });

        [ 'addTransceiver' ].forEach(method => {
            const nativeMethod = OrigPeerConnection.prototype[method];

            if (nativeMethod) {
                OrigPeerConnection.prototype[method] = function() {
                    try {
                        const trackOrKind = arguments[0];
                        let opts;

                        if (typeof trackOrKind === 'string') {

                            opts = trackOrKind;
                        } else {
                            opts = `${trackOrKind.kind}:${trackOrKind.id}`;
                        }
                        if (arguments.length === 2 && typeof arguments[1] === 'object') {
                            opts += ` ${JSON.stringify(arguments[1])}`;
                        }

                        sendStatsEntry(method, this.__rtcStatsId, opts);
                    } catch (error) {
                        console.error(`RTCStats ${method} bind failed: `, error);
                    }

                    return nativeMethod.apply(this, arguments);
                };
            }
        });

        [ 'createOffer', 'createAnswer' ].forEach(method => {
            const nativeMethod = OrigPeerConnection.prototype[method];

            if (nativeMethod) {
                OrigPeerConnection.prototype[method] = function() {
                    // The logic here extracts the arguments and establishes if the API
                    // is callback or Promise based.
                    const rtcStatsId = this.__rtcStatsId;
                    const args = arguments;
                    let opts;

                    if (arguments.length === 1 && typeof arguments[0] === 'object') {
                        opts = arguments[0];
                    } else if (arguments.length === 3 && typeof arguments[2] === 'object') {
                        opts = arguments[2];
                    }

                    // We can only put a "barrier" at this point because the above logic is
                    // necessary in all cases, if something fails there we can't just bypass it.
                    try {
                        sendStatsEntry(method, this.__rtcStatsId, opts);
                    } catch (error) {
                        console.error(`RTCStats ${method} bind failed: `, error);
                    }

                    return nativeMethod.apply(this, opts ? [ opts ] : undefined).then(
                        description => {
                            try {

                                const data = sendSdp ? description : '';

                                sendStatsEntry(`${method}OnSuccess`, rtcStatsId, data);
                            } catch (error) {
                                console.error(`RTCStats ${method} promise success bind failed: `, error);
                            }

                            // We can't safely bypass this part of logic because it's necessary for Proxying this
                            // request. It determines weather the call is callback or promise based.
                            if (args.length > 0 && typeof args[0] === 'function') {
                                args[0].apply(null, [ description ]);

                                return undefined;
                            }

                            return description;
                        },
                        err => {
                            try {
                                sendStatsEntry(`${method}OnFailure`, rtcStatsId, err.toString());
                            } catch (error) {
                                console.error(`RTCStats ${method} promise failure bind failed: `, error);
                            }

                            // We can't safely bypass this part of logic because it's necessary for
                            // Proxying this request. It determines weather the call is callback or promise based.
                            if (args.length > 1 && typeof args[1] === 'function') {
                                args[1].apply(null, [ err ]);

                                return;
                            }
                            throw err;
                        }
                    );
                };
            }
        });

        [ 'setLocalDescription', 'setRemoteDescription', 'addIceCandidate' ].forEach(method => {
            const nativeMethod = OrigPeerConnection.prototype[method];

            if (nativeMethod) {
                OrigPeerConnection.prototype[method] = function() {
                    const rtcStatsId = this.__rtcStatsId;
                    const args = arguments;

                    try {
                        const data = sendSdp ? args[0] : '';

                        sendStatsEntry(method, this.__rtcStatsId, data);
                    } catch (error) {
                        console.error(`RTCStats ${method} bind failed: `, error);
                    }

                    return nativeMethod.apply(this, [ args[0] ]).then(
                        () => {
                            try {
                                sendStatsEntry(`${method}OnSuccess`, rtcStatsId, undefined);
                            } catch (error) {
                                console.error(`RTCStats ${method} promise success bind failed: `, error);
                            }

                            if (!this.__dtlsTransport && method.endsWith('Description') && !isReactNative) {
                                this.getSenders().forEach(sender => {
                                    if (!this.__dtlsTransport && sender.transport) {
                                        this.__dtlsTransport = sender.transport;

                                        sender.transport.addEventListener('error', error => {
                                            sendStatsEntry('ondtlserror', rtcStatsId, error);
                                        });

                                        sender.transport.addEventListener('statechange', () => {
                                            const newstate = sender.transport.state;

                                            sendStatsEntry('ondtlsstatechange', rtcStatsId, newstate);
                                        });
                                    }
                                });
                            }

                            // We can't safely bypass this part of logic because it's necessary for
                            // Proxying this request. It determines weather the call is callback or promise based.
                            if (args.length >= 2 && typeof args[1] === 'function') {
                                args[1].apply(null, []);

                                return undefined;
                            }

                            return undefined;
                        },
                        err => {
                            try {
                                sendStatsEntry(`${method}OnFailure`, rtcStatsId, err.toString());
                            } catch (error) {
                                console.error(`RTCStats ${method} promise failure bind failed: `, error);
                            }

                            // We can't safely bypass this part of logic because it's necessary for
                            // Proxying this request. It determines weather the call is callback or promise based
                            if (args.length >= 3 && typeof args[2] === 'function') {
                                args[2].apply(null, [ err ]);

                                return undefined;
                            }
                            throw err;
                        }
                    );
                };
            }
        });

        // wrap static methods. Currently just generateCertificate.
        if (OrigPeerConnection.generateCertificate) {
            Object.defineProperty(peerconnection, 'generateCertificate', {
                get() {
                    return arguments.length
                        ? OrigPeerConnection.generateCertificate.apply(null, arguments)
                        : OrigPeerConnection.generateCertificate;
                }
            });
        }
        window[`${prefix}RTCPeerConnection`] = peerconnection;
        window[`${prefix}RTCPeerConnection`].prototype = OrigPeerConnection.prototype;
    });

    // getUserMedia wrappers
    prefixesToWrap.forEach(prefix => {
        const name = prefix + (prefix.length ? 'GetUserMedia' : 'getUserMedia');

        if (!navigator[name]) {
            return;
        }
        const origGetUserMedia = navigator[name].bind(navigator);
        const gum = function() {
            try {
                sendStatsEntry('getUserMedia', null, arguments[0]);
            } catch (error) {
                console.error('RTCStats getUserMedia bind failed: ', error);
            }

            const cb = arguments[1];
            const eb = arguments[2];

            origGetUserMedia(
                arguments[0],
                stream => {
                    try {
                        sendStatsEntry('getUserMediaOnSuccess', null, dumpStream(stream));
                    } catch (error) {
                        console.error('RTCStats getUserMediaOnSuccess bind failed: ', error);
                    }

                    // we log the stream id, track ids and tracks readystate since that is ended GUM fails
                    // to acquire the cam (in chrome)
                    if (cb) {
                        cb(stream);
                    }
                },
                err => {
                    try {
                        sendStatsEntry('getUserMediaOnFailure', null, err.name);
                    } catch (error) {
                        console.error('RTCStats getUserMediaOnFailure bind failed: ', error);
                    }

                    if (eb) {
                        eb(err);
                    }
                }
            );
        };

        navigator[name] = gum.bind(navigator);
    });

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const gum = function() {
            try {
                sendStatsEntry('navigator.mediaDevices.getUserMedia', null, arguments[0]);
            } catch (error) {
                console.error('RTCStats navigator.mediaDevices.getUserMedia bind failed: ', error);
            }

            return origGetUserMedia.apply(navigator.mediaDevices, arguments).then(
                stream => {
                    try {
                        sendStatsEntry('navigator.mediaDevices.getUserMediaOnSuccess', null, dumpStream(stream));
                    } catch (error) {
                        console.error('RTCStats navigator.mediaDevices.getUserMediaOnSuccess bind failed: ', error);
                    }

                    return stream;
                },
                err => {
                    try {
                        sendStatsEntry('navigator.mediaDevices.getUserMediaOnFailure', null, err.name);
                    } catch (error) {
                        console.error('RTCStats navigator.mediaDevices.getUserMediaOnFailure bind failed: ', error);
                    }

                    return Promise.reject(err);
                }
            );
        };

        navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices);
    }

    // getDisplayMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        const gdm = function() {
            try {
                sendStatsEntry('navigator.mediaDevices.getDisplayMedia', null, arguments[0]);
            } catch (error) {
                console.error('RTCStats navigator.mediaDevices.getDisplayMedia bind failed: ', error);
            }

            return origGetDisplayMedia.apply(navigator.mediaDevices, arguments).then(
                stream => {
                    try {
                        sendStatsEntry('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream));
                    } catch (error) {
                        console.error('RTCStats navigator.mediaDevices.getDisplayMediaOnSuccess bind failed: ', error);
                    }

                    return stream;
                },
                err => {
                    try {
                        sendStatsEntry('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name);
                    } catch (error) {
                        console.error('RTCStats navigator.mediaDevices.getDisplayMediaOnFailure bind failed: ', error);
                    }

                    return Promise.reject(err);
                }
            );
        };

        navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices);
    }
}
