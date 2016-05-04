'use strict';
(function() {
  var wsURL = 'wss://rtcstats.tokbox.com/';
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

  var origPeerConnection = window.webkitRTCPeerConnection || window.RTCPeerConnection || window.mozRTCPeerConnection;
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

      if (!config) {
        config = { nullConfig: true };
      }
      config.browserType = isChrome ? 'webkit' : 'moz';

      trace('create', id, config);
      // TODO: do we want to log constraints here? They are chrome-proprietary.
      if (constraints) {
        trace('constraints', id, constraints);
      }

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
          var opts;
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
      var prev = {};
      var interval = window.setInterval(function() {
        if (isChrome) {
          pc.getStats(function(res) {
            var now = mangleChromeStats(pc, res);
            var base = JSON.parse(JSON.stringify(now)); // our new prev
            trace('getstats', id, deltaCompression(prev, now));
            prev = base;
          });
        } else {
          pc.getStats(null, function(res) {
            var now = res;
            var base = JSON.parse(JSON.stringify(now)); // our new prev
            trace('getstats', id, deltaCompression(prev, now));
            prev = base;
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
      window.webkitRTCPeerConnection.prototype = origPeerConnection.prototype;
    } else if (window.RTCPeerConnection) {
      window.RTCPeerConnection = peerconnection;
      window.RTCPeerConnection.prototype = origPeerConnection.prototype;
    } else {
      window.mozRTCPeerConnection = peerconnection;
      window.mozRTCPeerConnection.prototype = origPeerConnection.prototype;
    }
  }

  // getUserMedia wrappers
  function dumpStream(stream) {
    return {
      id: stream.id,
      tracks: stream.getTracks().map(function(track) {
        return {
          id: track.id,
          kind: track.kind,
          label: track.label, // contains information about the hardware
          readyState: track.readyState
        };
      })
    };
  }
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
          // we log the stream id, track ids and tracks readystate since that is ended GUM fails
          // to acquire the cam (in chrome)
          trace('getUserMediaOnSuccess', null, dumpStream(stream));
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
      navigator.webkitGetUserMedia = gum.bind(navigator);
    } else {
      navigator.mozGetUserMedia = gum.bind(navigator);
    }
  }
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    var gum2 = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function() {
      trace('navigator.mediaDevices.getUserMedia', null, arguments[0]);
      var p = gum2.apply(navigator.mediaDevices, arguments);
      p.then(function(stream) {
        trace('navigator.mediaDevices.getUserMediaOnSuccess', null, dumpStream(stream));
      });
      p.then(null, function(err) {
        trace('navigator.mediaDevices.getUserMediaOnFailure', null, err.name);
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
  // apply a delta compression to the stats report. Reduces size by ~90%.
  // To reduce further, report keys could be compressed.
  function deltaCompression(oldStats, newStats) {
    Object.keys(newStats).forEach(function(id) {
      if (!oldStats[id]) {
        return;
      }
      var report = newStats[id];
      Object.keys(report).forEach(function(name) {
        if (report[name] === oldStats[id][name]) {
          delete newStats[id][name];
        }
        delete report.timestamp;
        if (Object.keys(report).length === 0) {
          delete newStats[id];
        }
      });
    });
    // TODO: moving the timestamp to the top-level is not compression but...
    newStats.timestamp = new Date();
    return newStats;
  }

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
      // backfill mediaType -- until https://codereview.chromium.org/1307633007/ lands.
      if (report.type === 'ssrc' && !standardStats.mediaType && standardStats.googTrackId) {
        // look up track kind in local or remote streams.
        var streams = pc.getRemoteStreams().concat(pc.getLocalStreams());
        for (var i = 0; i < streams.length && !standardStats.mediaType; i++) {
          var tracks = streams[i].getTracks();
          for (var j = 0; j < tracks.length; j++) {
            if (tracks[j].id === standardStats.googTrackId) {
              standardStats.mediaType = tracks[j].kind;
              report.mediaType = tracks[j].kind;
            }
          }
        }
      }
      standardReport[standardStats.id] = standardStats;
    });
    return standardReport;
  }

  /*
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
  */
}());
