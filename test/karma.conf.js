const chromeFlags = [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--no-sandbox',
    '--headless', '--disable-gpu', '--remote-debugging-port=9222',
    '--auto-select-desktop-capture-source=rtcstats-e2e-tests',
];

module.exports = function(config) {
    config.set({
        basePath: '..',
        files: [
            'test/getusermedia-mocha.js',
            {pattern: 'rtcstats.js', type: 'module'},
            {pattern: 'test/sink.js', type: 'module'},
            {pattern: 'test/e2e/*.js', type: 'module'},
        ],
        exclude: [],
        frameworks: ['mocha', 'chai'],
        reporters: ['mocha', 'coverage'],
        port: 9876,
        colors: true,
        logLevel: config.LOG_INFO,
        autoWatch: false,
        customLaunchers: {
            chrome: {
                base: 'Chrome',
                flags: chromeFlags
            },
        },
        singleRun: true,
        concurrency: Infinity,
        browsers: ['chrome'],
        preprocessors: {
            'rtcstats.js': ['coverage'],
        },
        browserify: {
            debug: true,
            standalone: 'RtcStatsTestSink',
        },
    });
};
