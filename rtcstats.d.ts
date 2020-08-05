export type ondatachannelArgs = [number | null | string];
export type createDataChannelArgs = [string | RTCDataChannelInit | undefined ];
export type createOfferArgs = RTCOfferOptions | undefined;
export type createAnswerArgs = RTCOfferOptions | undefined;
export type addIceCandidateArgs = RTCIceCandidateInit | RTCIceCandidate

export type RTCStatsDataType = RTCConfiguration | RTCIceCandidate | RTCSignalingState | RTCIceConnectionState | RTCIceGatheringState |
                RTCPeerConnectionState | undefined | ondatachannelArgs | string | RTCOfferOptions | undefined | createOfferArgs |
                createAnswerArgs | RTCSessionDescriptionInit | addIceCandidateArgs | object;

declare module "rtcstats" {
    /**
     * Initializes the logging and statistics callback into the trace method for all noted methods
     *
     * @param trace - the Trace function which will be called for statistics that shall be logged
     * @param getStatsIntervalmsec - the interval in which the statistics will be collected
     * @param prefixesToWrap - the PeerConnection prefixes, set [""] if using the webrtc adapter
     *
     * methods - data object type
     * create - RTCConfiguration
     * onicecandidate - RTCIceCandidate
     * onaddstream - string
     * ontrack - string
     * onremovestream - string
     * onsignalingstatechange - RTCSignalingState
     * oniceconnectionstatechange - RTCIceConnectionState
     * icegatheringstatechange - RTCIceGatheringState
     * connectionstatechange - RTCPeerConnectionState
     * negotiationneeded - undefined
     * ondatachannel - ondatachannelArgs
     * getstats - object (browser dependend)
     * createDataChannel - createDataChannelArgs
     * close - undefined
     * addStream - string
     * removeStream - string
     * addTrack - string
     * removeTrack - string
     * createOffer - createOfferArgs
     * createAnswer - createAnswerArgs
     * setLocalDescription - RTCSessionDescriptionInit
     * setLocalDescriptionOnSuccess - undefined
     * setLocalDescriptionOnFailure - string
     * setRemoteDescription - RTCSessionDescriptionInit
     * setRemoteDescriptionOnSuccess - undefined
     * setRemoteDescriptionOnFailure - string
     * addIceCandidate - addIceCandidateArgs
     * addIceCandidateOnSuccess - undefined
     * addIceCandidateOnFailure - string
     */

    export default function anonymous(trace: (method: string, id: string, data: RTCStatsDataType) => void, getStatsIntervalmsec: number, prefixesToWrap: string[]): void;
}
