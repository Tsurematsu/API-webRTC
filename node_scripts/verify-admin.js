// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection

// /admin/ page
function isAdminAuthorized(params, config) {
    if(!params || !params.adminUserName || !params.adminPassword) return false;
    return params.adminUserName === config.adminUserName && params.adminPassword === config.adminPassword;
};
export default isAdminAuthorized