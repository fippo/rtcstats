import {wrapWebRTC} from '../../rtcstats.js';
import {createTestSink} from '../sink.js';

const sdp = `v=0
o=- 0 3 IN IP4 127.0.0.1
s=-
t=0 0
a=fingerprint:sha-256 A7:24:72:CA:6E:02:55:39:BA:66:DF:6E:CC:4C:D8:B0:1A:BF:1A:56:65:7D:F4:03:AD:7E:77:43:2A:29:EC:93
a=ice-ufrag:6HHHdzzeIhkE0CKj
a=ice-pwd:XYDGVpfvklQIEnZ6YnyLsAew
m=audio 9 RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=rtcp-mux
a=sendonly
a=mid:audio
a=rtpmap:111 opus/48000/2
a=setup:actpass
a=msid:streamid trackid 
`;
const candidateSdp = 'a=candidate:1595511860 1 udp 2122262783 127.0.0.1 36538 typ host generation 0 ufrag HjHI\r\n';

let rtcStats;
let testSink;
before(() => {
    before(() => {
        testSink = createTestSink();
        rtcStats = wrapWebRTC(testSink.trace, 1000, ['']);
    });
    beforeEach(() => {
        testSink.reset();
    });
});

describe('RTCPeerConnection', () => {
    describe('peerconnection creation', () => {
        it('traces the creation', () => {
            const now = Date.now();
            const pc = new RTCPeerConnection();

            const events = testSink.reset();
            expect(events.length).to.equal(1);
            expect(events[0][0]).to.equal('create');
            expect(events[0][1]).to.equal(pc.__rtcStatsId);
            expect(events[0][2]).to.be.an('object');
            expect(events[0][3] - now).to.be.below(1000); // less than 1000ms.
        });

        it('increments the peerconnection index', () => {
            const pc1 = new RTCPeerConnection();
            const pc2 = new RTCPeerConnection();

            const events = testSink.reset();
            expect(events.length).to.equal(2);
            expect(events[0][1]).to.equal(pc1.__rtcStatsId);
            expect(events[1][1]).to.equal(pc2.__rtcStatsId);
        });

        it('serializes the RTCConfiguration', () => {
            const configuration = {iceServers: []};
            const pc = new RTCPeerConnection(configuration);
            configuration.browserType = 'webkit';

            const events = testSink.reset();
            expect(events.length).to.equal(1);
            expect(events[0][2]).to.deep.equal(configuration);
        });

        it('removes turn credentials from the configuration', () => {
            const configuration = {iceServers: [{
              urls: 'turn:example.com',
              username: 'test',
              credential: 'test',
            }]};
            const pc = new RTCPeerConnection(configuration);
            configuration.browserType = 'webkit';

            // Check that the original config was not modified, then delete it.
            expect(configuration.iceServers[0].credential).to.equal('test');
            delete configuration.iceServers[0].credential;

            const events = testSink.reset();
            expect(events.length).to.equal(1);
            expect(events[0][2]).to.deep.equal(configuration);
        });

        it('serializes the legacy constraints argument if present', () => {
            const legacyConstraints = {};
            const pc = new RTCPeerConnection(null, legacyConstraints);

            const events = testSink.reset();
            expect(events.length).to.equal(2);
            expect(events[1][0]).to.equal('constraints');
            expect(events[1][2]).to.equal(legacyConstraints);
        });
    });

    describe('createOffer', () => {
        it('serializes without legacy constraints', async () => {
            const pc = new RTCPeerConnection();
            const offer = await pc.createOffer();

            const events = testSink.reset();
            expect(events.length).to.equal(3);
            expect(events[1]).to.have.length(4);
            expect(events[1][0]).to.equal('createOffer');
            expect(events[1][2]).to.equal(undefined);
        });

        it('serializes legacy constraints', async () => {
            const pc = new RTCPeerConnection();
            const legacyConstraints = {offerToReceiveAudio: true};
            const offer = await pc.createOffer(legacyConstraints);

            const events = testSink.reset();
            expect(events.length).to.equal(3);
            expect(events[1]).to.have.length(4);
            expect(events[1][0]).to.equal('createOffer');
            expect(events[1][2]).to.deep.equal(legacyConstraints);
        });

        it('serializes legacy constraints with legacy callbacks', async () => {
            const pc = new RTCPeerConnection();
            const legacyConstraints = {offerToReceiveAudio: true};
            const noop = () => {};
            const offer = await pc.createOffer(noop, noop, legacyConstraints);

            const events = testSink.reset();
            expect(events.length).to.equal(3);
            expect(events[1]).to.have.length(4);
            expect(events[1][0]).to.equal('createOffer');
            expect(events[1][2]).to.deep.equal(legacyConstraints);
        });

        it('serializes the result', async () => {
            const pc = new RTCPeerConnection();
            const offer = await pc.createOffer();

            const events = testSink.reset();
            expect(events.length).to.equal(3);
            expect(events[2]).to.have.length(4);
            expect(events[2][0]).to.equal('createOfferOnSuccess');
            expect(events[2][2].type).to.equal('offer');
            expect(events[2][2].sdp).to.be.a('string');
        });
    });

    describe('setLocalDescription', () => {
        it('serializes implicit SLD', async () => {
            const pc = new RTCPeerConnection();
            await pc.setLocalDescription();

            const events = testSink.reset();
            expect(events.length).to.equal(4);
            expect(events[3]).to.have.length(4);
            expect(events[3][0]).to.equal('setLocalDescriptionOnSuccess');
            // TODO: to be defined, this should get the SDP.
            expect(events[3][2]).to.equal(undefined);
        });
    });

    describe('addTrack', () => {
        it('serializes the track in the expected format if there is a stream', async () => {
            const pc = new RTCPeerConnection();
            const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const events = testSink.reset();
            expect(events.length).to.equal(5);
            expect(events[3][0]).to.equal('addTrack');
            expect(events[3][2]).to.equal(stream.getTracks()[0].kind + ':' + stream.getTracks()[0].id + ' stream:' + stream.id);
            expect(events[4][0]).to.equal('addTrack');
            expect(events[4][2]).to.equal(stream.getTracks()[1].kind + ':' + stream.getTracks()[1].id + ' stream:' + stream.id);
        });

        it('serializes the track in the expected format if there is no stream', async () => {
            const pc = new RTCPeerConnection();
            const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
            stream.getTracks().forEach(t => pc.addTrack(t));

            const events = testSink.reset();
            expect(events.length).to.equal(5);
            expect(events[3][0]).to.equal('addTrack');
            expect(events[3][2]).to.equal(stream.getTracks()[0].kind + ':' + stream.getTracks()[0].id + ' -');
            expect(events[4][0]).to.equal('addTrack');
            expect(events[4][2]).to.equal(stream.getTracks()[1].kind + ':' + stream.getTracks()[1].id + ' -');
        });
    });

    describe('addStream', () => {
        it('serializes the stream in the expected format', async () => {
            const pc = new RTCPeerConnection();
            const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
            pc.addStream(stream);

            const events = testSink.reset();
            expect(events.length).to.equal(4);
            expect(events[3][0]).to.equal('addStream');
            expect(events[3][2]).to.equal(stream.id + ' ' + stream.getTracks().map(t => t.kind + ':' + t.id).join(','));
        });
    });

    describe('removeTrack', () => {
        it('serializes the stream in the expected format', async () => {
            const pc = new RTCPeerConnection();
            const stream = await navigator.mediaDevices.getUserMedia({video: true});
            const track = stream.getTracks()[0];
            const sender = pc.addTrack(track, stream);
            pc.removeTrack(sender);

            const events = testSink.reset();
            expect(events.length).to.equal(5);
            expect(events[4][0]).to.equal('removeTrack');
            expect(events[4][2]).to.equal(track.kind + ':' + track.id);
        });
    });

    describe('close', () => {
        it('serializes the event in the expected format', async () => {
            const pc = new RTCPeerConnection();
            pc.close();

            const events = testSink.reset();
            expect(events.length).to.equal(2);
            expect(events[1][0]).to.equal('close');
            // TODO: how to deal with raw arguments array (also for datachannel)?
            // expect(events[1][2]).to.equal(undefined);
        });
    });

    describe('event handlers', () => {
        it('serializes signalingstatechange', async () => {
            const pc = new RTCPeerConnection();
            // offer without m-lines, intentionally.
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const events = testSink.reset();

            const ev = events.find(e => e[0] == 'onsignalingstatechange');
            expect(ev[0]).to.equal('onsignalingstatechange');
            expect(ev[2]).to.equal('have-local-offer');
        });

        it('serializes negotiationneeded', async () => {
            const pc = new RTCPeerConnection();
            const onn = new Promise(resolve => {
                pc.onnegotiationneeded = () => {
                    pc.onnegotiationneeded = null;
                    resolve();
                };
            });
            pc.createDataChannel('somechannel');
            await onn

            const events = testSink.reset();
            const ev = events.find(e => e[0] == 'onnegotiationneeded');
            expect(ev[0]).to.equal('onnegotiationneeded');
            expect(ev[2]).to.equal(undefined);
        });

        it('serializes icecandidate and icegatheringstatechange', async () => {
            const pc = new RTCPeerConnection();
            pc.createDataChannel('somechannel');
            const gathered = new Promise(resolve => {
                pc.onicecandidate = (e) => {
                    pc.onicecandidate = null;
                    resolve(e.candidate);
                };
            });
            await pc.setLocalDescription();
            const candidate = await gathered;

            const events = testSink.reset();
            const candidateEvent = events.find(e => e[0] === 'onicecandidate');
            expect(candidateEvent[0]).to.equal('onicecandidate');
            expect(candidateEvent[2]).to.equal(candidate);

            const gatheringEvent = events.find(e => e[0] === 'onicegatheringstatechange');
            expect(gatheringEvent[0]).to.equal('onicegatheringstatechange');
            expect(gatheringEvent[2]).to.equal('gathering');
        });

        it('serializes iceconnectionstatechange', async () => {
            const pc = new RTCPeerConnection();
            const gathered = new Promise(resolve => {
                pc.onicecandidate = (e) => {
                    pc.onicecandidate = null;
                    resolve(e.candidate);
                };;
            });
            await pc.setRemoteDescription({type: 'offer', sdp: sdp + candidateSdp});
            await pc.setLocalDescription();
            const candidate = await gathered;
            const events = testSink.reset();
            const ev = events.find(e => e[0] === 'oniceconnectionstatechange');
            expect(ev[0]).to.equal('oniceconnectionstatechange');
            expect(ev[2]).to.equal('checking');
        });

        it('serializeѕ ontrack and onaddstream', async () => {
            const pc = new RTCPeerConnection();
            await pc.setRemoteDescription({type: 'offer', sdp});
            const events = testSink.reset();
            expect(events.length).to.equal(6);
            const streamEvent = events.find(e => e[0] === 'onaddstream');
            expect(streamEvent[0]).to.equal('onaddstream');
            expect(streamEvent[2]).to.equal('streamid audio:trackid ');

            const trackEvent = events.find(e => e[0] === 'ontrack');
            expect(trackEvent[0]).to.equal('ontrack');
            expect(trackEvent[2]).to.equal('audio:trackid  stream:streamid');
        });
    });
});

