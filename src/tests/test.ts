import { parseArgs } from "../utils";
import { runTests } from "./testUtils";

if (require.main === module) {
    const parsed = parseArgs();

    runTests([]);
}