# Jitsi rtcstats client
Rtcstats client [fork](https://github.com/fippo/rtcstats) tailored for jitsi-meet integration. Server repository can be found here [rtcstats-servers](https://github.com/jitsi/rtcstats-server).

## Description
The rtcstats ecosystem consists of a javascript client library which sends statistics and a node.js server which gathers and processes them.

This repo represents the client side component. It's meant to run in a browsers/electron environment which exposes GUM and WebRTC standard functionality.

In short, once integrated, the library overwrites `GUM` and `RTCPeerConnection` functionality and proxies most calls and events going through them, sending the gathered data via a websocket to the rtcstats-server. On top of that, each newly created RTCPeerConnection has a configured interval set for it, which calls getStats periodically, this too is sent to the rtcstats-server.

## Installation
The project is organised as simple ES6 modules that can be easily imported into jitsi-meet. Originally rtcstats had a more generic approach and was bundled for maximum compatibility, this created issues when importing into jitsi-meet so that option is no longer supported, it now relies on jitsi-meet to do bundling and transpiling.

To install simply.
```
npm install github:jitsi/rtcstats#vx.x.x
```

## Usage
In order to initialise rtcstats the following steps are required:
```javascript
import rtcstatsInit from 'rtcstats/rtcstats';
import traceInit from 'rtcstats/trace-ws';

/**
 * Initialises the trace object which is the channel that rtcstats uses to send data.
 *
 * @rtcstatsEndpoint - rtcstats-server endpoint ex: "wss:\\sample-rtcstata-endpoing.org:3000"
 * @handleTraceWSClose - callback for handling websocket closed event.
 */
const trace = traceInit(rtcstatsEndpoint, handleTraceWSClose);

/**
 * Initialises rtcstats, overwrites GUM and RTCPeerConnection and starts sending data.
 *
 * @trace - trace channel on which data is sent.
 * @pollInterval - interval at which getStats is called and sent.
 * @prefixesToWrap - legacy RTCPeerConnection prefixes for older browser compatibility. Almost all browser now support the RTCPeerConnection API so it can be left empty
 * @connectionFilter - callback used to filter out RTCPeerConnections based on their config.
 */
rtcstatsInit(trace, pollInterval, ['', 'webkit', 'moz'], connectionFilter);
```
Because `GUM` and `RTCPeerConnection` are overwritten, rtcstats needs to be initialized before any aliases to them are created. For instance lib-jitsi-meet doesn't directly call these functions but rather has references, thus initializing rtcstats after lib-jitsi-meet would result in the original methods being called and
not those that are proxied.

If you need things like a client or conference identifier to be sent along, the recommended way is to use the legacy peerconnection constraints when constructing your RTCPeerConnection like this:

```javascript
var pc = new RTCPeerConnection(yourConfiguration, {
  optional: [
    {rtcStatsClientId: "your client identifier"},
    {rtcStatsPeerId: "identifier for the current peer"},
    {rtcStatsConferenceId: "identifier for the conference, e.g. room name"}
  ]
})
```

If that integration is not possible there is a fallback integration which allows
sending per-client information about the user id and conference id. This
can be used by calling
```javascript
trace('identity', null, {user: 'your client identifier',
    conference:'identifier for the conference, e.g. room name'});
```

When using ontop of adapter it is typically not necessary (and potentially harmful) to shim the webkit and moz prefixes in addition to the unprefixed version.

## Details
The client overwrites and proxies the following functions and associated events:
* getUserMedia, getDisplayMedia. Data such as parameters which gum used and the outcome of the operation is sent to the server.
* RTCPeerConnection.
  Constructor parameters are sent to the server.
  By having control over the c’tor  the client adds listeners to several events of interest on a newly created peer connection object, such as.
  * icecandidate
  * addstream
  * track
  * removestream
  * signalingstatechange
  * iceconnectionstatechange
  * icegatheringstatechange
  * connectionstatechange
  * negotiationneeded
  * datachannel

Data regarding each event is sent to the server.

RTCPeerConnection methods are also hooked into and parameters sent to the server:
* createDataChannel
* addStream, removeStream
* addTrack
* removeTrack
* addTransceiver
* createOffer
* createAnswer
* setLocalDescription
* setRemoteDescription
* addIceCandidate

When a participant leaves a conference, the server will have a complete overview of the gum and peer connection flows.
At this point the server will begin extracting a “feature set”, which is sent to a database, once this is complete the statistics dump is stored on s3.
The s3 dump can be visualized, giving you an almost chrome://webrtc-internals view of the participants sessions see [Importing the dumps](##-Importing-the-dumps).

## Importing the dumps
The dumps generated can be imported and visualized using [this tool](https://fippo.github.io/webrtc-dump-importer/rtcstats)

## Authors and acknowledgment
The project is a fork of https://github.com/fippo/rtcstats thus proper thanks are in order to the original contributors.
