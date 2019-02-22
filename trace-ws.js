var PROTOCOL_VERSION = '2.0';
module.exports = function(wsURL) {
  var buffer = [];
  var connection = new WebSocket(wsURL + window.location.pathname, PROTOCOL_VERSION);
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
    var args = Array.prototype.slice.call(arguments);
    args.push(new Date().getTime());
    if (connection.readyState === 1) {
      connection.send(JSON.stringify(args));
    } else if (args[0] !== 'getstats') {
      buffer.push(args);
    }
  }
  return trace;
}
