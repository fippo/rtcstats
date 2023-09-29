// obfuscate ip addresses which should not be stored long-term.

import SDPUtils from 'sdp';

/**
 * obfuscate ip, keeping address family intact.
 * @param {*} ip
 */
function maskIP(ip) {
    if (ip.indexOf('[') === 0 || ip.indexOf(':') !== -1) {
        // IPv6
        // obfuscate last five bits like Chrome does.
        return `${ip.split(':').slice(0, 3)
            .join(':')}:x:x:x:x:x`;
    }

    const parts = ip.split('.');

    if (parts.length === 4) {
        parts[3] = 'x';

        return parts.join('.');
    }

    return ip;
}

/**
 * Returns a simple IP mask.
 *
 * @returns masked IP.
 */
function obfuscateIP(ip) {
    if (ip.indexOf('[') === 0 || ip.indexOf(':') !== -1) {

        return 'x:x:x:x:x:x:x:x';
    }

    return 'x.x.x.x';
}

/**
 * obfuscate the ip in ice candidates. Does NOT obfuscate the ip of the TURN server to allow
 * selecting/grouping sessions by TURN server.
 * @param {*} candidate
 */
function obfuscateCandidate(candidate) {
    const cand = SDPUtils.parseCandidate(candidate);

    if (!(cand.type === 'relay' || cand.protocol === 'ssltcp')) {
        cand.ip = obfuscateIP(cand.ip);
        cand.address = obfuscateIP(cand.address);
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

    return `${lines
        .map(line => {
            // obfuscate a=candidate, c= and a=rtcp
            if (line.indexOf('a=candidate:') === 0) {
                return `a=${obfuscateCandidate(line)}`;
            } else if (line.indexOf('c=') === 0) {
                return 'c=IN IP4 0.0.0.0';
            } else if (line.indexOf('a=rtcp:') === 0) {
                return 'a=rtcp:9 IN IP4 0.0.0.0';
            }

            return line;
        })
        .join('\r\n')
        .trim()}\r\n`;
}

/**
 *
 * @param {*} stats
 */
function obfuscateStats(stats) {
    Object.keys(stats).forEach(id => {
        const report = stats[id];

        // TODO Safari and Firefox seem to be sending empty statistic files
        if (!report) {
            return;
        }

        // obfuscate different variants of how the ip is contained in different stats / versions.
        [ 'ipAddress', 'ip', 'address' ].forEach(address => {
            if (report[address] && report.candidateType !== 'relay') {
                report[address] = obfuscateIP(report[address]);
            }
        });
        [ 'googLocalAddress', 'googRemoteAddress' ].forEach(name => {
            // contains both address and port
            let port;
            let ip;
            let splitBy;

            // These fields also have the port, separate it first and the obfuscate.
            if (report[name]) {
                // IPv6 has the following format [1fff:0:a88:85a3::ac1f]:8001
                // IPv5 has the following format 127.0.0.1:8001
                if (report[name][0] === '[') {
                    splitBy = ']:';
                } else {
                    splitBy = ':';
                }

                [ ip, port ] = report[name].split(splitBy);

                report[name] = `${obfuscateIP(ip)}:${port}`;
            }
        });
    });
}

/**
 * Obfuscates the ip addresses from webrtc statistics.
 * NOTE. The statistics spec is subject to change, consider evaluating which statistics contain IP addresses
 * before usage.
 *
 * @param {*} data
 */
export default function(data) {
    switch (data[0]) {
    case 'addIceCandidate':
    case 'onicecandidate':
        if (data[2] && data[2].candidate) {

            const jsonRepr = data[2];

            jsonRepr.candidate = obfuscateCandidate(jsonRepr.candidate);
            data[2] = jsonRepr;
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
}
