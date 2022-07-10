import {wrapWebRTC} from '../../rtcstats.js';
import {createTestSink} from '../sink.js';

describe('rtcstats', () => {
    let rtcStats;
    let testSink;
    before(() => {
        testSink = createTestSink();
        rtcStats = wrapWebRTC(testSink.trace, 1000, ['']);
    });
    beforeEach(() => {
        testSink.reset();
    });

    describe('peerconnection creation', () => {
        it('traces the creation', () => {
            const now = Date.now();
            const pc = new RTCPeerConnection();

            const events = testSink.reset();
            expect(events.length).to.equal(1);
            const createEvent = events.shift();
            expect(createEvent[0]).to.equal('create');
            expect(createEvent[1]).to.equal(pc.__rtcStatsId);
            expect(createEvent[2]).to.be.an('object');
            expect(createEvent[3] - now).to.be.below(1000); // less than 1000ms.
        });

        it('increments the peerconnection index', () => {
            const pc1 = new RTCPeerConnection();
            const pc2 = new RTCPeerConnection();

            const events = testSink.reset();
            expect(events.length).to.equal(2);
            expect(events[0][1]).to.equal(pc1.__rtcStatsId);
            expect(events[1][1]).to.equal(pc2.__rtcStatsId);
        });
    });

    describe('createOffer', () => {
        it('supports legacy constraints', async () => {
            const pc = new RTCPeerConnection();
            const legacyConstraints = {offerToReceiveAudio: true};
            const offer = await pc.createOffer(legacyConstraints);

            const events = testSink.reset();
            expect(events.length).to.equal(3);
            events.shift(); // ignore create event.
            const offerEvent = events.shift();
            expect(offerEvent).to.have.length(4);
            expect(offerEvent[0]).to.equal('createOffer');
            expect(offerEvent[2]).to.deep.equal(legacyConstraints);
        });
    });

    describe('addTrack', () => {
        it('serializes the track in the expected format', async () => {
            const pc = new RTCPeerConnection();
            const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const events = testSink.reset();
            events.forEach(e => console.log(e));
        });
    });

    describe('legacy getUserMedia', () => {
        it('does something', async () => {
            const constraints = {audio: true, video: true};
            const stream = await new Promise(r => navigator.getUserMedia(constraints, r));
            console.log(stream);

            const events = testSink.reset();
            events.forEach(e => console.log(e));
            expect(events.length).to.equal(2);

            const gumCall = events.shift();
            expect(gumCall[0]).to.equal('getUserMedia');
            expect(gumCall[1]).to.equal(null);
            expect(gumCall[2]).to.deep.equal(constraints);

            const gumResult = events.shift();
            expect(gumResult[0]).to.equal('getUserMediaOnSuccess');
            expect(gumResult[1]).to.equal(null);
            console.log(gumResult[2]);
        });
    });
});