describe('getUserMedia and getDisplayMedia', () => {
    describe('navigator.getUserMedia', () => {
        it('traces getUserMediaOnSuccess when successful', async () => {
            const constraints = {audio: true, video: true};
            const stream = await new Promise(r => navigator.getUserMedia(constraints, r));

            const events = testSink.reset();
            expect(events.length).to.equal(2);

            const gumCall = events.shift();
            expect(gumCall[0]).to.equal('getUserMedia');
            expect(gumCall[1]).to.equal(null);
            expect(gumCall[2]).to.deep.equal(constraints);

            const gumResult = events.shift();
            expect(gumResult[0]).to.equal('getUserMediaOnSuccess');
            expect(gumResult[1]).to.equal(null);
            expect(gumResult[2]).to.deep.equal({
                id: stream.id,
                tracks: stream.getTracks().map(track => ({
                    id: track.id,
                    kind: track.kind,
                    label: track.label,
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState,
                })),
            });
        });

        it('traces getUserMediaOnFailure when unsuccessful', async () => {
            const constraints = {video: {width: {min: 65536}, height: 65536}};
            const err = await new Promise(r => navigator.getUserMedia(constraints, undefined , r));

            const events = testSink.reset();
            expect(events.length).to.equal(2);

            const gumCall = events.shift();
            expect(gumCall[0]).to.equal('getUserMedia');
            expect(gumCall[1]).to.equal(null);
            expect(gumCall[2]).to.deep.equal(constraints);

            const gumResult = events.shift();
            expect(gumResult[0]).to.equal('getUserMediaOnFailure');
            expect(gumResult[1]).to.equal(null);
            expect(gumResult[2]).to.equal(err.name);
        });
    });

    describe('mediaDevices.getUserMedia', () => {
        it('traces getUserMediaOnSuccess when successful', async () => {
            const constraints = {audio: true, video: true};
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            const events = testSink.reset();
            expect(events.length).to.equal(2);

            const gumCall = events.shift();
            expect(gumCall[0]).to.equal('navigator.mediaDevices.getUserMedia');
            expect(gumCall[1]).to.equal(null);
            expect(gumCall[2]).to.deep.equal(constraints);

            const gumResult = events.shift();
            expect(gumResult[0]).to.equal('navigator.mediaDevices.getUserMediaOnSuccess');
            expect(gumResult[1]).to.equal(null);
            expect(gumResult[2]).to.deep.equal({
                id: stream.id,
                tracks: stream.getTracks().map(track => ({
                    id: track.id,
                    kind: track.kind,
                    label: track.label,
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState,
                })),
            });
        });

        it('traces getUserMediaOnFailure when unsuccessful', async () => {
            const constraints = {video: {width: {min: 65536}, height: 65536}};
            let err;
            try {
                await navigator.mediaDevices.getUserMedia(constraints);
            } catch(e) { err = e; }
            expect(err).not.to.equal(undefined);

            const events = testSink.reset();
            expect(events.length).to.equal(2);

            const gumCall = events.shift();
            expect(gumCall[0]).to.equal('navigator.mediaDevices.getUserMedia');
            expect(gumCall[1]).to.equal(null);
            expect(gumCall[2]).to.deep.equal(constraints);

            const gumResult = events.shift();
            expect(gumResult[0]).to.equal('navigator.mediaDevices.getUserMediaOnFailure');
            expect(gumResult[1]).to.equal(null);
            expect(gumResult[2]).to.equal(err.name);
        });
    });

    describe('mediaDevices.getDisplayMedia', () => {
        let title;
        beforeEach(() => {
            title = window.title;
            document.title = 'rtcstats-e2e-tests';
        });
        afterEach(() => {
            document.title = title;
        });
        it('traces getDisplayMediaOnSuccess', async () => {
            const constraints = {video: true};
            const stream = await navigator.mediaDevices.getDisplayMedia(constraints);

            const events = testSink.reset();
            expect(events.length).to.equal(2);

            const gumCall = events.shift();
            expect(gumCall[0]).to.equal('navigator.mediaDevices.getDisplayMedia');
            expect(gumCall[1]).to.equal(null);
            expect(gumCall[2]).to.deep.equal(constraints);

            const gumResult = events.shift();
            expect(gumResult[0]).to.equal('navigator.mediaDevices.getDisplayMediaOnSuccess');
            expect(gumResult[1]).to.equal(null);
            expect(gumResult[2]).to.deep.equal({
                id: stream.id,
                tracks: stream.getTracks().map(track => ({
                    id: track.id,
                    kind: track.kind,
                    label: track.label,
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState,
                })),
            });
        });

        it('traces getDisplayMediaOnFailure when unsuccessful', async () => {
            const constraints = {video: {width: {min: 65536}, height: 65536}};
            let err;
            try {
                await navigator.mediaDevices.getDisplayMedia(constraints);
            } catch(e) { err = e; }
            expect(err).not.to.equal(undefined);

            const events = testSink.reset();
            expect(events.length).to.equal(2);

            const gumCall = events.shift();
            expect(gumCall[0]).to.equal('navigator.mediaDevices.getDisplayMedia');
            expect(gumCall[1]).to.equal(null);
            expect(gumCall[2]).to.deep.equal(constraints);

            const gumResult = events.shift();
            expect(gumResult[0]).to.equal('navigator.mediaDevices.getDisplayMediaOnFailure');
            expect(gumResult[1]).to.equal(null);
            expect(gumResult[2]).to.equal(err.name);
        });
    });
});
