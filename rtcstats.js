'use strict';

import { BrowserDetection } from '@jitsi/js-utils';

// transforms a maplike to an object. Mostly for getStats +
// JSON.parse(JSON.stringify())
function map2obj(m) {
  if (!m.entries) {
    return m;
  }
  var o = {};
  m.forEach(function(v, k) {
    o[k] = v;
  });
  return o;
}

// apply a delta compression to the stats report. Reduces size by ~90%.
// To reduce further, report keys could be compressed.
function deltaCompression(oldStats, newStats) {
  newStats = JSON.parse(JSON.stringify(newStats));
  Object.keys(newStats).forEach(function(id) {
    var report = newStats[id];
    delete report.id;
    if (!oldStats[id]) {
      return;
    }
    Object.keys(report).forEach(function(name) {
      if (report[name] === oldStats[id][name]) {
        delete newStats[id][name];
      }
      if (Object.keys(report).length === 0) {
        delete newStats[id];
      } else if (Object.keys(report).length === 1 && report.timestamp) {
        delete newStats[id];
      }
    });
  });

  var timestamp = -Infinity;
  Object.keys(newStats).forEach(function(id) {
    var report = newStats[id];
    if (report.timestamp > timestamp) {
      timestamp = report.timestamp;
    }
  });
  Object.keys(newStats).forEach(function(id) {
    var report = newStats[id];
    if (report.timestamp === timestamp) {
      report.timestamp = 0;
    }
  });
  newStats.timestamp = timestamp;
  return newStats;
}

function mangleChromeStats(pc, response) {
  var standardReport = {};
  var reports = response.result();
  reports.forEach(function(report) {
    var standardStats = {
      id: report.id,
      timestamp: report.timestamp.getTime(),
      type: report.type,
    };
    report.names().forEach(function(name) {
      standardStats[name] = report.stat(name);
    });
    standardReport[standardStats.id] = standardStats;
  });
  return standardReport;
}

