import {wrapWebRTC} from '../../rtcstats.js';
import {createTestSink} from '../sink.js';

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
