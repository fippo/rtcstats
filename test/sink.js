export function createTestSink() {
    let buffer = [];
    return {
        trace: (...args) => {
            args.push(Date.now());
            buffer.push(args);
        },
        reset: () => {
            const b = buffer;
            buffer = [];
            return b;
        },
    };
}
