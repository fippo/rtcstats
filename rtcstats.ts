import { v4 } from 'uuid';

/**
 * RTCStatsReport Interface with missing items from typescript type definitions.
 */
interface StatsReport extends RTCStatsReport {
  size: number;
  timestamp: number;
}

/**
 * Copies values of any nested depth.
 *
 * @param value - The value to be copied.
 * @returns - Copied value.
 */
const deepCopy = <T>(value: unknown): T => JSON.parse(JSON.stringify(value));

/**
 * Translates a RTCStatsReport into an object.
 *
 * @param report - The report.
 * @returns - A deduped object.
 */
const map2obj = (report: StatsReport) => {
  if (!report.size) {
    return report;
  }
  const o = {};
  report.forEach((value: unknown, key: string) => {
    o[key] = value;
  });
  return o;
};

/**
 * Apply a delta compression to the stats report. Reduces size by ~90%.
 * To reduce further, report keys could be compressed.
 *
 * @param oldStats - Previous report items that we dedupe against.
 * @param newStats - New incoming stats.
 * @returns - Compressed Stats.
 */
const deltaCompression = (oldStats: StatsReport, newStats: StatsReport): StatsReport => {
  const updatedStats = deepCopy<StatsReport>(newStats);

  Object.keys(updatedStats).forEach((id: string) => {
    const report = updatedStats[id];
    delete report.id;
    if (!oldStats[id]) {
      return;
    }

    Object.keys(report).forEach((name: string) => {
      if (report[name] === oldStats[id][name]) {
        delete updatedStats[id][name];
      }
      if (
        Object.keys(report).length === 0 ||
        (Object.keys(report).length === 1 && report.timestamp)
      ) {
        delete updatedStats[id];
      }
    });
  });

  let timestamp = -Infinity;
  Object.keys(updatedStats).forEach((id: string) => {
    const report = updatedStats[id];
    if (report.timestamp > timestamp) {
      timestamp = report.timestamp;
    }
  });

  Object.keys(updatedStats).forEach((id: string) => {
    const report = updatedStats[id];
    if (report.timestamp === timestamp) {
      report.timestamp = 0;
    }
  });
  updatedStats.timestamp = timestamp;

  return updatedStats;
};

/**
 * Attach a Peer Connection to periodically get updated on events and stats.
 *
 * @param pc - Peer Connection in which we attach.
 * @param logger - Logging function to log events and stats.
 * @param intervalTime - Time between each `getStats` check.
 * @param id - Optional id string used for logging.
 */
export const rtcStats = (
  pc: RTCPeerConnection,
  logger: (...args: unknown[]) => void,
  intervalTime: number,
  id = v4()
): void => {
  let prev: StatsReport = {} as StatsReport;

  /**
   * Log stats or event data with additional tracking information.
   *
   * @param args - Array of parameters to log of any type.
   */
  const trace = (...args: unknown[]): void => {
    logger('[rtcstats]', id, ...args);
  };

  trace('creating stats report');

  pc.addEventListener('icecandidate', (e) => {
    trace('onicecandidate', e.candidate);
  });

  pc.addEventListener('track', (e) => {
    trace(
      'ontrack',
      `${e.track.kind}:${e.track.id} ${e.streams.map(
        (stream: MediaStream) => `stream:${stream.id}`
      )}`
    );
  });

  pc.addEventListener('signalingstatechange', () => {
    trace('onsignalingstatechange', pc.signalingState);
  });

  pc.addEventListener('iceconnectionstatechange', () => {
    trace('oniceconnectionstatechange', pc.iceConnectionState);
  });

  pc.addEventListener('icegatheringstatechange', () => {
    trace('onicegatheringstatechange', pc.iceGatheringState);
  });

  pc.addEventListener('connectionstatechange', () => {
    trace('onconnectionstatechange', pc.connectionState);
  });

  pc.addEventListener('negotiationneeded', () => {
    trace('onnegotiationneeded', undefined);
  });

  pc.addEventListener('datachannel', (event) => {
    trace('ondatachannel', [event.channel.id, event.channel.label]);
  });

  const interval = window.setInterval(() => {
    if (pc.signalingState === 'closed') {
      window.clearInterval(interval);
      return;
    }

    pc.getStats(null).then((res: RTCStatsReport) => {
      const now = map2obj(res as StatsReport);
      const base = deepCopy<StatsReport>(now); // our new prev
      trace('stats-report', deltaCompression(prev, now as StatsReport));
      prev = base;
    });
  }, intervalTime);
};
