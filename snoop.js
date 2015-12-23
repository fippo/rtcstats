(function() {
  var getStats = require('./getstats-mangling');

  var io = require('socket.io-client');
  var connection = io.connect('https://localhost:3000/', {});
  var buffer = [];
  connection.on('connect', function () {
    console.log('connected');
    while (buffer.length) {
      connection.emit('trace', buffer.shift());
    }
    buffer = null;
  });
  function trace() {
    //console.log.apply(console, arguments);
    if (buffer === null) {
      connection.emit('trace', arguments);
    } else {
      buffer.push(arguments);
    }
  }

  if (window.webkitRTCPeerConnection || window.mozRTCPeerConnection) {
    var peerconnectioncounter = 0;
    var origPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    var isChrome = origPeerConnection === window.webkitRTCPeerConnection;
    var peerconnection = function(config, constraints) {
      var id = 'PC_' + peerconnectioncounter++;
      var pc = new origPeerConnection(config, constraints);
      var methods = ['addStream', 'removeStream',
          'createDataChannel', 'stop'
      ];
      methods.forEach(function(method) {
        var nativeMethod = pc[method];
        pc[method] = function() {
          trace(method, id, arguments);
          return nativeMethod.apply(pc, arguments);
        };
      });

      ['createOffer', 'createAnswer'].forEach(function(method) {
        var nativeMethod = pc[method];
        pc[method] = function() {
          var args = arguments;
          var opts = arguments.length === 1 && typeof(arguments[0]) === 'object' ? arguments[0] : undefined;
          trace(method, id, opts);
          return new Promise(function(resolve, reject) {
            nativeMethod.apply(pc, [
              function(description) {
                trace(method + 'OnSuccess', id, description);
                resolve(description);
                if (args.length > 0 && typeof(args[0]) === 'function') {
                  args[0].apply(null, [description]);
                }
              },
              function(err) {
                trace(method + 'OnFailure', id, err);
                reject(err);
                if (args.length > 1 && typeof(args[1]) === 'function') {
                  args[1].apply(null, [err]);
                }
              },
              opts
            ]);
          });
        };
      });

      ['setLocalDescription', 'setRemoteDescription',
          'addIceCandidate'].forEach(function(method) {
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

      var events = ['icecandidate', 'addstream', 'removestream',
          'signalingstatechange', 'iceconnectionstatechange',
          'negotiationneeded', 'datachannel'];
      events.forEach(function (e) {
        pc.addEventListener(e, function() {
          trace('on' + e, id, arguments);
        });
      });

      // TODO: do we want one big interval and all peerconnections
      //    queried in that or one setInterval per PC?
      //    we have to collect results anyway so...
      var interval = window.setInterval(function() {
        if (isChrome) {
          pc.getStats(function(res) {
            trace('getStats', id, getStats(pc, res));
          });
        } else {
          pc.getStats(null, function(res) {
            trace('getStats', id, res);
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
          if (arguments.length) {
            return origPeerConnection.generateCertificate.apply(null,
                arguments);
          } else {
            return origPeerConnection.generateCertificate;
          }
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
      trace('GUM', arguments);
      // TODO: hook success/failure callbacks
      return origGetUserMedia.apply(null, arguments);
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
      trace('GUM 2', arguments);
      // TODO: hook success/failure callbacks
      return gum2.apply(navigator.mediaDevices, arguments);
    };
  }
  // TODO: are there events defined on MST that would allow us to listen when enabled was set?
  //    no :-(
  /*^
  Object.defineProperty(MediaStreamTrack.prototype, 'enabled', {
    set: function(value) {
      trace('MediaStreamTrackEnable', this, value);
    }
  });
  */
}());
