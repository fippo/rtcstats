##rtcstats.js
Low-level logging on peerconnection API calls and periodic getStats calls for analytics/debugging purposes

##Integration
Just one simple step: include rtcstats.js before any of your webrtc javascript.
```
<script src='/path/to/rtcstats.js></script>
```

It will transparently modify the RTCPeerConnection objects and start sending data.

Integrating as a module is currently not supported.

##Importing the dumps
The dumps generated can be imported and visualized using [this tool](https://fippo.github.io/webrtc-dump-importer/rtcstats)
