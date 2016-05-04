##rtcstats.js
Low-level logging on peerconnection API calls and periodic getStats calls for analytics/debugging purposes

##Integration
Just one simple step: include rtcstats.js before any of your webrtc javascript. It will transparently modify the RTCPeerConnection objects and start sending data.

Integrating as a module is currently not supported.
