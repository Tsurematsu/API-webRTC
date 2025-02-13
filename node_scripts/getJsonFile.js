import fs from 'fs';

function getJsonFile(path) {
    let output = {};
    try {
        let json = fs.readFileSync(path);
        output = JSON.parse(json);
    }
    catch(e) {
        output = {};

        // console.log(e.message, e.stack);
    }
    return output;
}

export default getJsonFile
