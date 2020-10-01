// obfuscate ip addresses which should not be stored long-term.

const SDPUtils = require('sdp');

/**
 * Obfuscate ip, keeping address family intact.
 */
function obfuscateIP(ip) {
    if (ip.indexOf('[') === 0 || ip.indexOf(':') !== -1) { // IPv6
        return '::1';
    }
    const parts = ip.split('.');

    if (parts.length === 4) {
        parts[3] = 'x';

        return parts.join('.');
    }

    return ip;

}

/**
 * Obfuscate the ip in ice candidates. Does NOT obfuscate the ip of the TURN server to allow
 * selecting/grouping sessions by TURN server.
 * @param {*} candidate
 */
function obfuscateCandidate(candidate) {
    const cand = SDPUtils.parseCandidate(candidate);

    if (cand.type !== 'relay') {
        cand.ip = obfuscateIP(cand.ip);
    }
    if (cand.relatedAddress) {
        cand.relatedAddress = obfuscateIP(cand.relatedAddress);
    }

    return SDPUtils.writeCandidate(cand);
}

/**
 *
 * @param {*} sdp
 */
function obfuscateSDP(sdp) {
    const lines = SDPUtils.splitLines(sdp);

    return `${lines.map(line => {
        // obfuscate a=candidate, c= and a=rtcp
        if (line.indexOf('a=candidate:') === 0) {
            return obfuscateCandidate(line);
        } else if (line.indexOf('c=') === 0) {
            return 'c=IN IP4 0.0.0.0';
        } else if (line.indexOf('a=rtcp:') === 0) {
            return 'a=rtcp:9 IN IP4 0.0.0.0';
        }

        return line;

    }).join('\r\n')
.trim()}\r\n`;
}

/**
 *
 * @param {*} stats
 */
function obfuscateStats(stats) {
    Object.keys(stats).forEach(id => {
        const report = stats[id];

        if (report.ipAddress && report.candidateType !== 'relayed') {
            report.ipAddress = obfuscateIP(report.ipAddress);
        }
        [ 'googLocalAddress', 'googRemoteAddress' ].forEach(name => {
            // contains both address and port
            let port;

            if (report[name]) {
                if (report[name][0] === '[') {
                    port = report[name].substr(report[name].indexOf(']') + 2);
                } else {
                    port = report[name].substr(report[name].indexOf(':') + 1);
                }
                report[name] = `${obfuscateIP(report[name])}:${port}`;
            }
        });
    });
}

module.exports = function(data) {
    switch (data[0]) {
    case 'addIceCandidate':
    case 'onicecandidate':
        if (data[2] && data[2].candidate) {
            data[2].candidate = obfuscateCandidate(data[2].candidate);
        }
        break;
    case 'setLocalDescription':
    case 'setRemoteDescription':
    case 'createOfferOnSuccess':
    case 'createAnswerOnSuccess':
        if (data[2] && data[2].sdp) {
            data[2].sdp = obfuscateSDP(data[2].sdp);
        }
        break;
    case 'getStats':
    case 'getstats':
        if (data[2]) {
            obfuscateStats(data[2]);
        }
        break;
    default:
        break;
    }
};
