#!/usr/bin/env node
import minimistParse from "minimist";

export function parseArgs(): any {
    const cliArgs: any = minimistParse(process.argv.slice(2));
    return cliArgs;
}

if (require.main === module) {
    const parsed = parseArgs();
}