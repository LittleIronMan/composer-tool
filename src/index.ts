#!/usr/bin/env node
import minimistParse from "minimist";
import { err, generateDockerComposeYmlFromConfig } from "./composerTool";

export function parseArgs(): { mainModule: string } {
    const cliArgs: any = minimistParse(process.argv.slice(2));

    let mainModule = cliArgs._[0];
    //console.log(cliArgs);

    if (typeof mainModule !== 'string') {
        err('Required path to file or directory with "clusterConfig.json" file');
    }

    return { mainModule: mainModule };
}

if (require.main === module) {
    const parsed = parseArgs();
    generateDockerComposeYmlFromConfig(parsed.mainModule);
}