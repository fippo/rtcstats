## rtcstats.js
Low-level logging on peerconnection API calls and periodic getStats calls for analytics/debugging purposes

## Integration
Just one simple step: include rtcstats.js before any of your webrtc javascript.
```
<script src='/path/to/rtcstats.js></script>
```
It will transparently modify the RTCPeerConnection objects and start sending data.
If you need things like a client or conference identifier to be sent along, the recommended way is to use the legacy peerconnection constraints when constructing your RTCPeerConnection like this:
```
var pc = new RTCPeerConnection(yourConfiguration, {
  optional: [
    {rtcStatsClientId: "your client identifier"},
    {rtcStatsPeerId: "identifier for the current peer"},
    {rtcStatsConferenceId: "identifier for the conference, e.g. room name"}
  ]
})
```

### requiring as module
```
require('./rtcstats')(
    'wss://rtcstats.tokbox.com', // url-to-your-websocker-server
    1000, // interval at which getStats will be polled,
    ['', 'webkit', 'moz'] // RTCPeerConnection prefixes to wrap.
);
```
When using ontop of adapter it is typically not necessary (and potentially harmful to shim the webkit and moz prefixes in addition to the unprefixed version.

## Importing the dumps
The dumps generated can be imported and visualized using [this tool](https://fippo.github.io/webrtc-dump-importer/rtcstats)
