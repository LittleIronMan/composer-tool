import fs from "fs";
import path from "path";
import { err } from "./utils";
import { VM/*, NodeVM*/ } from 'vm2';

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

export function parseDynConfig(dynConfigFilePath: string): string {
    if (!fs.existsSync(dynConfigFilePath)) {
        err(`Invalid path to file ${dynConfigFilePath}`);
    }

    if (fs.lstatSync(dynConfigFilePath).isSymbolicLink()) {
        dynConfigFilePath = fs.realpathSync(dynConfigFilePath);
    }

    const ext = path.extname(dynConfigFilePath);
    const startTag = ['.yml', '.yaml'].indexOf(ext) !== -1 ? '#$' : '//$';

    const buf = fs.readFileSync(dynConfigFilePath, 'utf8').toString();
    const rows = buf.replace(/\r\n/g, '\n').split('\n');

    const parser = new DynConfParser();

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

export function evalDynConfig(dynConfigFilePath: string, context: object) {
    const sandbox: any = Object.assign({}, context);
    sandbox.result = { config: "" };
    sandbox.path = {
        // normalize(p: string): string;

        // join(...paths: string[]): string;
        join: (...paths: string[]) => path.join(...paths).replace(/\\/g, '/'),

        // resolve(...pathSegments: string[]): string;
        resolve: (...pathSegments: string[]) => path.resolve(...pathSegments).replace(/\\/g, '/'),

        // isAbsolute(p: string): boolean;
        isAbsolute: (p: string) => path.isAbsolute(p),

        // relative(from: string, to: string): string;
        relative: (from: string, to: string) => path.relative(from, to).replace(/\\/g, '/'),

        // dirname(p: string): string;
        dirname: (p: string) => path.dirname(p).replace(/\\/g, '/'),

        // basename(p: string, ext?: string): string;
        basename: (p: string, ext?: string) => path.basename(p, ext).replace(/\\/g, '/'),

        // extname(p: string): string;
        extname: (p: string) => path.extname(p),
    };
    sandbox.spread = (obj: any) => {
        if (typeof obj === 'object') {
            const str = JSON.stringify(obj);
            return str.substring(1, str.length - 1);
        }
    };

    const script = parseDynConfig(dynConfigFilePath);

    const vm = new VM({
        sandbox: sandbox,
        eval: false,
        wasm: false,
    });

    // const vm = new NodeVM({
    //     compiler: 'javascript',
    //     sandbox: sandbox,
    //     eval: false,
    //     wasm: false,
    //     console: 'inherit',
    //     require: {
    //         external: false,
    //         builtin: [/*'fs', */'path'],
    //         // root: "./",
    //         // mock: {
    //         //     fs: {
    //         //         readFileSync() { return 'Nice try!'; }
    //         //     }
    //         // }
    //     },
    //     nesting: false,
    //     wrapper: 'none',
    // });

    vm.run(script);
    return sandbox.result.config;
}
