export const PROTOCOL_ITERATION = '3.1';

// the maximum number of ms allowed for the client to try reconnect
export const MAX_RECONNECT_TIME = 600000;
export const messageTypes = {
    SequenceNumber: 'sn'
};
export const CONFERENCE_LEAVE_CODE = 3001;
export const DUMP_ERROR_CODE = 3002;
export const CUSTOM_ERROR_CODES = [ CONFERENCE_LEAVE_CODE, DUMP_ERROR_CODE ];

// The limit chosen for the buffer so that memory overflows do not happen.
export const BUFFER_LIMIT = 1000;
