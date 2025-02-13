import BASH_COLORS_HELPER from './bash_colors_helper.js';
import addSocket from './signaling-server.js';// alternative new_signaling_server.js
import afterHttpListen from './after-http-listen.js';
import beforeHttpListen from './before-http-listen.js';
import getBashParameters from './get-bash-parameters.js';
import getValuesFromConfigJson from './get-values-from-config-json.js';
import getJsonFile from './getJsonFile.js';
import pushLogs from './pushLogs.js';
import resolveURL from './resolveURL.js';

// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection

const modules = {
    addSocket, afterHttpListen, BASH_COLORS_HELPER, beforeHttpListen, getBashParameters,
    getJsonFile, getValuesFromConfigJson, pushLogs, resolveURL
};

export default modules