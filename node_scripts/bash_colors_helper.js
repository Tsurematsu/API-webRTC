// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection

// via: stackoverflow.com/a/41407246/552182
const BASH_COLORS_HELPER = {
    getBlackFG(str) {
        return '\x1b[30m' + (str || '%s') + '\x1b[0m';
    },
    getRedFG(str) {
        return '\x1b[31m' + (str || '%s') + '\x1b[0m';
    },
    getGreenFG(str) {
        return '\x1b[32m' + (str || '%s') + '\x1b[0m';
    },
    getYellowFG(str) {
        return '\x1b[33m' + (str || '%s') + '\x1b[0m';
    },
    getBlueFG(str) {
        return '\x1b[34m' + (str || '%s') + '\x1b[0m';
    },
    getPinkFG(str) {
        return '\x1b[35m' + (str || '%s') + '\x1b[0m';
    },
    getCyanFG(str) {
        return '\x1b[36m' + (str || '%s') + '\x1b[0m';
    },
    getWhiteFG(str) {
        return '\x1b[37m' + (str || '%s') + '\x1b[0m';
    },
    getCrimsonFG(str) {
        return '\x1b[38m' + (str || '%s') + '\x1b[0m';
    },
    underline(str) {
        return '\x1b[4m' + (str || '%s') + '\x1b[0m';
    },
    highlight(str) {
        return '\x1b[7m' + (str || '%s') + '\x1b[0m';
    },
    getYellowBG(str) {
        return '\x1b[43m' + (str || '%s') + '\x1b[0m';
    },
    getRedBG(str) {
        return '\x1b[41m' + (str || '%s') + '\x1b[0m';
    }
};

export default BASH_COLORS_HELPER;
