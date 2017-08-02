// helper script to create the non-module version with some defaults.
require('./rtcstats')(
    require('./trace-ws')('wss://rtcstats.tokbox.com'),
    1000,
    ['', 'webkit', 'moz']
);
