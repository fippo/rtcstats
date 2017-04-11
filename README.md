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

Integrating as a module is currently not supported.

## Importing the dumps
The dumps generated can be imported and visualized using [this tool](https://fippo.github.io/webrtc-dump-importer/rtcstats)
