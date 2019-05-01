var PROTOCOL_VERSION = '2.0';
module.exports = function(wsURL) {
  var buffer;
  var connection;
  var trace = function() {
    //console.log.apply(console, arguments);
    // TODO: drop getStats when not connected?
    var args = Array.prototype.slice.call(arguments);
    args.push(new Date().getTime());
    if (args[1] instanceof RTCPeerConnection) {
      args[1] = args[1].__rtcStatsId;
    }
    if (connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify(args));
    } else if (connection.readyState >= WebSocket.CLOSING) {
      // no-op. Possibly log?
    } else if (args[0] !== 'getstats') {
      buffer.push(args);
    }
  };

  trace.close = function() {
    connection.close();
  };
  trace.connect = function() {
    buffer = [];
    if (connection) {
      connection.close();
    }
    connection = new WebSocket(wsURL + window.location.pathname, PROTOCOL_VERSION);
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
  };
  trace.connect();
  return trace;
};
