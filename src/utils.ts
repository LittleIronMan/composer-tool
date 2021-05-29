
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

    mainModule = truePath(mainModule);

    // const buf = fs.readFileSync(mainModule, 'utf8');
    let buf = '';
    const logPrefix = `Compile ${mainModule}: `;

    try {
        buf = evalDynConfig(mainModule, {});
        console.log(logPrefix + color.g('Done'));
        //fs.writeFileSync(path.parse(mainModule).name + '.compiled.json', buf);
    } catch (e) {
        console.log(logPrefix + color.r('Error, ' + e.message));
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

// https://stackoverflow.com/a/41407246
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const UNDERLINE = '\x1b[4m';
const RESET = '\x1b[0m';
export const color = {
    r: (s: string) => RED + s + RESET,
    g: (s: string) => GREEN + s + RESET,
    b: (s: string) => BLUE + s + RESET,
    y: (s: string) => YELLOW + s + RESET,
    u: (s: string) => UNDERLINE + s + RESET,
};

export function truePath(p: string): string {
    p = p.replace(/\\/g, '/');

    if (p && !path.isAbsolute(p) && !p.startsWith('./') && !p.startsWith('../') && p !== '.') {
        p = './' + p;
    }

    return p;
}

export const safePath = {
    // normalize(p: string): string;

    // join(...paths: string[]): string;
    join: (...paths: string[]) => truePath(path.join(...paths)),

    // resolve(...pathSegments: string[]): string;
    resolve: (...pathSegments: string[]) => truePath(path.resolve(...pathSegments)),

    // isAbsolute(p: string): boolean;
    isAbsolute: (p: string) => path.isAbsolute(p),

    // relative(from: string, to: string): string;
    relative: (from: string, to: string) => truePath(path.relative(from, to)),

    // dirname(p: string): string;
    dirname: (p: string) => truePath(path.dirname(p)),

    // basename(p: string, ext?: string): string;
    basename: (p: string, ext?: string) => path.basename(p, ext),

    // extname(p: string): string;
    extname: (p: string) => path.extname(p),
};