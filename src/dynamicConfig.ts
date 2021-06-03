import fs from "fs";
import path from "path";
import { err, safePath, color } from "./utils";
import { VM/*, NodeVM*/ } from 'vm2';

const scriptBegin = `// config assembly
function printConfig(configBlock) {
    module.formattedConfig = module.formattedConfig + configBlock;
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

export function parseDynConfig(dynConfigFilePath: string): string {
    if (!fs.existsSync(dynConfigFilePath)) {
        err(`Invalid path to file ${dynConfigFilePath}`);
    }

    if (fs.lstatSync(dynConfigFilePath).isSymbolicLink()) {
        dynConfigFilePath = fs.realpathSync(dynConfigFilePath);
    }

    const buf = fs.readFileSync(dynConfigFilePath, 'utf8').toString();
    const ext = path.extname(dynConfigFilePath);

    if (buf.includes('`')) {
        err(`Forbidden to use the backquote (backtick) symbol, file ${dynConfigFilePath}`);
    }

    // if (ext === '.js') {
    //     return scriptBegin + 'printConfig(`' + buf + '`);';
    // }

    const rows = buf.replace(/\r\n/g, '\n').split('\n');

    const parser = new DynConfParser();
    const startTag = ['.yml', '.yaml'].indexOf(ext) !== -1 ? '#$' : '//$';

    for (let i = 0; i < rows.length; i++) {
        const rowSrc = rows[i];
        let row = rowSrc.trimStart();

        if (row.startsWith(startTag)) {
            row = row.substring(startTag.length).trimStart();
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

export function evalDynConfig(dynConfigFilePath: string, context: object, options: { saveBadJs?: boolean } = {}) {
    const sandbox: any = Object.assign({}, context);
    sandbox.path = safePath;
    sandbox.spread = (obj: any) => {
        if (typeof obj === 'object') {
            const str = JSON.stringify(obj);
            return str.substring(1, str.length - 1);
        } else {
            return obj;
        }
    };
    sandbox.module = { exports: {}, formattedConfig: '' };

    let script = parseDynConfig(dynConfigFilePath);

    const vm = new VM({
        sandbox: sandbox,
        eval: false,
        wasm: false,
    });

    // const vm = new NodeVM({
    //     sandbox: sandbox,
    //     eval: false,
    //     wasm: false,
    //     console: 'off',
    //     // require: {
    //     //     external: false,
    //     //     builtin: [/*'fs', */'path'],
    //     //     // root: "./",
    //     //     // mock: {
    //     //     //     fs: {
    //     //     //         readFileSync() { return 'Nice try!'; }
    //     //     //     }
    //     //     // }
    //     // },
    //     nesting: false,
    //     wrapper: 'none',
    // });

    const onEvalError = (e: any) => {
        if (options.saveBadJs) {
            const reportFileName = 'badJs-' + path.basename(dynConfigFilePath) + '.js';
            console.log(`Error: Compiled js saved in file ${reportFileName}`);
            fs.writeFileSync(reportFileName, script);
        }

        throw e;
    };

    const ext = path.extname(dynConfigFilePath);

    if (ext === '.js') {
        // Pre-compilation of js file, extracting data from variables
        try {
            vm.run(script);
        } catch (e) {
            onEvalError(e);
        }

        script = sandbox.module.formattedConfig;
        // ... then the js file will be executed with the actual data
    }

    try {
        vm.run(script);
    } catch (e) {
        onEvalError(e);
    }

    if (sandbox.module.exports.config) {
        return JSON.stringify(sandbox.module.exports);
    } else {
        return sandbox.module.formattedConfig;
    }
}
