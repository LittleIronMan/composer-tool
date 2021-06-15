import fs from "fs";
import path from "path";
import yaml from 'js-yaml';
import mergeWith from 'lodash.mergewith';
import { err, checkConfigProps, setDefaultProps, color, truePath, input } from "./utils";
import { ClusterConfig, Options } from "./const";
import { evalDynConfig } from "./dynamicConfig";
import checkEnv, { defaultFileReader, defaultEnvFileName } from "doctor-env";

interface ModuleName {
    /** Short module name without prefix, e.g. "mongoDB" */
    name: string;
    /** Full module name WITH prefix, e.g. "cluster14fb-mongoDB" */
    fullName: string;
}

interface EnvInfo extends ModuleName {
    /** envConfig file path (input) */
    envConfig: string;
    /** dot-env file name (output) */
    file: string;
    [varName: string]: any;
}

interface ModuleInfo extends ModuleName {
    template?: string;
    env?: EnvInfo;
    moduleDir?: string;
    // other custom properties
    [varName: string]: any;
}

interface ModuleData {
    info: ModuleInfo;
    compiledYaml: string;
}

type ModulesCtxMap = { [moduleName: string]: ModuleInfo };

function getOtherModulesCtx(moduleName: string, allModules: ModuleData[]): ModulesCtxMap {
    const res: ModulesCtxMap = {};

    for (const module of allModules) {
        if (module.info.fullName !== moduleName) {
            res[module.info.fullName] = module.info;
        }
    }

    return res;
}

function mergeCustomizer(objValue: object, srcValue: object) {
    if (Array.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
}

export function generateDockerComposeYmlFromConfig(config: ClusterConfig, options: Options) {
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

        const logEnd = `module "${color.y(moduleName)}"`;
        checkConfigProps(moduleInfo, { template: ['string', 'undefined'] }, logEnd);
        checkConfigProps(moduleInfo, { env: ['object', 'undefined'] }, logEnd);

        let moduleDir: string | undefined;

        if (moduleInfo.template) {
            if (!fs.existsSync(moduleInfo.template)) {
                err(`File ${moduleInfo.template} not found`);
            }

            moduleDir = truePath(path.relative(config.cd, path.dirname(moduleInfo.template)));

            if (moduleDir && !moduleDir.endsWith('/')) {
                moduleDir += '/';
            }
        }

        const defaultProps = ['path', 'spread', 'module', 'name', 'fullName'];
        const defaultPropsForModule = defaultProps.concat(['moduleDir', 'other']);
        const defaultPropsForEnv = defaultProps.concat(['file']);
        setDefaultProps(moduleInfo, defaultPropsForModule, { name: moduleName, fullName: fullName, moduleDir: moduleDir }, logEnd);

        if (typeof moduleInfo.env === 'object') {
            const logEnd = `"${color.y('env')}" block of module "${color.y(moduleName)}"`;
            checkConfigProps(moduleInfo.env, { envConfig: ['string'] }, logEnd);
            setDefaultProps(moduleInfo.env, defaultPropsForEnv, { name: moduleName, fullName: fullName, file: defaultEnvFileName(fullName) }, logEnd);
        }

        clusterModules.push({
            info: moduleInfo,
            compiledYaml: "",
        });
    }

    let accum: object = {};
    let success = true;

    for (const module of clusterModules) {
        if (!module.info.template) {
            continue;
        }

        const context: any = Object.assign({}, module.info);
        context.other = getOtherModulesCtx(module.info.fullName, clusterModules);

        const logPrefix = `Compile ${module.info.template}: `;
        //fs.writeFileSync('out.js', script);
        try {
            module.compiledYaml = evalDynConfig(module.info.template, context, { saveBadJs: options.reportError });
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

    if (!success) {
        console.log('Correct the errors above to continue');
        return;
    }

    const resultYml = yaml.dump(accum, { indent: 4 });
    fs.writeFileSync(config.outputFile, resultYml);
    console.log(`Merged file ${config.outputFile} successfully updated`);

    // ------------ check environment ------------
    const environmentsForCheck: EnvInfo[] = [];

    for (const module of clusterModules) {
        if (!module.info.env) {
            continue;
        }

        environmentsForCheck.push(module.info.env);
    }

    if (environmentsForCheck.length > 0) {
        input('Start checking environment variables (Y/n)?')
        .then((ans) => {
            ans = ans.trim().toLowerCase();
            if (ans === 'y' || ans === '') {
                console.log('------------ check environment ------------');
                checkClusterEnvironment(clusterModules, options);
            }
        })
    }
}

async function checkClusterEnvironment(clusterModules: ModuleData[], options: Options) {
    //console.log('Check environment variables:');

    let checkCounter = 0;

    for (const module of clusterModules) {
        if (!module.info.env) {
            continue;
        }

        checkCounter++;
        console.log(`Check environment config ${color.y(module.info.env.envConfig)} [module:${color.y(module.info.name)}]`);

        await checkEnv(module.info.env.envConfig, {
            //emulateInput: 'abc',
            moduleId: module.info.name,
            customFileReader: (filePath, moduleId) => {
                //console.log(`Custom read file ${filePath}`);
                let envForParse: EnvInfo | undefined;

                for (const m of clusterModules) {
                    if (!m.info.env) {
                        continue;
                    }

                    if (moduleId) {
                        if (m.info.name === moduleId) {
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
                        const result = evalDynConfig(filePath, envForParse, { saveBadJs: options.reportError });
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

    if (checkCounter == 0) {
        console.log('None of the modules provided the path to the "envConfig" file');
    }
}