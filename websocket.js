'use strict';
var fs = require('fs');
var uuid = require('uuid');
var obfuscate = require('./obfuscator');
var os = require('os');

var WebSocketServer = require('ws').Server;

var wss = null;

var server;
var tempPath = 'temp';

function setupWorkDirectory() {
    try {
        fs.readdirSync(tempPath).forEach(function(fname) {
            fs.unlinkSync(tempPath + '/' + fname);
        });
        fs.rmdirSync(tempPath);
    } catch(e) {
        console.error('work dir ' + tempPath + ' does not exist, please create it');
    }
    fs.mkdirSync(tempPath);
}

function run(keys) {
    setupWorkDirectory();

    if (keys === undefined) {
      server = require('http').Server(() => { });
    } else {
      server = require('https').Server({
          key: keys.serviceKey,
          cert: keys.certificate,
      }, () => { });
    }

    server.listen(8000);
    server.on('request', function(request, response) {
        // look at request.url
        switch (request.url) {
        case "/healthcheck":
            response.writeHead(200);
            response.end();
            return;
        default:
            response.writeHead(404);
            response.end();
        }
    });

    wss = new WebSocketServer({ server: server });

    wss.on('connection', function(client) {
        // the url the client is coming from
        var referer = client.upgradeReq.headers['origin'] + client.upgradeReq.url;
        // TODO: check against known/valid urls

        var ua = client.upgradeReq.headers['user-agent'];
        var clientid = uuid.v4();
        var tempStream = fs.createWriteStream(tempPath + '/' + clientid);
        tempStream.on('finish', function() {
            // do something like processing the file and extracting the data.
            console.log('finished gathering data in ' + tempPath + '/' + clientid);
        });

        var meta = {
            path: client.upgradeReq.url,
            origin: client.upgradeReq.headers['origin'],
            url: referer,
            userAgent: ua,
            time: Date.now()
        };
        tempStream.write(JSON.stringify(meta) + '\n');

        console.log('connected', ua, referer);
        client.on('message', function (msg) {
            var data = JSON.parse(msg);
            switch(data[0]) {
            case 'getUserMedia':
            case 'getUserMediaOnSuccess':
            case 'getUserMediaOnFailure':
            case 'navigator.mediaDevices.getUserMedia':
            case 'navigator.mediaDevices.getUserMediaOnSuccess':
            case 'navigator.mediaDevices.getUserMediaOnFailure':
                data.time = Date.now();
                tempStream.write(JSON.stringify(data) + '\n');
                break;
            default:
                obfuscate(data);
                data.time = Date.now();
                tempStream.write(JSON.stringify(data) + '\n');
                break;
            }
        });

        client.on('close', function() {
            tempStream.end();
            tempStream = null;
        });
    });
}

function stop() {
    if (server) {
        server.close();
    }
}

run();

module.exports = {
    stop: stop
};
