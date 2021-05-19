import fs from "fs";
import { err } from "./utils";

const scriptBegin = `// config assembly
function printConfig(configBlock) {
    result.config = result.config + configBlock;
}
`;

class DynConfParser {
    script: string[] = [];
    state: ('script' | 'config' | 'none') = 'none';

    closeConfigBlock() {
        this.script.push('`);');
    }

    pushScriptRow(row: string) {
        if (this.state == 'config') {
            this.closeConfigBlock();
        }

        this.state = 'script';
        this.script.push(row);
    }

    pushConfigRow(row: string) {
        if (this.state == 'script' || this.state == 'none') {
            this.script.push('printConfig(`' + row);
        } else {
            this.script.push(row);
        }

        this.state = 'config';
    }
}

export function parseDynConfig(ymlTemplateFilePath: string): string {
    if (!fs.existsSync(ymlTemplateFilePath)) {
        err(`Invalid path to template yml file ${ymlTemplateFilePath}`);
    }

    if (fs.lstatSync(ymlTemplateFilePath).isSymbolicLink()) {
        ymlTemplateFilePath = fs.realpathSync(ymlTemplateFilePath);
    }

    const buf = fs.readFileSync(ymlTemplateFilePath, 'utf8').toString();
    // looking for all template arguments
    const rows = buf.replace(/\r\n/g, '\n').split('\n');

    const parser = new DynConfParser();

    for (let i = 0; i < rows.length; i++) {
        const rowSrc = rows[i];
        let row = rowSrc.trimStart();

        if (row.startsWith('#$')) {
            row = row.substring(2).trimStart();
            parser.pushScriptRow(row);
        } else {
            parser.pushConfigRow(rowSrc);
        }
    }

    if (parser.state === 'config') {
        parser.closeConfigBlock();
    }

    return scriptBegin + parser.script.join('\n');
}
