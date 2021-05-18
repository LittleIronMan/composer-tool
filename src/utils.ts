
import fs from "fs";
import path from "path";
import minimistParse from "minimist";
import { ClusterConfig, defaultConfigFileName } from "./const";

export function err(msg: string) {
    console.error("Error: " + msg);
    process.exit();
}

export function parseArgs(): ClusterConfig {
    const cliArgs: any = minimistParse(process.argv.slice(2));

    let mainModule = cliArgs._[0];
    //console.log(cliArgs);

    if (typeof mainModule !== 'string') {
        err(`Required path to file or directory with "${defaultConfigFileName}" file`);
    }

    if (!fs.existsSync(mainModule)) {
        err(`Invalid path to configuration file ${mainModule}`);
    }

    if (fs.lstatSync(mainModule).isSymbolicLink()) {
        mainModule = fs.realpathSync(mainModule);
    }

    if (fs.lstatSync(mainModule).isDirectory()) {
        mainModule = path.join(mainModule, defaultConfigFileName);

        if (!fs.existsSync(mainModule)) {
            err(`Configuration file not found ${mainModule}`);
        }
    }

    const buf = fs.readFileSync(mainModule, 'utf8');
    const fileData: ClusterConfig = JSON.parse(buf);

    if (!fileData) {
        err('Error: Invalid JSON configuration file');
    }

    fileData.cd = path.dirname(mainModule);

    return fileData;
}


type Schema = { [field: string]: string[] };

export function _checkConfigProps(obj: any, schema: Schema, whereIsIt: string) {
    for (const prop in schema) {
        let isValid = false;

        for (const type of schema[prop]) {
            if (typeof obj[prop] === type) {
                isValid = true;
                break;
            }
        }

        if (!isValid) {
            err(`Field "${prop}" (in ${whereIsIt}) should be ${schema[prop].join(', or ')}`);
        }
    }
}