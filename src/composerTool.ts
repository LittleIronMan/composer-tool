import fs from "fs";
import path from "path";
import { VM } from 'vm2';
import yaml from 'js-yaml';
import mergeWith from 'lodash.mergewith';
import { err, checkConfigProps } from "./utils";
import { ClusterConfig } from "./const";
import { parseDynConfig } from "./dynamicConfig";

interface ModuleCtx {
    NAME: string;
    MODULE_DIR: string;
    [varName: string]: any;
};

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
    ctx: ModuleCtx;
}

function getOtherModulesCtx(moduleName: string, allModules: ModuleData[]): ModulesCtxMap {
    const res: ModulesCtxMap = {};

    for (const module of allModules) {
        if (module.name !== moduleName) {
            res[module.name] = module.ctx;
        }
    }

    return res;
}

function mergeCustomizer(objValue: object, srcValue: object) {
    if (Array.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
}

export function generateDockerComposeYmlFromConfig(config: ClusterConfig) {
    checkConfigProps(config, { cd: ['string'] }, 'root of config object');
    checkConfigProps(config, { outputFile: ['string'] }, 'root of config object');
    checkConfigProps(config, { prefix: ['string', 'undefined'] }, 'root of config object');
    let prefix: string = config.prefix || '';

    if (prefix && !prefix.endsWith('-') && !prefix.endsWith('_')) {
        prefix += '-';
    }

    const childModulesNames = Object.keys(config).filter(name => ['cd', 'outputFile', 'prefix'].indexOf(name) === -1);
    const childModules: ModuleData[] = [];

    for (const _moduleName of childModulesNames) {
        const moduleInfo: ModuleInfo = config[_moduleName];
        const moduleName = prefix + _moduleName;

        checkConfigProps(moduleInfo, { template: ['string'] }, `module "${_moduleName}"`);
        checkConfigProps(moduleInfo, { env: ['string', 'undefined'] }, `module "${_moduleName}"`);

        if (!fs.existsSync(moduleInfo.template)) {
            err(`File ${moduleInfo.template} not found`);
        }

        let moduleDir = path.relative(config.cd, path.dirname(moduleInfo.template));
        moduleDir = moduleDir.replace(/\\/g, '/');
        //console.log(moduleDir);

        if (moduleDir && !moduleDir.endsWith('/')) {
            moduleDir += '/';
        }

        const ctx: ModuleCtx = {
            NAME: moduleName,
            MODULE_DIR: moduleDir,
        };

        if (typeof moduleInfo.env === 'string') {
            ctx.env = moduleInfo.env;
        }

        if (typeof moduleInfo.args === 'object') {
            for (const argName in moduleInfo.args) {
                ctx[argName] = moduleInfo.args[argName];
            }
        }

        childModules.push({
            name: moduleName,
            info: moduleInfo,
            compiledYaml: "",
            ctx: ctx,
        });
    }

    //console.log(allModulesVariables);
    let accum: object = {};
    let success = true;

    for (const module of childModules) {
        const sandbox: any = Object.assign({}, module.ctx);
        sandbox.other = getOtherModulesCtx(module.name, childModules);
        sandbox.result = { config: "" };

        const script = parseDynConfig(module.info.template);

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
        fs.writeFileSync(config.outputFile, resultYml);
    }
}