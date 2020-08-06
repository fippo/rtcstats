export type ondatachannelArgs = [number | null | string];
export type createDataChannelArgs = [string | RTCDataChannelInit | undefined ];
export type createOfferArgs = RTCOfferOptions | undefined;
export type createAnswerArgs = RTCOfferOptions | undefined;
export type addIceCandidateArgs = RTCIceCandidateInit | RTCIceCandidate

export type RTCStatsDataType = RTCConfiguration | RTCIceCandidate | RTCSignalingState | RTCIceConnectionState | RTCIceGatheringState |
                RTCPeerConnectionState | undefined | ondatachannelArgs | string | RTCOfferOptions | undefined | createOfferArgs |
                createAnswerArgs | RTCSessionDescriptionInit | addIceCandidateArgs | object;

/**
 * Type definition for an indexed object provided and returned in the statsCallback
 */
export interface RTCStatsData {
    [index: string]: any
}
/**
 * The extended functions of the peerConnection are exposed with this interface.
 * Simply cast the peerConnection to this type to make use of em.
 * const pc = new RTCPeerConnection(arg) as RTCStatsPeerConnection;
 */
export interface RTCStatsPeerConnection extends RTCPeerConnection
{
	/**
	 * This is the rtcstatistic id ("PC_0", "PC_1", ...) assigned while constructing the peerConnection object
	 */
    public getRtcStatsId(): string;
    /**
     * This is an optional callback that will be called after statistics have been fetched from the peerConnection
     * It can be used to
     * * modify or filter data from the statistics 
     * * add own data to the statistics you need to have in the results 
     *   (reflect status changes on the signalling layer you want to see in association with the statistics)
     *   (e.g. switching from simulcast layers)
     */
    public statsCallback?: (rawData: RTCStatsData) => RTCStatsData;
}
            
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
