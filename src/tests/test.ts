import { runTests } from "./testUtils";
import { parseArgs } from "../index";

if (require.main === module) {
    const parsed = parseArgs();

    runTests([]);
}