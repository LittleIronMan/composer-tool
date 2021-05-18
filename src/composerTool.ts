import fs from "fs";
import path from "path";
import { VM } from 'vm2';
import yaml from 'js-yaml';
import mergeWith from 'lodash.mergewith';
import { err, _checkConfigProps } from "./utils";
import { defaultConfigFileName } from "./const";
import { _parseDynConfig } from "./dynamicConfig";

type ModuleCtx = { [varName: string]: any };
type ModulesCtxMap = { [moduleName: string]: ModuleCtx };

interface ModuleInfo {
    template: string;
    env?: string;
    args?: ModuleCtx;
}

interface ModuleData {
    name: string;
    info: ModuleInfo;
    compiledYaml: string;
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

function mergeCustomizer(objValue: object, srcValue: object) {
    if (Array.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
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

    _checkConfigProps(fileData, { prefix: ['string', 'undefined'] }, 'root of ' + logEnd);
    let prefix: string = fileData.prefix || '';

    if (prefix && !prefix.endsWith('-') && !prefix.endsWith('_')) {
        prefix += '-';
    }

    const childModulesNames = Object.keys(fileData).filter(name => ['prefix'].indexOf(name) === -1);
    const childModules: ModuleData[] = [];

    const allModulesVariables: ModuleCtx[] = [];

    for (const _moduleName of childModulesNames) {
        const moduleInfo: ModuleInfo = fileData[_moduleName];
        const moduleName = prefix + _moduleName;
        let modulePath = path.relative(path.dirname(clusterConfigFilePath), path.dirname(moduleInfo.template));
        modulePath = modulePath.replace(/\\/g, '/');
        //console.log(modulePath);

        if (modulePath && !modulePath.endsWith('/')) {
            modulePath += '/';
        }

        const ctx: ModuleCtx = {
            name: moduleName,
            // исправить!!
            MODULE_PATH: modulePath,
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

        childModules.push({
            name: moduleName,
            info: moduleInfo,
            compiledYaml: "",
        });
    }

    //console.log(allModulesVariables);
    let accum: object = {};
    let success = true;

    for (const module of childModules) {
        const sandbox: any = Object.assign({}, getModuleCtx(module.name, allModulesVariables));
        sandbox.other = getOtherModulesCtx(module.name, allModulesVariables);
        sandbox.result = { config: "" };

        const script = _parseDynConfig(module.info.template);

        const vm = new VM({
            sandbox: sandbox,
            eval: false,
            wasm: false,
        });

        const logPrefix = `Compile ${module.info.template}: `;
        //fs.writeFileSync('out.js', script);
        try {
            vm.run(script);
            console.log(logPrefix + 'Done');
        } catch (err) {
            console.log(logPrefix + 'Error, ' + err.message);
            success = false;
            continue;
        }
        //fs.writeFileSync('out.yml', sandbox.result.config);

        module.compiledYaml = sandbox.result.config;
    }

    if (!success) {
        console.log('Correct the errors above to continue');
        return;
    }

    for (const module of childModules) {
        try {
            const data = yaml.load(module.compiledYaml) as object;
            accum = mergeWith(accum, data, mergeCustomizer);
        } catch (err) {
            console.log(err.stack || String(err));

            success = false;
            break;
        }
    }

    if (success) {
        const resultYml = yaml.dump(accum, { indent: 4 });
        fs.writeFileSync('out.yml', resultYml);
    }
}