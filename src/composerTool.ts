import fs from "fs";
import path from "path";
import yaml from 'js-yaml';
import mergeWith from 'lodash.mergewith';
import { err, checkConfigProps } from "./utils";
import { ClusterConfig } from "./const";
import { evalDynConfig } from "./dynamicConfig";
import checkEnv, { resolveEnvConfigPath, defaultFileReader, defaultEnvFileName } from "doctor-env";

interface ModuleCtx {
    NAME: string;
    MODULE_DIR: string;
    [varName: string]: any;
};

type ModulesCtxMap = { [moduleName: string]: ModuleCtx };

interface EnvInfo {
    config?: string;
    file: string;
    [varName: string]: any;
}

interface ModuleInfo {
    template: string;
    env?: EnvInfo;
    args?: { [varName: string]: any };
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
        checkConfigProps(moduleInfo, { env: ['object', 'undefined'] }, `module "${_moduleName}"`);

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

        if (typeof moduleInfo.env === 'object') {
            if (typeof moduleInfo.env.NAME === 'undefined') {
                moduleInfo.env.NAME = moduleName;
            }
            // желательно в пакете doctor-env сделать явный метод convertToEnvFileName
            moduleInfo.env.file = defaultEnvFileName(moduleName);

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
        const context: any = Object.assign({}, module.ctx);
        context.other = getOtherModulesCtx(module.name, childModules);

        const logPrefix = `Compile ${module.info.template}: `;
        //fs.writeFileSync('out.js', script);
        try {
            module.compiledYaml = evalDynConfig(module.info.template, context);
            console.log(logPrefix + 'Done');
        } catch (e) {
            console.log(logPrefix + 'Error, ' + e.message);
            success = false;
            continue;
        }
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

    // check environment
    const dynamicEnvConfigs: { [filePath: string]: EnvInfo } = {};

    for (const module of childModules) {
        if (!module.info.env || !module.info.env.config) {
            continue;
        }

        dynamicEnvConfigs[resolveEnvConfigPath(module.info.env.config)] = module.info.env;
    }

    for (const module of childModules) {
        if (!module.info.env || !module.info.env.config) {
            continue;
        }

        checkEnv(module.info.env.config, {
            emulateInput: 'abc',
            customFileReader: (filePath) => {
                if (dynamicEnvConfigs[filePath]) {
                    return evalDynConfig(filePath, dynamicEnvConfigs[filePath]);
                } else {
                    return defaultFileReader(filePath);
                }
            }
        });
    }
}