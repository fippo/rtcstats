## rtcstats.js
Low-level logging on peerconnection API calls and periodic getStats calls for analytics/debugging purposes

This is a fork of https://github.com/fippo/rtcstats configured for typescript.  It no longer wraps WebRTC methods but instead takes in and logs stats from a `RTCPeerConnection` argument.

## Integration

```ts
import { rtcStats } from 'rtcstats';

const pc = new RTCPeerConnection();

// log peerconnection events with `console.log`, also calls `pc`'s `.getStats()` every 5 seconds.
rtcStats(pc, console.log, 5000);
```

### build
Install Depencies and run `yarn build`, output will be in the local `dist/` folder.
```
yarn
yarn build
```

### typescript
You may take the typescript file `rtcstats.ts` and drop it in your project.

```ts
import { rtcStats } from './my-project-utils/rtcstats';
```
