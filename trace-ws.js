var PROTOCOL_VERSION = '2.0';

function sendPing(ws) {
  ws.send('__ping__');
}

export default function(wsURL, onCloseCallback, pingInterval = 30000) {
  var buffer = [];
  var connection = undefined;
  var keepAliveInterval = undefined;

  var trace = function() {
    //console.log.apply(console, arguments);
    // TODO: drop getStats when not connected?
    var args = Array.prototype.slice.call(arguments);
    args.push(new Date().getTime());
    if (args[1] instanceof RTCPeerConnection) {
      args[1] = args[1].__rtcStatsId;
    }
    if (connection && (connection.readyState === WebSocket.OPEN)) {
      connection.send(JSON.stringify(args));
    } else if (connection && (connection.readyState >= WebSocket.CLOSING)) {
      // no-op
    } else if (buffer.length < 300) {
      // We need to cache the initial getStats calls as they are used by the delta compression algorithm and
      // without the data from the initial calls the server wouldn't know how to decompress.
      // Ideally we wouldn't reach this limit as the connect should fairly soon after the PC init, but just
      // in case add a limit to the buffer, so we don't transform this into a memory leek.
      buffer.push(args);
    }
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
    connection = new WebSocket(wsURL + window.location.pathname, PROTOCOL_VERSION);

    connection.onclose = function(closeEvent) {
      keepAliveInterval && clearInterval(keepAliveInterval);
      // reconnect?
      onCloseCallback({ code: closeEvent.code, reason: closeEvent.reason});
    };

    connection.onopen = function() {
      keepAliveInterval = setInterval(sendPing.bind(null, connection), pingInterval);

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
  //trace.connect();
  return trace;
};
