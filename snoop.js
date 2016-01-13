'use strict';
(function() {
  var wsURL = 'wss://localhost:3002';
  var buffer = [];
  var connection = new WebSocket(wsURL + window.location.pathname);
  connection.onerror = function(e) {
    console.log('WS ERROR', e);
  };

  /*
  connection.onclose = function() {
    // reconnect?
  };
  */

  connection.onopen = function() {
    while (buffer.length) {
      connection.send(JSON.stringify(buffer.shift()));
    }
  };

  /*
  connection.onmessage = function(msg) {
    // no messages from the server defined yet.
  };
  */

  function trace() {
    //console.log.apply(console, arguments);
    // TODO: drop getStats when not connected?
    if (connection.readyState === 1) {
      connection.send(JSON.stringify(arguments));
    } else {
      buffer.push(arguments);
    }
  }

  // snoop on available devices. This is called snoop after all!
  var p;
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    p = navigator.mediaDevices.enumerateDevices();
  } else if (MediaStreamTrack && mediaStreamTrack.getSource) {
    p = new Promise(function(resolve) {
      MediaStreamTrack.getSources(function(devices) {
        resolve(devices);
      });
    });
  }
  if (p) {
    p.then(function(devices) {
      // make things JSON-seriazable and handles format conversion.
      var kinds = {audio: 'audioinput', video: 'videoinput', audioinput: 'audioinput', videoinput: 'videoinput'};
      devices = devices.map(function(device) {
        return {label: device.label,
            kind: kinds[device.kind],
            deviceId: device.id,
            groupId: ''};
      });
      console.log('ENUM', JSON.stringify(devices));
      trace('enumerateDevices', null, devices);
    });
  }

  var origPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection || window.RTCPeerConnection;
  if (origPeerConnection) {
    var peerconnectioncounter = 0;
    var isChrome = origPeerConnection === window.webkitRTCPeerConnection;
    var peerconnection = function(config, constraints) {
      var id = 'PC_' + peerconnectioncounter++;
      var pc = new origPeerConnection(config, constraints);

      // don't log credentials
      (config && config.iceServers || []).forEach(function(server) {
        delete server.credential;
      });
      trace('create', id, config);

      var methods = ['createDataChannel', 'close'];
      methods.forEach(function(method) {
        var nativeMethod = pc[method];
        pc[method] = function() {
          trace(method, id, arguments);
          return nativeMethod.apply(pc, arguments);
        };
      });

      methods = ['addStream', 'removeStream'];
      methods.forEach(function(method) {
        var nativeMethod = pc[method];
        pc[method] = function() {
          var stream = arguments[0];
          trace(method, id, stream.id + ' ' + stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
          return nativeMethod.apply(pc, arguments);
        };
      });

      methods = ['createOffer', 'createAnswer'];
      methods.forEach(function(method) {
        var nativeMethod = pc[method];
        pc[method] = function() {
          var args = arguments;
          var opts = undefined;
          if (arguments.length === 1 && typeof arguments[0] === 'object') {
            opts = arguments[0];
          } else if (arguments.length === 3 && typeof arguments[2] === 'object') {
            opts = arguments[2];
          }
          trace(method, id, opts);
          return new Promise(function(resolve, reject) {
            nativeMethod.apply(pc, [
              function(description) {
                trace(method + 'OnSuccess', id, description);
                resolve(description);
                if (args.length > 0 && typeof args[0] === 'function') {
                  args[0].apply(null, [description]);
                }
              },
              function(err) {
                trace(method + 'OnFailure', id, err);
                reject(err);
                if (args.length > 1 && typeof args[1] === 'function') {
                  args[1].apply(null, [err]);
                }
              },
              opts
            ]);
          });
        };
      });

      methods = ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate'];
      methods.forEach(function(method) {
        var nativeMethod = pc[method];
        pc[method] = function() {
          var args = arguments;
          trace(method, id, args[0]);
          return new Promise(function(resolve, reject) {
            nativeMethod.apply(pc, [args[0],
                function() {
                  trace(method + 'OnSuccess', id);
                  resolve();
                  if (args.length >= 2) {
                    args[1].apply(null, []);
                  }
                },
                function(err) {
                  trace(method + 'OnFailure', id, err);
                  reject(err);
                  if (args.length >= 3) {
                    args[2].apply(null, [err]);
                  }
                }]
              );
          });
        };
      });

      pc.addEventListener('icecandidate', function(e) {
        trace('onicecandidate', id, e.candidate);
      });
      pc.addEventListener('addstream', function(e) {
        trace('onaddstream', id, e.stream.id + ' ' + e.stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
      });
      pc.addEventListener('removestream', function(e) {
        trace('onremovestream', id, e.stream.id + ' ' + e.stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
      });
      pc.addEventListener('signalingstatechange', function() {
        trace('onsignalingstatechange', id, pc.signalingState);
      });
      pc.addEventListener('iceconnectionstatechange', function() {
        trace('oniceconnectionstatechange', id, pc.iceConnectionState);
      });
      pc.addEventListener('negotiationneeded', function() {
        trace('onnegotiationneeded', id);
      });
      pc.addEventListener('datachannel', function(event) {
        trace('ondatachannel', id, [event.channel.id, event.channel.label]);
      });

      // TODO: do we want one big interval and all peerconnections
      //    queried in that or one setInterval per PC?
      //    we have to collect results anyway so...
      var interval = window.setInterval(function() {
        if (isChrome) {
          pc.getStats(function(res) {
            trace('getStats', id, removeTimestamps(filterBoringStats(
                removeGoogProperties(removeGoogTypes(
                    mangleChromeStats(pc, res))))));
          });
        } else {
          pc.getStats(null, function(res) {
            trace('getStats', id, filterBoringStats(res));
          }, function(err) {
            console.log(err);
          });
        }
      }, 1000);

      pc.addEventListener('signalingstatechange', function() {
        if (pc.signalingState === 'closed') {
          window.clearInterval(interval);
        }
      });
      return pc;
    };
    // wrap static methods. Currently just generateCertificate.
    if (origPeerConnection.generateCertificate) {
      Object.defineProperty(peerconnection, 'generateCertificate', {
        get: function() {
          return arguments.length ?
              origPeerConnection.generateCertificate.apply(null, arguments)
              : origPeerConnection.generateCertificate;
        }
      });
    }
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = peerconnection;
    } else {
      window.mozRTCPeerConnection = peerconnection;
    }
  }

  // getUserMedia wrappers
  if (navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
    var origGetUserMedia = navigator.webkitGetUserMedia ?
        navigator.webkitGetUserMedia.bind(navigator) :
        navigator.mozGetUserMedia.bind(navigator);
    var gum = function() {
      trace('getUserMedia', null, arguments[0]);
      var cb = arguments[1];
      var eb = arguments[2];
      origGetUserMedia(arguments[0],
        function(stream) {
          trace('getUserMediaOnSuccess', null,
              stream.id + ' ' + stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
          if (cb) {
            cb(stream);
          }
        },
        function(err) {
          trace('getUserMediaOnFailure', null, err.name);
          if (eb) {
            eb(err);
          }
        }
      );
    };
    if (navigator.webkitGetUserMedia) {
      navigator.webkitGetUserMedia = gum;
    } else {
      navigator.mozGetUserMedia = gum;
    }
  }
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    var gum2 = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function() {
      trace('navigator.mediaDevices.getUserMedia', null, arguments[0]);
      var p = gum2.apply(navigator.mediaDevices, arguments);
      p.then(function(stream) {
        trace('navigator.mediaDevices.getUserMediaOnSuccess', null,
            stream.id + ' ' + stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
      });
      p.then(null, function(err) {
        trace('navigator.mediaDevices.getUserMediaOnFailure', null, err);
      });
      return p;
    };
  }
  // TODO: are there events defined on MST that would allow us to listen when enabled was set?
  //    no :-(
  /*
  Object.defineProperty(MediaStreamTrack.prototype, 'enabled', {
    set: function(value) {
      trace('MediaStreamTrackEnable', this, value);
    }
  });
  */

  // taken from https://github.com/fippo/adapter/tree/getstats-mangling
  function mangleChromeStats(pc, response) {
    var standardReport = {};
    var reports = response.result();
    reports.forEach(function(report) {
      var standardStats = {
        id: report.id,
        timestamp: report.timestamp.getTime(),
        type: report.type
      };
      report.names().forEach(function(name) {
        standardStats[name] = report.stat(name);
      });
      // Step 1: translate to standard types and attribute names.
      switch (report.type) {
        case 'ssrc':
          standardStats.trackIdentifier = standardStats.googTrackId;
          // FIXME: not defined in spec, probably whether the track is
          //  remote?
          standardStats.remoteSource =
              standardStats.id.indexOf('recv') !== -1;
          standardStats.ssrc = parseInt(standardStats.ssrc, 10);

          if (!standardStats.mediaType && standardStats.googTrackId) {
            // look up track kind in local or remote streams.
            var streams = standardStats.remoteSource ?
                pc.getRemoteStreams() : pc.getLocalStreams();
            for (var i = 0; i < streams.length && !standardStats.mediaType;
                i++) {
              var tracks = streams[i].getTracks();
              for (var j = 0; j < tracks.length; j++) {
                if (tracks[j].id === standardStats.googTrackId) {
                  standardStats.mediaType = tracks[j].kind;
                }
              }
            }
          }

          // FIXME: 'only makes sense' <=> not set?
          if (standardStats.googFrameWidthReceived ||
              standardStats.googFrameWidthSent) {
            standardStats.frameWidth = parseInt(
                standardStats.googFrameWidthReceived ||
                standardStats.googFrameWidthSent, 10);
          }
          if (standardStats.googFrameHeightReceived ||
              standardStats.googFrameHeightSent) {
            standardStats.frameHeight = parseInt(
                standardStats.googFrameHeightReceived ||
                standardStats.googFrameHeightSent, 10);
          }
          if (standardStats.googFrameRateInput ||
              standardStats.googFrameRateReceived) {
            // FIXME: might be something else not available currently
            standardStats.framesPerSecond = parseInt(
                standardStats.googFrameRateInput ||
                standardStats.googFrameRateReceived, 10);
          }

          /* FIXME unfortunately the current stats (googFrameRateSent,
           * googFrameRateReceived, googFrameRateDecoded) so we can not
           * calculate the cumulative amount.
           * FIXME (spec) Firefox has frameRateMean why is this
           * not part of the spec?
           */
          if (standardStats.googFrameRateSent) {
            standardStats.framesSent = 0;
          }
          if (standardStats.googFrameRateReceived) {
            standardStats.framesReceived = 0;
          }
          if (standardStats.googFrameRateDecoded) {
            standardStats.framesDecoded = 0;
          }
          // FIXME: both on sender and receiver?
          if (standardStats.mediaType === 'video') {
            standardStats.framesDropped = 0;
          }
          if (standardStats.audioInputLevel ||
              standardStats.audioOutputLevel) {
            standardStats.audioLevel = parseInt(
                standardStats.audioInputLevel ||
                standardStats.audioOutputLevel, 10) / 32767.0;
          }

          if (standardStats.googJitterReceived) {
            standardStats.jitter = 1.0 * parseInt(
                standardStats.googJitterReceived, 10);
          }
          // FIXME: fractionLost

          if (standardStats.googFirsReceived || standardStats.googFirsSent) {
            standardStats.firCount = parseInt(
                standardStats.googFirsReceived ||
                standardStats.googFirsSent, 10);
          }
          if (standardStats.googPlisReceived || standardStats.googPlisSent) {
            standardStats.pliCount = parseInt(
                standardStats.googPlisReceived ||
                standardStats.googPlisSent, 10);
          }
          if (standardStats.googNacksReceived ||
              standardStats.googNacksSent) {
            standardStats.nackCount = parseInt(
                standardStats.googNacksReceived ||
                standardStats.googNacksSent, 10);
          }
          // FIXME: no SLI stats yet?

          if (standardStats.bytesSent) {
            standardStats.bytesSent = parseInt(standardStats.bytesSent, 10);
          }
          if (standardStats.bytesReceived) {
            standardStats.bytesReceived = parseInt(
                standardStats.bytesReceived, 10);
          }
          if (standardStats.packetsSent) {
            standardStats.packetsSent = parseInt(
                standardStats.packetsSent, 10);
          }
          if (standardStats.packetsReceived) {
            standardStats.packetsReceived = parseInt(
                standardStats.packetsReceived, 10);
          }
          if (standardStats.packetsLost) {
            standardStats.packetsLost = parseInt(
                standardStats.packetsLost, 10);
          }
          if (standardStats.googEchoCancellationReturnLoss) {
            standardStats.echoReturnLoss = 1.0 * parseInt(
                standardStats.googEchoCancellationReturnLoss, 10);
            standardStats.echoReturnLossEnhancement = 1.0 * parseInt(
                standardStats.googEchoCancellationReturnLossEnhancement, 10);
          }
          if (standardStats.googRtt) {
            // This is the RTCP RTT.
            standardStats.roundTripTime = parseInt(standardStats.googRtt, 10);
          }
          break;
        case 'localcandidate':
        case 'remotecandidate':
          // https://w3c.github.io/webrtc-stats/#icecandidate-dict*
          standardStats.portNumber = parseInt(standardStats.portNumber, 10);
          standardStats.priority = parseInt(standardStats.priority, 10);
          // FIXME: addressSourceUrl?
          // FIXME: https://github.com/w3c/webrtc-stats/issues/12
          break;
        case 'googCandidatePair':
          // https://w3c.github.io/webrtc-stats/#candidatepair-dict*
          standardStats.transportId = standardStats.googChannelId;
          // FIXME: maybe set depending on iceconnectionstate and read/write?
          //standardStats.state = 'FIXME'; // enum

          // FIXME: could be calculated from candidate priorities and role.
          //standardStats.priority = 'FIXME'; // unsigned long long
          standardStats.writable = standardStats.googWritable === 'true';
          standardStats.readable = standardStats.googReadable === 'true';
          // assumption: nominated is readable and writeable.
          standardStats.nominated = standardStats.readable &&
              standardStats.writable;
          // FIXME: missing from spec
          standardStats.selected =
              standardStats.googActiveConnection === 'true';
          standardStats.bytesSent = parseInt(standardStats.bytesSent, 10);
          standardStats.bytesReceived = parseInt(
              standardStats.bytesReceived, 10);
          // FIXME: packetsSent is not in spec?
          // FIXME: no packetsReceived?
          standardStats.packetsSent = parseInt(
              standardStats.packetsSent, 10);
          standardStats.packetsDiscardedOnSend = parseInt(
              standardStats.packetsDiscardedOnSend, 10);

          // This is the STUN RTT.
          standardStats.roundTripTime = parseInt(standardStats.googRtt, 10);

          // backfilled later from videoBWE.
          standardStats.availableOutgoingBitrate = 0.0;
          standardStats.availableIncomingBitrate = 0.0;
          break;
        case 'googComponent':
          // additional RTCTransportStats created later since we
          // want the normalized fields and complete snowball.
          break;
        case 'googCertificate':
          standardStats.type = 'certificate'; // FIXME spec: undefined in spec.
          standardStats.fingerprint = standardStats.googFingerprint;
          standardStats.fingerprintAlgorithm =
              standardStats.googFingerprintAlgorithm;
          standardStats.base64Certificate = standardStats.googDerBase64;
          standardStats.issuerCertificateId = null; // FIXME spec: undefined what 'no issuer' is.
          break;
        case 'VideoBwe':
          standardStats.availableOutgoingBitrate = 1.0 *
              parseInt(standardStats.googAvailableSendBandwidth, 10);
          standardStats.availableIncomingBitrate = 1.0 *
              parseInt(standardStats.googAvailableReceiveBandwidth, 10);
          break;
        default:
          break;
      }
      standardReport[standardStats.id] = standardStats;
    });
    // Step 2: fix things spanning multiple reports.
    Object.keys(standardReport).forEach(function(id) {
      var report = standardReport[id];
      var other, newId, sdp;
      switch (report.type) {
        case 'googCandidatePair':
          report.type = 'candidatepair';
          if (standardReport.bweforvideo) {
            report.availableOutgoingBitrate =
                standardReport.bweforvideo.availableOutgoingBitrate;
            report.availableIncomingBitrate =
                standardReport.bweforvideo.availableIncomingBitrate;
            standardReport[report.id] = report;
          }
          break;
        case 'googComponent':
          // create a new report since we don't carry over all fields.
          other = standardReport[report.selectedCandidatePairId];
          newId = 'transport_' + report.id;
          standardReport[newId] = {
            type: 'transport',
            timestamp: report.timestamp,
            id: newId,
            bytesSent: other && other.bytesSent || 0,
            bytesReceived: other && other.bytesReceived || 0,
            // FIXME (spec): rtpcpTransportStatsId: rtcp-mux is required so...
            activeConnection: other && other.selected,
            selectedCandidatePairId: report.selectedCandidatePairId,
            localCertificateId: report.localCertificateId,
            remoteCertificateId: report.remoteCertificateId
          };
          break;
        case 'ssrc':
          newId = 'rtpstream_' + report.id;
          // Workaround for https://code.google.com/p/webrtc/issues/detail?id=4808 (fixed in M46)
          if (!report.googCodecName) {
            report.googCodecName = 'VP8';
          }
          standardReport[newId] = {
            //type: 'notastandalonething',
            timestamp: report.timestamp,
            id: newId,
            ssrc: report.ssrc,
            mediaType: report.mediaType,
            associateStatsId: 'rtcpstream_' + report.id,
            isRemote: false,
            mediaTrackId: 'mediatrack_' + report.id,
            transportId: report.transportId,
            codecId: 'codec_' + report.googCodecName
          };
          if (report.mediaType === 'video') {
            standardReport[newId].firCount = report.firCount;
            standardReport[newId].pliCount = report.pliCount;
            standardReport[newId].nackCount = report.nackCount;
            standardReport[newId].sliCount = report.sliCount; // undefined yet
          }
          if (report.remoteSource) {
            standardReport[newId].type = 'inboundrtp';
            standardReport[newId].packetsReceived = report.packetsReceived;
            standardReport[newId].bytesReceived = report.bytesReceived;
            standardReport[newId].packetsLost = report.packetsLost;
          } else {
            standardReport[newId].type = 'outboundrtp';
            standardReport[newId].packetsSent = report.packetsSent;
            standardReport[newId].bytesSent = report.bytesSent;
            standardReport[newId].roundTripTime = report.roundTripTime;
            // TODO: targetBitrate
          }

          // FIXME: this is slightly more complicated. inboundrtp can have packetlost
          // but so can outboundrtp via rtcp (isRemote = true)
          // need to unmux with opposite type and put loss into remote report.
          newId = 'rtcpstream_' + report.id;
          standardReport[newId] = {
            //type: 'notastandalonething',
            timestamp: report.timestamp,
            id: newId,
            ssrc: report.ssrc,
            associateStatsId: 'rtpstream_' + report.id,
            isRemote: true,
            mediaTrackId: 'mediatrack_' + report.id,
            transportId: report.transportId,
            codecId: 'codec_' + report.googCodecName
          };
          if (report.remoteSource) {
            standardReport[newId].type = 'outboundrtp';
            standardReport[newId].packetsSent = report.packetsSent;
            standardReport[newId].bytesSent = report.bytesSent;
            standardReport[newId].roundTripTime = report.roundTripTime;
          } else {
            standardReport[newId].type = 'inboundrtp';
            standardReport[newId].packetsReceived = report.packetsReceived;
            standardReport[newId].bytesReceived = report.bytesReceived;
            standardReport[newId].packetsLost = report.packetsLost;
          }
          // FIXME: one of these is not set?
          if (report.jitter) {
            standardReport[newId].jitter = report.jitter;
          }

          newId = 'mediatrack_' + report.id;
          standardReport[newId] = {
            type: 'track',
            timestamp: report.timestamp,
            id: newId,
            trackIdentifier: report.trackIdentifier,
            remoteSource: report.remoteSource,
            ssrcIds: ['rtpstream_' + report.id, 'rtcpstream_' + report.id]
          };
          if (report.mediaType === 'audio') {
            standardReport[newId].audioLevel = report.audioLevel;
            if (report.id.indexOf('send') !== -1) {
              standardReport[newId].echoReturnLoss = report.echoReturnLoss;
              standardReport[newId].echoReturnLossEnhancement =
                  report.echoReturnLossEnhancement;
            }
          } else if (report.mediaType === 'video') {
            standardReport[newId].frameWidth = report.frameWidth;
            standardReport[newId].frameHeight = report.frameHeight;
            standardReport[newId].framesPerSecond = report.framesPerSecond;
            if (report.remoteSource) {
              standardReport[newId].framesReceived = report.framesReceived;
              standardReport[newId].framesDecoded = report.framesDecoded;
              standardReport[newId].framesDropped = report.framesDropped;
              standardReport[newId].framesCorrupted = report.framesCorrupted;
            } else {
              standardReport[newId].framesSent = report.framesSent;
            }
          }

          // We have one codec item per codec name.
          // This might be wrong (in theory) since with unified plan
          // we can have multiple m-lines and codecs and different
          // payload types/parameters but unified is not supported yet.
          if (!standardReport['codec_' + report.googCodecName]) {
            // determine payload type (from offer) and negotiated (?spec)
            // parameters (from answer). (parameters not negotiated yet)
            if (pc.localDescription &&
                pc.localDescription.type === 'offer') {
              sdp = pc.localDescription.sdp;
            } else if (pc.remoteDescription &&
                pc.remoteDescription.type === 'offer') {
              sdp = pc.remoteDescription.sdp;
            }
            if (sdp) {
              // TODO: use a SDP library instead of this regexp-stringsoup approach.
              var match = sdp.match(new RegExp('a=rtpmap:(\\d+) ' +
                  report.googCodecName + '\\/(\\d+)(?:\\/(\\d+))?'));
              if (match) {
                newId = 'codec_' + report.id;
                standardReport[newId] = {
                  type: 'codec', // FIXME (spec)
                  timestamp: report.timestamp,
                  id: newId,
                  codec: report.googCodecName,
                  payloadType: parseInt(match[1], 10),
                  clockRate: parseInt(match[2], 10),
                  channels: parseInt(match[3] || '1', 10),
                  parameters: ''
                };
              }
            }
          }
          break;
        default:
          break;
      }
    });
    // Step 3: fiddle the transport in between transport and rtp stream
    Object.keys(standardReport).forEach(function(id) {
      var report = standardReport[id];
      if (report.type === 'transprort') {
        // RTCTransport has a pointer to the selectedCandidatePair...
        var other = standardReport[report.selectedCandidatePairId];
        if (other) {
          other.transportId = report.id;
        }
        // but no pointers to the rtpstreams running over it?!
        // instead, we rely on having added 'transport_'
        Object.keys(standardReport).forEach(function(otherid) {
          other = standardReport[otherid];
          if ((other.type === 'inboundrtp' ||
              other.type === 'outboundrtp') &&
              report.id === 'transport_' + other.transportId) {
            other.transportId = report.id;
          }
        });
      }
    });
    return standardReport;
  }

  function removeGoogTypes(results) {
    // Filter nonstandard goog* types, ssrc and VideoBwe.
    Object.keys(results).forEach(function(id) {
      var type = results[id].type;
      if (type === 'ssrc' || type === 'VideoBwe' || type.indexOf('goog') === 0) {
        delete results[id];
      }
    });
    return results;
  }
  function removeGoogProperties(results) {
    // Remove any goog attributes.
    // TODO: too aggressive and removes interesting stats.
    Object.keys(results).forEach(function(id) {
      var report = results[id];
      Object.keys(report).forEach(function(name) {
        if (name.indexOf('goog') === 0) {
          delete report[name];
        }
      });
      results[id] = report;
    });
    return results;
  }

  function filterBoringStats(results) {
    Object.keys(results).forEach(function(id) {
      switch (results[id].type) {
        case 'certificate':
        case 'codec':
          delete results[id];
          break;
        default:
          // noop
      }
    });
    return results;
  }

  function removeTimestamps(results) {
    // FIXME: does not work in FF since the timestamp can't be deleted.
    Object.keys(results).forEach(function(id) {
      delete results[id].timestamp;
    });
    return results;
  }
}());
