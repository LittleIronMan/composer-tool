import fs from "fs";
import path from "path";

const defaultConfigFileName = 'clusterConfig.json';

export function err(msg: string) {
    console.error("Error: " + msg);
    process.exit();
}

export function generateDockerComposeYmlFromConfig(clusterConfigFilePath: string) {
    if (!fs.existsSync(clusterConfigFilePath)) {
        err(`Invalid path to configuration file ${clusterConfigFilePath}`);
    }

    if (fs.lstatSync(clusterConfigFilePath).isSymbolicLink()) {
        clusterConfigFilePath = fs.realpathSync(clusterConfigFilePath);
    }
    
    if (fs.lstatSync(clusterConfigFilePath).isDirectory()) {
        clusterConfigFilePath = path.join(clusterConfigFilePath, defaultConfigFileName);

        if (!fs.existsSync(clusterConfigFilePath)) {
            err(`Configuration file not found ${clusterConfigFilePath}`);
        }
    }

    const buf = fs.readFileSync(clusterConfigFilePath, 'utf8');
    const fileData = JSON.parse(buf);

    if (!fileData) {
        err('Error: Invalid JSON configuration file');
    }

    const logEnd = `configuration file ${clusterConfigFilePath}`;

    _checkConfigProps(fileData, {prefix: ['string']}, 'root of ' + logEnd);

    for (const moduleName in fileData) {
        if (moduleName === 'prefix') {
            continue;
        }

        const moduleInfo = fileData[moduleName];

        _parseYmlTemplate(moduleInfo.template);
    }
}

class CodeBlock {
    parent: CodeBlock | null = null;
    chidren: CodeBlock[] = [];
    begin: number;
    end: number;
    constructor(parent: CodeBlock | null, begin: number) {
        this.parent = parent;

        if (parent) {
            parent.chidren.push(this);
        }

        this.begin = begin;
        this.end = begin;
    }
    endPlus() {
        this.end++;
        if (this.parent) {
            this.parent.endPlus();
        }
    }
}
class IfBlock extends CodeBlock {
    elseBegin?: number;
}
class ForBlock extends CodeBlock {
    iteratorName: string;
    constructor(parent: CodeBlock, begin: number, iteratorName: string) {
        super(parent, begin);
        this.iteratorName = iteratorName;
    }
}

/** 
 * Abstract syntax tree
 */
class AST {
    root: CodeBlock;
    currentBlock: CodeBlock;
    rowIdx = 0;
    constructor() {
        this.root = new CodeBlock(null, 0);
        this.currentBlock = this.root;
    }
    appendRow() {
        this.currentBlock.endPlus();
    }
    closeCurrent() {
        this.currentBlock = this.currentBlock.parent || this.root;
    }
    forkIf() {
        this.currentBlock = new IfBlock(this.currentBlock, this.rowIdx);
    }
    forkElse() {

    }
}

function _parseYmlTemplate(ymlTemplateFilePath: string) {
    if (!fs.existsSync(ymlTemplateFilePath)) {
        err(`Invalid path to template yml file ${ymlTemplateFilePath}`);
    }

    if (fs.lstatSync(ymlTemplateFilePath).isSymbolicLink()) {
        ymlTemplateFilePath = fs.realpathSync(ymlTemplateFilePath);
    }
    
    const buf = fs.readFileSync(ymlTemplateFilePath, 'utf8').toString();
    // looking for all template arguments
    const rows = buf.replace(/\r\n/g,'\n').split('\n');

    const ast = new AST();

    for (let i = 0; i < rows.length; i++) {
        let row = rows[i].trim();

        if (row.startsWith("#$")) {
            row = row.substring(2, row.length).trim();

            if (row.startsWith('if')) {
                ast.forkIf();
            } else if (row.startsWith('elif')) {
                ast.forkElse();
                ast.forkIf();
            } else if (row.startsWith('else')) {
                ast.forkElse();
            } else if (row.startsWith('for')) {
                ast.forkForLoop();
            } else if (row.startsWith('}')) {
                ast.closeCurrent();
            }
        } else {
            ast.appendRow();
        }

        ast.rowIdx++;
    }

    ast.root
    // вычисляем условия, раскрываем циклы

    // берем строку, вычисляем её контекст
}

type Schema = { [field: string]: string[] };

function _checkConfigProps(obj: any, schema: Schema, whereIsIt: string) {
    for (const prop in schema) {
        let isValid = false;

        for (const type of schema[prop]) {
            if (typeof obj[prop] === type) {
                isValid = true;
                break;
            }
        }

        if (!isValid) {
            err(`Field "${prop}" (in ${whereIsIt}) should be ${schema[prop].join(', or ')}`);
        }
    }
}