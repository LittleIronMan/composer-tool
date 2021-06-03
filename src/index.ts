#!/usr/bin/env node
import { parseArgs } from "./utils";
import { generateDockerComposeYmlFromConfig } from "./composerTool";
import { ClusterConfig, Options } from "./const";

export default generateDockerComposeYmlFromConfig;
export { ClusterConfig, Options };

if (require.main === module) {
    const parsed = parseArgs();
    generateDockerComposeYmlFromConfig(parsed.config, parsed.options);
}