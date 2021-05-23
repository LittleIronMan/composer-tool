
import fs from "fs";
import path from "path";
import minimistParse from "minimist";
import { ClusterConfig, defaultConfigFileName } from "./const";
import stripJsonComments from "strip-json-comments";
import { evalDynConfig } from "./dynamicConfig";

export function err(e: any) {
    let msg = 'unknown';

    if (typeof e === 'string') {
        msg = e;
    } else if (typeof e === 'object' && e.message) {
        msg = e.message;
    }

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

    // const buf = fs.readFileSync(mainModule, 'utf8');
    let buf = '';
    const logPrefix = `Compile ${mainModule}: `;

    try {
        buf = evalDynConfig(mainModule, {});
        console.log(logPrefix + 'Done');
        //fs.writeFileSync(path.parse(mainModule).name + '.compiled.json', buf);
    } catch (e) {
        console.log(logPrefix + 'Error, ' + e.message);
        process.exit();
    }

    let fileData: ClusterConfig = undefined as any;

    try {
        fileData = JSON.parse(stripJsonComments(buf));
    } catch (e) {
        console.log(`Error in file ${mainModule}`);
        err(e);
    }

    if (!fileData) {
        err(`Error: Invalid JSON configuration file ${mainModule}`);
    }

    fileData.cd = path.dirname(mainModule);

    return fileData;
}


type Schema = { [field: string]: string[] };

export function checkConfigProps(obj: any, schema: Schema, whereIsIt: string) {
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