import fs from "fs";
import path from "path";
import {VM} from 'vm2';

const defaultConfigFileName = 'clusterConfig.json';

export function err(msg: string) {
    console.error("Error: " + msg);
    process.exit();
}

type ModuleCtx = {[varName: string]: any};
type ModulesCtxMap = {[moduleName: string]: ModuleCtx};

interface ModuleInfo {
    env?: string;
    args?: ModuleCtx;
}

function getModuleCtx(moduleName: string, allModulesVariables: ModuleCtx[]): ModuleCtx {
    for (const ctx of allModulesVariables) {
        if (ctx.name === moduleName) {
            return ctx;
        }
    }

    return {};
}

function getOtherModulesCtx(moduleName: string, allModulesVariables: ModuleCtx[]): ModulesCtxMap {
    const res: ModulesCtxMap = {};

    for (const ctx of allModulesVariables) {
        if (ctx.name !== moduleName) {
            res[ctx.name] = ctx;
        }
    }

    return res;
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

    let childModules = Object.keys(fileData).filter(name => ['prefix'].indexOf(name) === -1);

    const scriptBegin = `// config assembly
function printConfig(configBlock) {
    result.config = result.config + configBlock;
}
`;

    const allModulesVariables: ModuleCtx[] = [];

    for (const moduleName of childModules) {
        const moduleInfo: ModuleInfo = fileData[moduleName];
        let ctx: ModuleCtx = {
            name: moduleName,
            // исправить!!
            MODULE_PATH: path.dirname(clusterConfigFilePath),
        };

        if (typeof moduleInfo.env === 'string') {
            ctx.env = moduleInfo.env;
        }

        if (typeof moduleInfo.args === 'object') {
            for (const argName in moduleInfo.args) {
                ctx[argName] = moduleInfo.args[argName];
            }
        }

        allModulesVariables.push(ctx);
    }

    //console.log(allModulesVariables);
    let i = 0;

    for (const moduleName of childModules) {
        const moduleInfo = fileData[moduleName];
        let sandbox: any = Object.assign({}, getModuleCtx(moduleName, allModulesVariables));
        sandbox.other = getOtherModulesCtx(moduleName, allModulesVariables);
        sandbox.result = { config: "" };

        let script = scriptBegin + _parseDynConfig(moduleInfo.template);

        if (i == childModules.length - 1) {
            const vm = new VM({
                sandbox: sandbox,
                eval: false,
                wasm: false,
            });
            
            //fs.writeFileSync('out.js', script);
            vm.run(script);
            //fs.writeFileSync('out.yml', sandbox.result.config);
        }

        i++;
    }
}

class DynConfParser {
    script: string[] = [];
    state: ('script' | 'config' | 'none') = 'none';

    closeConfigBlock() {
        this.script.push('`);');
    }

    pushScriptRow(row: string) {
        if (this.state == 'config') {
            this.closeConfigBlock();
        }

        this.state = 'script';
        this.script.push(row);
    }

    pushConfigRow(row: string) {
        if (this.state == 'script' || this.state == 'none') {
            this.script.push('printConfig(`' + row);
        } else {
            this.script.push(row);
        }

        this.state = 'config';
    }
}

function _parseDynConfig(ymlTemplateFilePath: string): string {
    if (!fs.existsSync(ymlTemplateFilePath)) {
        err(`Invalid path to template yml file ${ymlTemplateFilePath}`);
    }

    if (fs.lstatSync(ymlTemplateFilePath).isSymbolicLink()) {
        ymlTemplateFilePath = fs.realpathSync(ymlTemplateFilePath);
    }
    
    const buf = fs.readFileSync(ymlTemplateFilePath, 'utf8').toString();
    // looking for all template arguments
    const rows = buf.replace(/\r\n/g,'\n').split('\n');

    const parser = new DynConfParser();

    for (let i = 0; i < rows.length; i++) {
        const rowSrc = rows[i];
        let row = rowSrc.trimStart();

        if (row.startsWith('#$')) {
            row = row.substring(2, row.length).trimStart();
            parser.pushScriptRow(row);
        } else {
            parser.pushConfigRow(rowSrc);
        }
    }

    if (parser.state === 'config') {
        parser.closeConfigBlock();
    }

    return parser.script.join('\n');
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