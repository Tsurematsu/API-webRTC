import {
    pushLogs,
    getJsonFile,
    CONST_STRINGS,
    COLOR_CODES,
    resolveURL,
    Logger,
    StorageManager,
    BASH_COLORS_HELPER
} from './utils.js';
import { getValues, getBashParameters, isAdminAuthorized } from './config-helpers.js';
import { after_http_listen, before_http_listen } from './http.js';
import addSocket from './signaling-server.js';// alternative new_signaling_server.js

const getValuesFromConfigJson = getValues;
// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection

const modules = {
    addSocket, after_http_listen, BASH_COLORS_HELPER, before_http_listen, getBashParameters,
    getJsonFile, getValuesFromConfigJson, pushLogs, resolveURL
};

export default modules