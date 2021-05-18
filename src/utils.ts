
import minimistParse from "minimist";
import { defaultConfigFileName } from "./const";

export function err(msg: string) {
    console.error("Error: " + msg);
    process.exit();
}

export function parseArgs(): { mainModule: string } {
    const cliArgs: any = minimistParse(process.argv.slice(2));

    let mainModule = cliArgs._[0];
    //console.log(cliArgs);

    if (typeof mainModule !== 'string') {
        err(`Required path to file or directory with "${defaultConfigFileName}" file`);
    }

    return { mainModule: mainModule };
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