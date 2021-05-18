#!/usr/bin/env node
import { parseArgs } from "./utils";
import { generateDockerComposeYmlFromConfig } from "./composerTool";

if (require.main === module) {
    const parsed = parseArgs();
    generateDockerComposeYmlFromConfig(parsed.mainModule);
}