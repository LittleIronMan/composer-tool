import fs from "fs";
import path from "path";

const defaultConfigFileName = 'clusterConfig.json';

export function err(msg: string) {
    console.error("Error: " + msg);
    process.exit();
}

export function generateDockerComposeYmlFromConfig(clusterConfigFilePath: string) {
    if (!fs.existsSync(clusterConfigFilePath)) {
        err(`Invalid path to configuration file ${clusterConfigFilePath}`);
    }

    if (fs.lstatSync(clusterConfigFilePath).isSymbolicLink()) {
        clusterConfigFilePath = fs.realpathSync(clusterConfigFilePath);
    }
    
    if (fs.lstatSync(clusterConfigFilePath).isDirectory()) {
        clusterConfigFilePath = path.join(clusterConfigFilePath, defaultConfigFileName);

        if (!fs.existsSync(clusterConfigFilePath)) {
            err(`Configuration file not found ${clusterConfigFilePath}`);
        }
    }

    const buf = fs.readFileSync(clusterConfigFilePath, 'utf8');
    const fileData = JSON.parse(buf);

    if (!fileData) {
        err('Error: Invalid JSON configuration file');
    }

    const logEnd = `configuration file ${clusterConfigFilePath}`;

    _checkConfigProps(fileData, {prefix: ['string']}, 'root of ' + logEnd);

    for (const moduleName in fileData) {
        if (moduleName === 'prefix') {
            continue;
        }

        const moduleInfo = fileData[moduleName];

        _parseYmlTemplate(moduleInfo.template);
    }
}

function _parseYmlTemplate(ymlTemplateFilePath: string) {
    if (!fs.existsSync(ymlTemplateFilePath)) {
        err(`Invalid path to template yml file ${ymlTemplateFilePath}`);
    }

    if (fs.lstatSync(ymlTemplateFilePath).isSymbolicLink()) {
        ymlTemplateFilePath = fs.realpathSync(ymlTemplateFilePath);
    }
    
    const buf = fs.readFileSync(ymlTemplateFilePath, 'utf8').toString();
    // looking for all template arguments
    const rows = buf.replace(/\r\n/g,'\n').split('\n');

    // найти все ${<argument_name>}
    const requiredArgsSet: {[key: string]: boolean} = {};

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const argsDirty = row.match(/\$\{.*?\}/g);

        if (argsDirty) {
            for (const arg of argsDirty) {
                const argName = arg.substring(2, arg.length - 1).trim();
                requiredArgsSet[argName] = true;
            }
        }
    }

    console.log(Object.keys(requiredArgsSet));
}

type Schema = { [field: string]: string[] };

function _checkConfigProps(obj: any, schema: Schema, whereIsIt: string) {
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