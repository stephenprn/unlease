import { setLogLevel } from '../src/log';

// UNLEASE_TEST_LOG=1 npm test shows the server's logs while debugging a test.
setLogLevel(process.env.UNLEASE_TEST_LOG === '1' ? 'debug' : 'silent');
