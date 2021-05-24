import fs from "fs";
import path from "path";
import yaml from 'js-yaml';
import mergeWith from 'lodash.mergewith';
import { err, checkConfigProps, color, truePath } from "./utils";
import { ClusterConfig } from "./const";
import { evalDynConfig } from "./dynamicConfig";
import checkEnv, { defaultFileReader, defaultEnvFileName } from "doctor-env";

interface ModuleCtx {
    fullName: string;
    moduleDir: string;
    [varName: string]: any;
};

type ModulesCtxMap = { [moduleName: string]: ModuleCtx };

interface EnvInfo {
    /** envConfig file path (input) */
    envConfig?: string;
    /** dot-env file name (output) */
    file: string;
    [varName: string]: any;
}

interface ModuleInfo {
    template: string;
    env?: EnvInfo;
}

interface ModuleData {
    /** Short module name without prefix, e.g. "mongoDB" */
    name: string;
    /** Full module name WITH prefix, e.g. "cluster14fb-mongoDB" */
    fullName: string;
    info: ModuleInfo;
    compiledYaml: string;
    ctx: ModuleCtx;
}

function getOtherModulesCtx(moduleName: string, allModules: ModuleData[]): ModulesCtxMap {
    const res: ModulesCtxMap = {};

    for (const module of allModules) {
        if (module.fullName !== moduleName) {
            res[module.fullName] = module.ctx;
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
    const logEnd = 'root of config object';
    checkConfigProps(config, { projectName: ['string'] }, logEnd);
    checkConfigProps(config, { cd: ['string'] }, logEnd);
    checkConfigProps(config, { outputFile: ['string'] }, logEnd);
    checkConfigProps(config, { prefix: ['string', 'undefined'] }, logEnd);
    let prefix: string = config.prefix || '';

    if (prefix && !prefix.endsWith('-') && !prefix.endsWith('_')) {
        prefix += '-';
    }

    const clusterModulesNames = Object.keys(config).filter(name => ['projectName', 'cd', 'outputFile', 'prefix'].indexOf(name) === -1);
    const clusterModules: ModuleData[] = [];

    for (const moduleName of clusterModulesNames) {
        const moduleInfo: ModuleInfo = config[moduleName];
        const fullName = prefix + moduleName;

        const logEnd = `module "${moduleName}"`;
        checkConfigProps(moduleInfo, { template: ['string'] }, logEnd);
        checkConfigProps(moduleInfo, { env: ['object', 'undefined'] }, logEnd);
        // следующие свойства разрешается перезаписывать, но делать так нежелательно
        checkConfigProps(moduleInfo, { fullName: ['string', 'undefined'] }, logEnd);
        checkConfigProps(moduleInfo, { moduleDir: ['string', 'undefined'] }, logEnd);

        if (!fs.existsSync(moduleInfo.template)) {
            err(`File ${moduleInfo.template} not found`);
        }

        let moduleDir = truePath(path.relative(config.cd, path.dirname(moduleInfo.template)));

        if (moduleDir && !moduleDir.endsWith('/')) {
            moduleDir += '/';
        }

        const ctx: ModuleCtx = {
            fullName: fullName,
            moduleDir: moduleDir,
        };

        if (typeof moduleInfo.env === 'object') {
            if (typeof moduleInfo.env.fullName === 'undefined') {
                moduleInfo.env.fullName = fullName;
            }
            moduleInfo.env.file = defaultEnvFileName(fullName);

            ctx.env = moduleInfo.env;
        }

        for (const key in moduleInfo) {
            if (['template', 'env'].indexOf(key) !== -1) {
                continue;
            }

            ctx[key] = moduleInfo[key as keyof ModuleInfo];
        }

        clusterModules.push({
            name: moduleName,
            fullName: fullName,
            info: moduleInfo,
            compiledYaml: "",
            ctx: ctx,
        });
    }

    let accum: object = {};
    let success = true;

    for (const module of clusterModules) {
        const context: any = Object.assign({}, module.ctx);
        context.other = getOtherModulesCtx(module.fullName, clusterModules);

        const logPrefix = `Compile ${module.info.template}: `;
        //fs.writeFileSync('out.js', script);
        try {
            module.compiledYaml = evalDynConfig(module.info.template, context);
            console.log(logPrefix + color.g('Done'));
        } catch (e) {
            console.log(logPrefix + color.r('Error, ' + e.message));
            success = false;
            continue;
        }
    }

    if (!success) {
        console.log('Correct the errors above to continue');
        return;
    }

    for (const module of clusterModules) {
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

    checkClusterEnvironment(clusterModules);
}

async function checkClusterEnvironment(clusterModules: ModuleData[]) {
    //console.log('Check environment variables:');

    for (const module of clusterModules) {
        if (!module.info.env || !module.info.env.envConfig) {
            continue;
        }

        console.log(`Check environment config ${color.y(module.info.env.envConfig)} [module:${color.y(module.name)}]`);

        await checkEnv(module.info.env.envConfig, {
            //emulateInput: 'abc',
            moduleId: module.name,
            customFileReader: (filePath, moduleId) => {
                //console.log(`Custom read file ${filePath}`);
                let envForParse: EnvInfo | undefined;

                for (const m of clusterModules) {
                    if (!m.info.env || !m.info.env.envConfig) {
                        continue;
                    }

                    if (moduleId) {
                        if (m.name === moduleId) {
                            envForParse = m.info.env;
                            filePath = envForParse.envConfig as string;
                            break;
                        }
                    } else {
                        if (m.info.env.envConfig === filePath) {
                            envForParse = m.info.env;
                            break;
                        }
                    }
                }

                if (envForParse) {
                    const logPrefix = `Compile ${filePath}` + (moduleId ? ` [module:${moduleId}]` : '') + ': ';
                    try {
                        const result = evalDynConfig(filePath, envForParse);
                        console.log(logPrefix + color.g('Done'));
                        return result;
                    } catch (e) {
                        console.log(logPrefix + color.r('Error, ' + e.message));
                        process.exit();
                    }
                } else if (moduleId) {
                    err(`Not found environment config file for module ${color.y(moduleId)}`)
                }

                return defaultFileReader(filePath);
            }
        });
    }
}