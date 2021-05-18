#!/usr/bin/env node
import { parseArgs } from "./utils";
import { generateDockerComposeYmlFromConfig } from "./composerTool";
import { ClusterConfig } from "./const";

export default generateDockerComposeYmlFromConfig;
export { ClusterConfig };

if (require.main === module) {
    const parsed = parseArgs();
    generateDockerComposeYmlFromConfig(parsed);
}