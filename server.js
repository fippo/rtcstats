var socketIO = require('socket.io');
var pem = require('pem');

var io = socketIO.listen(server);
var fs = require('fs');
var port = parseInt(process.env.PORT, 10) || 3000;
var server = null;

pem.createCertificate({ days: 1, selfSigned: true }, function (err, keys) {
    if (err) {
        console.err('error creating cert', err);
        return;
    }
    server = require('https').Server({
        key: keys.serviceKey,
        cert: keys.certificate
    });
    server.listen(port);

    var io = socketIO.listen(server);
    io.sockets.on('connection', function(client) {
        var referer = client.handshake.headers.referer;
        var ua = client.handshake.headers['user-agent'];
        console.log('connected', ua, referer);
        client.on('trace', function (data) {
            console.log(client.id, 'trace', data);
        });
    });
});
