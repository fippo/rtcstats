var socketIO = require('socket.io');
var pem = require('pem');

var io = socketIO.listen(server);
var fs = require('fs');
var port = parseInt(process.env.PORT, 10) || 3000;
var server = null;

var db = {};
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

        if (!db[referer]) db[referer] = {};
        db[referer][client.id] = {
            userAgent: ua,
            peerConnections: {}
        };

        console.log('connected', ua, referer);
        client.on('trace', function (data) {
            switch(data[0]) {
            case 'getStats':
                console.log(client.id, 'getStats', data[1]);
                break;
            default:
                console.log(client.id, data[0], data[1], data[2]);
                if (!db[referer][client.id].peerConnections[data[1]]) {
                    db[referer][client.id].peerConnections[data[1]] = {
                        updateLog: []
                    };
                }
                db[referer][client.id].peerConnections[data[1]].updateLog.push({
                    time: new Date(),
                    type: data[0],
                    value: JSON.stringify(data[2])
                });
                break;
            }
        });
    });
});

process.on('SIGINT', function() {
    var silly = {
        PeerConnections: {}
    };
    Object.keys(db).forEach(function(origin) {
        Object.keys(db[origin]).forEach(function(clientid) {
            var client = db[origin][clientid];
            Object.keys(client.peerConnections).forEach(function(connid) {
                var conn = client.peerConnections[connid];
                silly.PeerConnections[origin + '#' + clientid + '_' + connid] = {
                    updateLog: conn.updateLog
                };
            });
        });
    });
    fs.writeFileSync('dump.json', JSON.stringify(silly));
    process.exit();
});