function dumpStream(stream) {
  return {
    id: stream.id,
    tracks: stream.getTracks().map(function(track) {
      return {
        id: track.id,                 // unique identifier (GUID) for the track
        kind: track.kind,             // `audio` or `video`
        label: track.label,           // identified the track source
        enabled: track.enabled,       // application can control it
        muted: track.muted,           // application cannot control it (read-only)
        readyState: track.readyState, // `live` or `ended`
      };
    }),
  };
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

export default function(trace, getStatsInterval, prefixesToWrap, connectionFilter) {

  var peerconnectioncounter = 0;

  var browserDetection = new BrowserDetection();
  var isFirefox = browserDetection.isFirefox();
  var isSafari = browserDetection.isSafari();
  var isChrome = browserDetection.isChrome();
  var isElectron = browserDetection.isElectron();

  // Only initialize rtcstats if it's run in a supported browser
  if (!(isFirefox || isSafari || isChrome || isElectron)) {
    throw new Error('RTCStats unsupported browser.');
  }

  prefixesToWrap.forEach(function(prefix) {
    if (!window[prefix + 'RTCPeerConnection']) {
      return;
    }

    var origPeerConnection = window[prefix + 'RTCPeerConnection'];
    var peerconnection = function(config, constraints) {
      // We want to make sure that any potential errors that occur at this point, caused by rtcstats logic,
      // does not affect the normal flow of any application that might integrate it.
      const origConfig = {...config};
      const origConstraints = {...constraints};
      try {
        var pc = new origPeerConnection(config, constraints);

        // In case the client wants to skip some rtcstats connections, a filter function can be provided which
        // will return the original PC object without any strings attached.
        if (connectionFilter && connectionFilter(config)) {
           return pc
        }

        var id = 'PC_' + peerconnectioncounter++;
        pc.__rtcStatsId = id;

        if (!config) {
          config = { nullConfig: true };
        }

        config = JSON.parse(JSON.stringify(config)); // deepcopy
        // don't log credentials
        ((config && config.iceServers) || []).forEach(function(server) {
          delete server.credential;
        });

        if (isFirefox) {
          config.browserType = 'moz';
        } else {
          config.browserType = 'webkit';
        }

        trace('create', id, config);
        // TODO: do we want to log constraints here? They are chrome-proprietary.
        // http://stackoverflow.com/questions/31003928/what-do-each-of-these-experimental-goog-rtcpeerconnectionconstraints-do
        if (constraints) {
          trace('constraints', id, constraints);
        }

        pc.addEventListener('icecandidate', function(e) {
          trace('onicecandidate', id, e.candidate);
        });
        pc.addEventListener('addstream', function(e) {
          trace('onaddstream', id, e.stream.id + ' ' + e.stream.getTracks().map(function(t) { return t.kind + ':' + t.id; }));
        });
        pc.addEventListener('track', function(e) {
          trace('ontrack', id, e.track.kind + ':' + e.track.id + ' ' + e.streams.map(function(stream) { return 'stream:' + stream.id; }));
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
        pc.addEventListener('icegatheringstatechange', function() {
          trace('onicegatheringstatechange', id, pc.iceGatheringState);
        });
        pc.addEventListener('connectionstatechange', function() {
          trace('onconnectionstatechange', id, pc.connectionState);
        });
        pc.addEventListener('negotiationneeded', function() {
          trace('onnegotiationneeded', id, undefined);
        });
        pc.addEventListener('datachannel', function(event) {
          trace('ondatachannel', id, [event.channel.id, event.channel.label]);
        });

        var prev = {};
        var getStats = function() {
          if (isFirefox || isSafari) {
            pc.getStats(null).then(function(res) {
              var now = map2obj(res);
              var base = JSON.parse(JSON.stringify(now)); // our new prev
              trace('getstats', id, deltaCompression(prev, now));
              prev = base;
            });
          } else {
            pc.getStats(function(res) {
              var now = mangleChromeStats(pc, res);
              var base = JSON.parse(JSON.stringify(now)); // our new prev
              trace('getstats', id, deltaCompression(prev, now));
              prev = base;
            });
          }
        };
        // TODO: do we want one big interval and all peerconnections
        //    queried in that or one setInterval per PC?
        //    we have to collect results anyway so...
        if (getStatsInterval) {
          var interval = window.setInterval(function() {
            if (pc.signalingState === 'closed') {
              window.clearInterval(interval);
              return;
            }
            getStats();
          }, getStatsInterval);
        }

        pc.addEventListener('iceconnectionstatechange', function() {
          if (pc.iceConnectionState === 'connected') {
            getStats();
          }
        });

        return pc;
      } catch (error) {
        // If something went wrong, return a normal PeerConnection
        console.error('RTCStats PeerConnection bind failed: ', error);

        return new origPeerConnection(origConfig, origConstraints);
      }
    };

    ['createDataChannel', 'close'].forEach(function(method) {
      var nativeMethod = origPeerConnection.prototype[method];
      if (nativeMethod) {
        origPeerConnection.prototype[method] = function() {
          try {
            trace(method, this.__rtcStatsId, arguments);
          } catch (error) {
            console.error(`RTCStats ${method} bind failed: `, error);
          }

          return nativeMethod.apply(this, arguments);
        };
      }
    });

    ['addStream', 'removeStream'].forEach(function(method) {
      var nativeMethod = origPeerConnection.prototype[method];
      if (nativeMethod) {
        origPeerConnection.prototype[method] = function() {
          try {
            var stream = arguments[0];
            var streamInfo = stream.getTracks().map(function(t) {
              return t.kind + ':' + t.id;
            }).join(',');

            trace(method, this.__rtcStatsId, stream.id + ' ' + streamInfo);
          }
          catch (error) {
            console.error(`RTCStats ${method} bind failed: `, error);
          }

          return nativeMethod.apply(this, arguments);
        };
      }
    });

    ['addTrack'].forEach(function(method) {
      var nativeMethod = origPeerConnection.prototype[method];
      if (nativeMethod) {
        origPeerConnection.prototype[method] = function() {
          try {
            var track = arguments[0];
            var streams = [].slice.call(arguments, 1);
            trace(method, this.__rtcStatsId, track.kind + ':' + track.id + ' ' + (streams.map(function(s) { return 'stream:' + s.id; }).join(';') || '-'));
          }
          catch (error) {
            console.error(`RTCStats ${method} bind failed: `, error);
          }

          return nativeMethod.apply(this, arguments);
        };
      }
    });

    ['removeTrack'].forEach(function(method) {
      var nativeMethod = origPeerConnection.prototype[method];
      if (nativeMethod) {
        origPeerConnection.prototype[method] = function() {
          try {
            var track = arguments[0].track;
            trace(method, this.__rtcStatsId, track ? track.kind + ':' + track.id : 'null');
          }
          catch (error) {
            console.error(`RTCStats ${method} bind failed: `, error);
          }

          return nativeMethod.apply(this, arguments);
        };
      }
    });

    ['createOffer', 'createAnswer'].forEach(function(method) {
      var nativeMethod = origPeerConnection.prototype[method];
      if (nativeMethod) {
        origPeerConnection.prototype[method] = function() {
          // The logic here extracts the arguments and establishes if the API
          // is callback or Promise based.
          var rtcStatsId = this.__rtcStatsId;
          var args = arguments;
          var opts;
          if (arguments.length === 1 && typeof arguments[0] === 'object') {
            opts = arguments[0];
          } else if (arguments.length === 3 && typeof arguments[2] === 'object') {
            opts = arguments[2];
          }

          // We can only put a "barrier" at this point because the above logic is
          // necessary in all cases, if something fails there we can't just bypass it.
          try {
            trace(method, this.__rtcStatsId, opts);
          } catch (error) {
            console.error(`RTCStats ${method} bind failed: `, error);
          }

          return nativeMethod.apply(this, opts ? [opts] : undefined)
          .then(function(description) {
            try {
              trace(method + 'OnSuccess', rtcStatsId, description);
            } catch (error) {
              console.error(`RTCStats ${method} promise success bind failed: `, error);
            }


            // We can't safely bypass this part of logic because it's necessary for Proxying this request.
            // It determines weather the call is callback or promise based.
            if (args.length > 0 && typeof args[0] === 'function') {
              args[0].apply(null, [description]);

              return undefined;
            }

            return description;
          }, function(err) {
            try {
              trace(method + 'OnFailure', rtcStatsId, err.toString());
            } catch (error) {
              console.error(`RTCStats ${method} promise failure bind failed: `, error);
            }

            // We can't safely bypass this part of logic because it's necessary for Proxying this request.
            // It determines weather the call is callback or promise based.
            if (args.length > 1 && typeof args[1] === 'function') {
              args[1].apply(null, [err]);

              return;
            }
            throw err;
          });
        };
      }
    });

    ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate'].forEach(function(method) {
      var nativeMethod = origPeerConnection.prototype[method];
      if (nativeMethod) {
        origPeerConnection.prototype[method] = function() {
          var rtcStatsId = this.__rtcStatsId;
          var args = arguments;

          try {
            trace(method, this.__rtcStatsId, args[0]);
          } catch (error) {
            console.error(`RTCStats ${method} bind failed: `, error);
          }

          return nativeMethod.apply(this, [args[0]])
          .then(function() {
            try {
              trace(method + 'OnSuccess', rtcStatsId, undefined);
            } catch (error) {
              console.error(`RTCStats ${method} promise success bind failed: `, error);
            }

            // We can't safely bypass this part of logic because it's necessary for Proxying this request.
            // It determines weather the call is callback or promise based.
            if (args.length >= 2 && typeof args[1] === 'function') {
              args[1].apply(null, []);
              return undefined;
            }
            return undefined;
          }, function(err) {
            try {
              trace(method + 'OnFailure', rtcStatsId, err.toString());
            } catch (error) {
              console.error(`RTCStats ${method} promise failure bind failed: `, error);
            }

            // We can't safely bypass this part of logic because it's necessary for Proxying this request.
            // It determines weather the call is callback or promise based
            if (args.length >= 3 && typeof args[2] === 'function') {
              args[2].apply(null, [err]);
              return undefined;
            }
            throw err;
          });
        };
      }
    });

    // wrap static methods. Currently just generateCertificate.
    if (origPeerConnection.generateCertificate) {
      Object.defineProperty(peerconnection, 'generateCertificate', {
        get: function() {
          return arguments.length ?
              origPeerConnection.generateCertificate.apply(null, arguments)
              : origPeerConnection.generateCertificate;
        },
      });
    }
    window[prefix + 'RTCPeerConnection'] = peerconnection;
    window[prefix + 'RTCPeerConnection'].prototype = origPeerConnection.prototype;
  });

  // getUserMedia wrappers
  prefixesToWrap.forEach(function(prefix) {
    var name = prefix + (prefix.length ? 'GetUserMedia' : 'getUserMedia');
    if (!navigator[name]) {
      return;
    }
    var origGetUserMedia = navigator[name].bind(navigator);
    var gum = function() {
      try {
        trace('getUserMedia', null, arguments[0]);
      } catch (error) {
        console.error(`RTCStats getUserMedia bind failed: `, error);
      }

      var cb = arguments[1];
      var eb = arguments[2];
      origGetUserMedia(arguments[0],
        function(stream) {
          try {
            trace('getUserMediaOnSuccess', null, dumpStream(stream));
          } catch (error) {
            console.error(`RTCStats getUserMediaOnSuccess bind failed: `, error);
          }
          // we log the stream id, track ids and tracks readystate since that is ended GUM fails
          // to acquire the cam (in chrome)
          if (cb) {
            cb(stream);
          }
        },
        function(err) {
          try {
            trace('getUserMediaOnFailure', null, err.name);
          } catch (error) {
            console.error(`RTCStats getUserMediaOnFailure bind failed: `, error);
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
    var origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    var gum = function() {
      try {
        trace('navigator.mediaDevices.getUserMedia', null, arguments[0]);
      } catch (error) {
        console.error(`RTCStats navigator.mediaDevices.getUserMedia bind failed: `, error);
      }

      return origGetUserMedia.apply(navigator.mediaDevices, arguments)
      .then(function(stream) {
        try {
          trace('navigator.mediaDevices.getUserMediaOnSuccess', null, dumpStream(stream));
        } catch (error) {
          console.error(`RTCStats navigator.mediaDevices.getUserMediaOnSuccess bind failed: `, error);
        }

        return stream;
      }, function(err) {
        try {
          trace('navigator.mediaDevices.getUserMediaOnFailure', null, err.name);
        } catch (error) {
          console.error(`RTCStats navigator.mediaDevices.getUserMediaOnFailure bind failed: `, error);
        }

        return Promise.reject(err);
      });
    };
    navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices);
  }

  // getDisplayMedia
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    var origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    var gdm = function() {
      try {
        trace('navigator.mediaDevices.getDisplayMedia', null, arguments[0]);
      } catch (error) {
        console.error(`RTCStats navigator.mediaDevices.getDisplayMedia bind failed: `, error);
      }

      return origGetDisplayMedia.apply(navigator.mediaDevices, arguments)
      .then(function(stream) {
        try {
          trace('navigator.mediaDevices.getDisplayMediaOnSuccess', null, dumpStream(stream));
        } catch (error) {
          console.error(`RTCStats navigator.mediaDevices.getDisplayMediaOnSuccess bind failed: `, error);
        }

        return stream;
      }, function(err) {
        try {
          trace('navigator.mediaDevices.getDisplayMediaOnFailure', null, err.name);
        } catch (error) {
          console.error(`RTCStats navigator.mediaDevices.getDisplayMediaOnFailure bind failed: `, error);
        }

        return Promise.reject(err);
      });
    };
    navigator.mediaDevices.getDisplayMedia = gdm.bind(navigator.mediaDevices);
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
};
