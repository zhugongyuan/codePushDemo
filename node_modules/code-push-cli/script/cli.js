#!/usr/bin/env node
/// <reference path="../definitions/external/node/node.d.ts" />
var parser = require("./command-parser");
var command_executor_1 = require("./command-executor");
var chalk = require("chalk");
function run() {
    if (!parser.command) {
        parser.showHelp(false);
        return;
    }
    command_executor_1.execute(parser.command)
        .catch(function (error) {
        console.error(chalk.red("[Error]  " + error.message));
        process.exit(1);
    })
        .done();
}
run();

//# sourceMappingURL=cli.js.map
