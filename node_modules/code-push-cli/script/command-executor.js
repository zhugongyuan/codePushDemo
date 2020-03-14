/// <reference path="../../definitions/generated/code-push.d.ts" />
var AccountManager = require("code-push");
var chalk = require("chalk");
var childProcess = require("child_process");
var debug_1 = require("./commands/debug");
var fs = require("fs");
var mkdirp = require("mkdirp");
var g2js = require("gradle-to-js/lib/parser");
var moment = require("moment");
var opener = require("opener");
var os = require("os");
var path = require("path");
var plist = require("plist");
var progress = require("progress");
var prompt = require("prompt");
var Q = require("q");
var rimraf = require("rimraf");
var semver = require("semver");
var simctl = require("simctl");
var Table = require("cli-table");
var which = require("which");
var wordwrap = require("wordwrap");
var cli = require("../definitions/cli");
var index_1 = require("./release-hooks/index");
var configFilePath = path.join(process.env.LOCALAPPDATA || process.env.HOME, ".code-push.config");
var emailValidator = require("email-validator");
var packageJson = require("../package.json");
var parseXml = Q.denodeify(require("xml2js").parseString);
var progress = require("progress");
var Promise = Q.Promise;
var properties = require("properties");
var ACTIVE_METRICS_KEY = "Active";
var CLI_HEADERS = {
    "X-CodePush-CLI-Version": packageJson.version
};
var DOWNLOADED_METRICS_KEY = "Downloaded";
exports.log = function (message) { return console.log(message); };
exports.sdk;
exports.spawn = childProcess.spawn;
exports.execSync = childProcess.execSync;
var connectionInfo;
exports.confirm = function (message) {
    if (message === void 0) { message = "Are you sure?"; }
    message += " (y/N):";
    return Promise(function (resolve, reject, notify) {
        prompt.message = "";
        prompt.delimiter = "";
        prompt.start();
        prompt.get({
            properties: {
                response: {
                    description: chalk.cyan(message)
                }
            }
        }, function (err, result) {
            var accepted = result.response && result.response.toLowerCase() === "y";
            var rejected = !result.response || result.response.toLowerCase() === "n";
            if (accepted) {
                resolve(true);
            }
            else {
                if (!rejected) {
                    console.log("Invalid response: \"" + result.response + "\"");
                }
                resolve(false);
            }
        });
    });
};
function accessKeyAdd(command) {
    return exports.sdk.addAccessKey(command.name, command.ttl)
        .then(function (accessKey) {
        exports.log("Successfully created the \"" + command.name + "\" access key: " + accessKey.key);
        exports.log("Make sure to save this key value somewhere safe, since you won't be able to view it from the CLI again!");
    });
}
function accessKeyPatch(command) {
    var willUpdateName = isCommandOptionSpecified(command.newName) && command.oldName !== command.newName;
    var willUpdateTtl = isCommandOptionSpecified(command.ttl);
    if (!willUpdateName && !willUpdateTtl) {
        throw new Error("A new name and/or TTL must be provided.");
    }
    return exports.sdk.patchAccessKey(command.oldName, command.newName, command.ttl)
        .then(function (accessKey) {
        var logMessage = "Successfully ";
        if (willUpdateName) {
            logMessage += "renamed the access key \"" + command.oldName + "\" to \"" + command.newName + "\"";
        }
        if (willUpdateTtl) {
            var expirationDate = moment(accessKey.expires).format("LLLL");
            if (willUpdateName) {
                logMessage += " and changed its expiration date to " + expirationDate;
            }
            else {
                logMessage += "changed the expiration date of the \"" + command.oldName + "\" access key to " + expirationDate;
            }
        }
        exports.log(logMessage + ".");
    });
}
function accessKeyList(command) {
    throwForInvalidOutputFormat(command.format);
    return exports.sdk.getAccessKeys()
        .then(function (accessKeys) {
        printAccessKeys(command.format, accessKeys);
    });
}
function accessKeyRemove(command) {
    return exports.confirm()
        .then(function (wasConfirmed) {
        if (wasConfirmed) {
            return exports.sdk.removeAccessKey(command.accessKey)
                .then(function () {
                exports.log("Successfully removed the \"" + command.accessKey + "\" access key.");
            });
        }
        exports.log("Access key removal cancelled.");
    });
}
function appAdd(command) {
    // Validate the OS and platform, doing a case insensitve comparison. Note that for CLI examples we
    // present these values in all lower case, per CLI conventions, but when passed to the REST API the
    // are in mixed case, per Mobile Center API naming conventions
    var os;
    var normalizedOs = command.os.toLowerCase();
    if (normalizedOs === "ios") {
        os = "iOS";
    }
    else if (normalizedOs === "android") {
        os = "Android";
    }
    else if (normalizedOs === "windows") {
        os = "Windows";
    }
    else {
        return Q.reject(new Error("\"" + command.os + "\" is an unsupported OS. Available options are \"ios\", \"android\", and \"windows\"."));
    }
    var platform;
    var normalizedPlatform = command.platform.toLowerCase();
    if (normalizedPlatform === "react-native") {
        platform = "React-Native";
    }
    else if (normalizedPlatform === "cordova") {
        platform = "Cordova";
    }
    else {
        return Q.reject(new Error("\"" + command.platform + "\" is an unsupported platform. Available options are \"react-native\" and \"cordova\"."));
    }
    return exports.sdk.addApp(command.appName, os, platform, false)
        .then(function (app) {
        exports.log("Successfully added the \"" + command.appName + "\" app, along with the following default deployments:");
        var deploymentListCommand = {
            type: cli.CommandType.deploymentList,
            appName: app.name,
            format: "table",
            displayKeys: true
        };
        return exports.deploymentList(deploymentListCommand, false);
    });
}
function appList(command) {
    throwForInvalidOutputFormat(command.format);
    var apps;
    return exports.sdk.getApps()
        .then(function (retrievedApps) {
        printAppList(command.format, retrievedApps);
    });
}
function appRemove(command) {
    return exports.confirm("Are you sure you want to remove this app? Note that its deployment keys will be PERMANENTLY unrecoverable.")
        .then(function (wasConfirmed) {
        if (wasConfirmed) {
            return exports.sdk.removeApp(command.appName)
                .then(function () {
                exports.log("Successfully removed the \"" + command.appName + "\" app.");
            });
        }
        exports.log("App removal cancelled.");
    });
}
function appRename(command) {
    return exports.sdk.renameApp(command.currentAppName, command.newAppName)
        .then(function () {
        exports.log("Successfully renamed the \"" + command.currentAppName + "\" app to \"" + command.newAppName + "\".");
    });
}
exports.createEmptyTempReleaseFolder = function (folderPath) {
    return deleteFolder(folderPath)
        .then(function () {
        fs.mkdirSync(folderPath);
    });
};
function appTransfer(command) {
    throwForInvalidEmail(command.email);
    return exports.confirm()
        .then(function (wasConfirmed) {
        if (wasConfirmed) {
            return exports.sdk.transferApp(command.appName, command.email)
                .then(function () {
                exports.log("Successfully transferred the ownership of app \"" + command.appName + "\" to the account with email \"" + command.email + "\".");
            });
        }
        exports.log("App transfer cancelled.");
    });
}
function addCollaborator(command) {
    throwForInvalidEmail(command.email);
    return exports.sdk.addCollaborator(command.appName, command.email)
        .then(function () {
        exports.log("Collaborator invitation email for \"" + command.appName + "\" sent to \"" + command.email + "\".");
    });
}
function listCollaborators(command) {
    throwForInvalidOutputFormat(command.format);
    return exports.sdk.getCollaborators(command.appName)
        .then(function (retrievedCollaborators) {
        printCollaboratorsList(command.format, retrievedCollaborators);
    });
}
function removeCollaborator(command) {
    throwForInvalidEmail(command.email);
    return exports.confirm()
        .then(function (wasConfirmed) {
        if (wasConfirmed) {
            return exports.sdk.removeCollaborator(command.appName, command.email)
                .then(function () {
                exports.log("Successfully removed \"" + command.email + "\" as a collaborator from the app \"" + command.appName + "\".");
            });
        }
        exports.log("App collaborator removal cancelled.");
    });
}
function deleteConnectionInfoCache(printMessage) {
    if (printMessage === void 0) { printMessage = true; }
    try {
        fs.unlinkSync(configFilePath);
        if (printMessage) {
            exports.log("Successfully logged-out. The session file located at " + chalk.cyan(configFilePath) + " has been deleted.\r\n");
        }
    }
    catch (ex) {
    }
}
function deleteFolder(folderPath) {
    return Promise(function (resolve, reject, notify) {
        rimraf(folderPath, function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve(null);
            }
        });
    });
}
function deploymentAdd(command) {
    if (command.default) {
        return exports.sdk.addDeployment(command.appName, "Staging")
            .then(function (deployment) {
            return exports.sdk.addDeployment(command.appName, "Production");
        })
            .then(function (deployment) {
            exports.log("Successfully added the \"Staging\" and \"Production\" default deployments:");
            var deploymentListCommand = {
                type: cli.CommandType.deploymentList,
                appName: command.appName,
                format: "table",
                displayKeys: true
            };
            return exports.deploymentList(deploymentListCommand, false);
        });
    }
    else {
        return exports.sdk.addDeployment(command.appName, command.deploymentName)
            .then(function (deployment) {
            exports.log("Successfully added the \"" + command.deploymentName + "\" deployment with key \"" + deployment.key + "\" to the \"" + command.appName + "\" app.");
        });
    }
}
function deploymentHistoryClear(command) {
    return exports.confirm()
        .then(function (wasConfirmed) {
        if (wasConfirmed) {
            return exports.sdk.clearDeploymentHistory(command.appName, command.deploymentName)
                .then(function () {
                exports.log("Successfully cleared the release history associated with the \"" + command.deploymentName + "\" deployment from the \"" + command.appName + "\" app.");
            });
        }
        exports.log("Clear deployment cancelled.");
    });
}
exports.deploymentList = function (command, showPackage) {
    if (showPackage === void 0) { showPackage = true; }
    throwForInvalidOutputFormat(command.format);
    var deployments;
    return exports.sdk.getDeployments(command.appName)
        .then(function (retrievedDeployments) {
        deployments = retrievedDeployments;
        if (showPackage) {
            var metricsPromises = deployments.map(function (deployment) {
                if (deployment.package) {
                    return exports.sdk.getDeploymentMetrics(command.appName, deployment.name)
                        .then(function (metrics) {
                        if (metrics[deployment.package.label]) {
                            var totalActive = getTotalActiveFromDeploymentMetrics(metrics);
                            (deployment.package).metrics = {
                                active: metrics[deployment.package.label].active,
                                downloaded: metrics[deployment.package.label].downloaded,
                                failed: metrics[deployment.package.label].failed,
                                installed: metrics[deployment.package.label].installed,
                                totalActive: totalActive
                            };
                        }
                    });
                }
                else {
                    return Q(null);
                }
            });
            return Q.all(metricsPromises);
        }
    })
        .then(function () {
        printDeploymentList(command, deployments, showPackage);
    });
};
function deploymentRemove(command) {
    return exports.confirm("Are you sure you want to remove this deployment? Note that its deployment key will be PERMANENTLY unrecoverable.")
        .then(function (wasConfirmed) {
        if (wasConfirmed) {
            return exports.sdk.removeDeployment(command.appName, command.deploymentName)
                .then(function () {
                exports.log("Successfully removed the \"" + command.deploymentName + "\" deployment from the \"" + command.appName + "\" app.");
            });
        }
        exports.log("Deployment removal cancelled.");
    });
}
function deploymentRename(command) {
    return exports.sdk.renameDeployment(command.appName, command.currentDeploymentName, command.newDeploymentName)
        .then(function () {
        exports.log("Successfully renamed the \"" + command.currentDeploymentName + "\" deployment to \"" + command.newDeploymentName + "\" for the \"" + command.appName + "\" app.");
    });
}
function deploymentHistory(command) {
    throwForInvalidOutputFormat(command.format);
    return Q.all([
        exports.sdk.getAccountInfo(),
        exports.sdk.getDeploymentHistory(command.appName, command.deploymentName),
        exports.sdk.getDeploymentMetrics(command.appName, command.deploymentName)
    ])
        .spread(function (account, deploymentHistory, metrics) {
        var totalActive = getTotalActiveFromDeploymentMetrics(metrics);
        deploymentHistory.forEach(function (packageObject) {
            if (metrics[packageObject.label]) {
                packageObject.metrics = {
                    active: metrics[packageObject.label].active,
                    downloaded: metrics[packageObject.label].downloaded,
                    failed: metrics[packageObject.label].failed,
                    installed: metrics[packageObject.label].installed,
                    totalActive: totalActive
                };
            }
        });
        printDeploymentHistory(command, deploymentHistory, account.email);
    });
}
function deserializeConnectionInfo() {
    try {
        var savedConnection = fs.readFileSync(configFilePath, { encoding: "utf8" });
        var connectionInfo = JSON.parse(savedConnection);
        // If the connection info is in the legacy format, convert it to the modern format
        if (connectionInfo.accessKeyName) {
            connectionInfo = {
                accessKey: connectionInfo.accessKeyName
            };
        }
        var connInfo = connectionInfo;
        connInfo.proxy = getProxy(connInfo.proxy, connInfo.noProxy);
        return connInfo;
    }
    catch (ex) {
        return;
    }
}
function execute(command) {
    connectionInfo = deserializeConnectionInfo();
    return Q(null)
        .then(function () {
        switch (command.type) {
            // Must not be logged in
            case cli.CommandType.login:
            case cli.CommandType.register:
                if (connectionInfo) {
                    throw new Error("You are already logged in from this machine.");
                }
                break;
            // It does not matter whether you are logged in or not
            case cli.CommandType.link:
                break;
            // Must be logged in
            default:
                if (!!exports.sdk)
                    break; // Used by unit tests to skip authentication
                if (!connectionInfo) {
                    throw new Error("You are not currently logged in. Run the 'code-push login' command to authenticate with the CodePush server.");
                }
                exports.sdk = getSdk(connectionInfo.accessKey, CLI_HEADERS, connectionInfo.customServerUrl, connectionInfo.proxy);
                break;
        }
        switch (command.type) {
            case cli.CommandType.accessKeyAdd:
                return accessKeyAdd(command);
            case cli.CommandType.accessKeyPatch:
                return accessKeyPatch(command);
            case cli.CommandType.accessKeyList:
                return accessKeyList(command);
            case cli.CommandType.accessKeyRemove:
                return accessKeyRemove(command);
            case cli.CommandType.appAdd:
                return appAdd(command);
            case cli.CommandType.appList:
                return appList(command);
            case cli.CommandType.appRemove:
                return appRemove(command);
            case cli.CommandType.appRename:
                return appRename(command);
            case cli.CommandType.appTransfer:
                return appTransfer(command);
            case cli.CommandType.collaboratorAdd:
                return addCollaborator(command);
            case cli.CommandType.collaboratorList:
                return listCollaborators(command);
            case cli.CommandType.collaboratorRemove:
                return removeCollaborator(command);
            case cli.CommandType.debug:
                return debug_1.default(command);
            case cli.CommandType.deploymentAdd:
                return deploymentAdd(command);
            case cli.CommandType.deploymentHistoryClear:
                return deploymentHistoryClear(command);
            case cli.CommandType.deploymentHistory:
                return deploymentHistory(command);
            case cli.CommandType.deploymentList:
                return exports.deploymentList(command);
            case cli.CommandType.deploymentRemove:
                return deploymentRemove(command);
            case cli.CommandType.deploymentRename:
                return deploymentRename(command);
            case cli.CommandType.link:
                return link(command);
            case cli.CommandType.login:
                return login(command);
            case cli.CommandType.logout:
                return logout(command);
            case cli.CommandType.patch:
                return patch(command);
            case cli.CommandType.promote:
                return promote(command);
            case cli.CommandType.register:
                return register(command);
            case cli.CommandType.release:
                return exports.release(command);
            case cli.CommandType.releaseCordova:
                return exports.releaseCordova(command);
            case cli.CommandType.releaseReact:
                return exports.releaseReact(command);
            case cli.CommandType.rollback:
                return rollback(command);
            case cli.CommandType.sessionList:
                return sessionList(command);
            case cli.CommandType.sessionRemove:
                return sessionRemove(command);
            case cli.CommandType.whoami:
                return whoami(command);
            default:
                // We should never see this message as invalid commands should be caught by the argument parser.
                throw new Error("Invalid command:  " + JSON.stringify(command));
        }
    });
}
exports.execute = execute;
function fileDoesNotExistOrIsDirectory(filePath) {
    try {
        return fs.lstatSync(filePath).isDirectory();
    }
    catch (error) {
        return true;
    }
}
function getTotalActiveFromDeploymentMetrics(metrics) {
    var totalActive = 0;
    Object.keys(metrics).forEach(function (label) {
        totalActive += metrics[label].active;
    });
    return totalActive;
}
function initiateExternalAuthenticationAsync(action, serverUrl) {
    var message;
    if (action === "link") {
        message = "Please login to Mobile Center in the browser window we've just opened.\nIf you login with an additional authentication provider (e.g. GitHub) that shares the same email address, it will be linked to your current Mobile Center account.";
        // For "link" there shouldn't be a token prompt, so we go straight to the Mobile Center URL to avoid that
        exports.log(message);
        var url = serverUrl || AccountManager.MOBILE_CENTER_SERVER_URL;
        opener(url);
    }
    else {
        // We use this now for both login & register
        message = "Please login to Mobile Center in the browser window we've just opened.";
        exports.log(message);
        var hostname = os.hostname();
        var url = (serverUrl || AccountManager.SERVER_URL) + "/auth/" + action + "?hostname=" + hostname;
        opener(url);
    }
}
function link(command) {
    initiateExternalAuthenticationAsync("link", command.serverUrl);
    return Q(null);
}
function login(command) {
    // Check if one of the flags were provided.
    if (command.accessKey) {
        var proxy = getProxy(command.proxy, command.noProxy);
        exports.sdk = getSdk(command.accessKey, CLI_HEADERS, command.serverUrl, proxy);
        return exports.sdk.isAuthenticated()
            .then(function (isAuthenticated) {
            if (isAuthenticated) {
                serializeConnectionInfo(command.accessKey, true, command.serverUrl, command.proxy, command.noProxy);
            }
            else {
                throw new Error("Invalid access key.");
            }
        });
    }
    else {
        return loginWithExternalAuthentication("login", command.serverUrl, command.proxy, command.noProxy);
    }
}
function loginWithExternalAuthentication(action, serverUrl, proxy, noProxy) {
    initiateExternalAuthenticationAsync(action, serverUrl);
    exports.log(""); // Insert newline
    return requestAccessKey()
        .then(function (accessKey) {
        if (accessKey === null) {
            // The user has aborted the synchronous prompt (e.g.:  via [CTRL]+[C]).
            return;
        }
        exports.sdk = getSdk(accessKey, CLI_HEADERS, serverUrl, getProxy(proxy, noProxy));
        return exports.sdk.isAuthenticated()
            .then(function (isAuthenticated) {
            if (isAuthenticated) {
                serializeConnectionInfo(accessKey, false, serverUrl, proxy, noProxy);
            }
            else {
                throw new Error("Invalid token.");
            }
        });
    });
}
function logout(command) {
    return Q(null)
        .then(function () {
        if (!connectionInfo.preserveAccessKeyOnLogout) {
            var machineName = os.hostname();
            return exports.sdk.removeSession(machineName)
                .catch(function (error) {
                // If we are not authenticated or the session doesn't exist anymore, just swallow the error instead of displaying it
                if (error.statusCode !== AccountManager.ERROR_UNAUTHORIZED && error.statusCode !== AccountManager.ERROR_NOT_FOUND) {
                    throw error;
                }
            });
        }
    })
        .then(function () {
        exports.sdk = null;
        deleteConnectionInfoCache();
    });
}
function formatDate(unixOffset) {
    var date = moment(unixOffset);
    var now = moment();
    if (Math.abs(now.diff(date, "days")) < 30) {
        return date.fromNow(); // "2 hours ago"
    }
    else if (now.year() === date.year()) {
        return date.format("MMM D"); // "Nov 6"
    }
    else {
        return date.format("MMM D, YYYY"); // "Nov 6, 2014"
    }
}
function printAppList(format, apps) {
    if (format === "json") {
        printJson(apps);
    }
    else if (format === "table") {
        var headers = ["Name", "Deployments"];
        printTable(headers, function (dataSource) {
            apps.forEach(function (app, index) {
                var row = [app.name, wordwrap(50)(app.deployments.join(", "))];
                dataSource.push(row);
            });
        });
    }
}
function getCollaboratorDisplayName(email, collaboratorProperties) {
    return (collaboratorProperties.permission === AccountManager.AppPermission.OWNER) ? email + chalk.magenta(" (Owner)") : email;
}
function printCollaboratorsList(format, collaborators) {
    if (format === "json") {
        var dataSource = { "collaborators": collaborators };
        printJson(dataSource);
    }
    else if (format === "table") {
        var headers = ["E-mail Address"];
        printTable(headers, function (dataSource) {
            Object.keys(collaborators).forEach(function (email) {
                var row = [getCollaboratorDisplayName(email, collaborators[email])];
                dataSource.push(row);
            });
        });
    }
}
function printDeploymentList(command, deployments, showPackage) {
    if (showPackage === void 0) { showPackage = true; }
    if (command.format === "json") {
        printJson(deployments);
    }
    else if (command.format === "table") {
        var headers = ["Name"];
        if (command.displayKeys) {
            headers.push("Deployment Key");
        }
        if (showPackage) {
            headers.push("Update Metadata");
            headers.push("Install Metrics");
        }
        printTable(headers, function (dataSource) {
            deployments.forEach(function (deployment) {
                var row = [deployment.name];
                if (command.displayKeys) {
                    row.push(deployment.key);
                }
                if (showPackage) {
                    row.push(getPackageString(deployment.package));
                    row.push(getPackageMetricsString(deployment.package));
                }
                dataSource.push(row);
            });
        });
    }
}
function printDeploymentHistory(command, deploymentHistory, currentUserEmail) {
    if (command.format === "json") {
        printJson(deploymentHistory);
    }
    else if (command.format === "table") {
        var headers = ["Label", "Release Time", "App Version", "Mandatory"];
        if (command.displayAuthor) {
            headers.push("Released By");
        }
        headers.push("Description", "Install Metrics");
        printTable(headers, function (dataSource) {
            deploymentHistory.forEach(function (packageObject) {
                var releaseTime = formatDate(packageObject.uploadTime);
                var releaseSource;
                if (packageObject.releaseMethod === "Promote") {
                    releaseSource = "Promoted " + packageObject.originalLabel + " from \"" + packageObject.originalDeployment + "\"";
                }
                else if (packageObject.releaseMethod === "Rollback") {
                    var labelNumber = parseInt(packageObject.label.substring(1));
                    var lastLabel = "v" + (labelNumber - 1);
                    releaseSource = "Rolled back " + lastLabel + " to " + packageObject.originalLabel;
                }
                if (releaseSource) {
                    releaseTime += "\n" + chalk.magenta("(" + releaseSource + ")").toString();
                }
                var row = [packageObject.label, releaseTime, packageObject.appVersion, packageObject.isMandatory ? "Yes" : "No"];
                if (command.displayAuthor) {
                    var releasedBy = packageObject.releasedBy ? packageObject.releasedBy : "";
                    if (currentUserEmail && releasedBy === currentUserEmail) {
                        releasedBy = "You";
                    }
                    row.push(releasedBy);
                }
                row.push(packageObject.description ? wordwrap(30)(packageObject.description) : "");
                row.push(getPackageMetricsString(packageObject) + (packageObject.isDisabled ? "\n" + chalk.green("Disabled:") + " Yes" : ""));
                if (packageObject.isDisabled) {
                    row = row.map(function (cellContents) { return applyChalkSkippingLineBreaks(cellContents, chalk.dim); });
                }
                dataSource.push(row);
            });
        });
    }
}
function applyChalkSkippingLineBreaks(applyString, chalkMethod) {
    // Used to prevent "chalk" from applying styles to linebreaks which
    // causes table border chars to have the style applied as well.
    return applyString
        .split("\n")
        .map(function (token) { return chalkMethod(token); })
        .join("\n");
}
function getPackageString(packageObject) {
    if (!packageObject) {
        return chalk.magenta("No updates released").toString();
    }
    var packageString = chalk.green("Label: ") + packageObject.label + "\n" +
        chalk.green("App Version: ") + packageObject.appVersion + "\n" +
        chalk.green("Mandatory: ") + (packageObject.isMandatory ? "Yes" : "No") + "\n" +
        chalk.green("Release Time: ") + formatDate(packageObject.uploadTime) + "\n" +
        chalk.green("Released By: ") + (packageObject.releasedBy ? packageObject.releasedBy : "") +
        (packageObject.description ? wordwrap(70)("\n" + chalk.green("Description: ") + packageObject.description) : "");
    if (packageObject.isDisabled) {
        packageString += "\n" + chalk.green("Disabled:") + " Yes";
    }
    return packageString;
}
function getPackageMetricsString(obj) {
    var packageObject = obj;
    var rolloutString = (obj && obj.rollout && obj.rollout !== 100) ? "\n" + chalk.green("Rollout:") + " " + obj.rollout.toLocaleString() + "%" : "";
    if (!packageObject || !packageObject.metrics) {
        return chalk.magenta("No installs recorded").toString() + (rolloutString || "");
    }
    var activePercent = packageObject.metrics.totalActive
        ? packageObject.metrics.active / packageObject.metrics.totalActive * 100
        : 0.0;
    var percentString;
    if (activePercent === 100.0) {
        percentString = "100%";
    }
    else if (activePercent === 0.0) {
        percentString = "0%";
    }
    else {
        percentString = activePercent.toPrecision(2) + "%";
    }
    var numPending = packageObject.metrics.downloaded - packageObject.metrics.installed - packageObject.metrics.failed;
    var returnString = chalk.green("Active: ") + percentString + " (" + packageObject.metrics.active.toLocaleString() + " of " + packageObject.metrics.totalActive.toLocaleString() + ")\n" +
        chalk.green("Total: ") + packageObject.metrics.installed.toLocaleString();
    if (numPending > 0) {
        returnString += " (" + numPending.toLocaleString() + " pending)";
    }
    if (packageObject.metrics.failed) {
        returnString += "\n" + chalk.green("Rollbacks: ") + chalk.red(packageObject.metrics.failed.toLocaleString() + "");
    }
    if (rolloutString) {
        returnString += rolloutString;
    }
    return returnString;
}
function getReactNativeProjectAppVersion(command, projectName) {
    var fileExists = function (file) {
        try {
            return fs.statSync(file).isFile();
        }
        catch (e) {
            return false;
        }
    };
    // Allow plain integer versions (as well as '1.0' values) for now, e.g. '1' is valid here and we assume that it is equal to '1.0.0'.
    // (missing minor/patch values will be added on server side to pass semver.satisfies check)
    var isValidVersion = function (version) { return !!semver.valid(version) || /^\d+\.\d+$/.test(version) || /^\d+$/.test(version); };
    exports.log(chalk.cyan("Detecting " + command.platform + " app version:\n"));
    if (command.platform === "ios") {
        var resolvedPlistFile = command.plistFile;
        if (resolvedPlistFile) {
            // If a plist file path is explicitly provided, then we don't
            // need to attempt to "resolve" it within the well-known locations.
            if (!fileExists(resolvedPlistFile)) {
                throw new Error("The specified plist file doesn't exist. Please check that the provided path is correct.");
            }
        }
        else {
            // Allow the plist prefix to be specified with or without a trailing
            // separator character, but prescribe the use of a hyphen when omitted,
            // since this is the most commonly used convetion for plist files.
            if (command.plistFilePrefix && /.+[^-.]$/.test(command.plistFilePrefix)) {
                command.plistFilePrefix += "-";
            }
            var iOSDirectory = "ios";
            var plistFileName = (command.plistFilePrefix || "") + "Info.plist";
            var knownLocations = [
                path.join(iOSDirectory, projectName, plistFileName),
                path.join(iOSDirectory, plistFileName)
            ];
            resolvedPlistFile = knownLocations.find(fileExists);
            if (!resolvedPlistFile) {
                throw new Error("Unable to find either of the following plist files in order to infer your app's binary version: \"" + knownLocations.join("\", \"") + "\". If your plist has a different name, or is located in a different directory, consider using either the \"--plistFile\" or \"--plistFilePrefix\" parameters to help inform the CLI how to find it.");
            }
        }
        var plistContents = fs.readFileSync(resolvedPlistFile).toString();
        try {
            var parsedPlist = plist.parse(plistContents);
        }
        catch (e) {
            throw new Error("Unable to parse \"" + resolvedPlistFile + "\". Please ensure it is a well-formed plist file.");
        }
        if (parsedPlist && parsedPlist.CFBundleShortVersionString) {
            if (isValidVersion(parsedPlist.CFBundleShortVersionString)) {
                exports.log("Using the target binary version value \"" + parsedPlist.CFBundleShortVersionString + "\" from \"" + resolvedPlistFile + "\".\n");
                return Q(parsedPlist.CFBundleShortVersionString);
            }
            else {
                throw new Error("The \"CFBundleShortVersionString\" key in the \"" + resolvedPlistFile + "\" file needs to specify a valid semver string, containing both a major and minor version (e.g. 1.3.2, 1.1).");
            }
        }
        else {
            throw new Error("The \"CFBundleShortVersionString\" key doesn't exist within the \"" + resolvedPlistFile + "\" file.");
        }
    }
    else if (command.platform === "android") {
        var buildGradlePath = path.join("android", "app");
        if (command.gradleFile) {
            buildGradlePath = command.gradleFile;
        }
        if (fs.lstatSync(buildGradlePath).isDirectory()) {
            buildGradlePath = path.join(buildGradlePath, "build.gradle");
        }
        if (fileDoesNotExistOrIsDirectory(buildGradlePath)) {
            throw new Error("Unable to find gradle file \"" + buildGradlePath + "\".");
        }
        return g2js.parseFile(buildGradlePath)
            .catch(function () {
            throw new Error("Unable to parse the \"" + buildGradlePath + "\" file. Please ensure it is a well-formed Gradle file.");
        })
            .then(function (buildGradle) {
            var versionName = null;
            if (buildGradle.android && buildGradle.android.defaultConfig && buildGradle.android.defaultConfig.versionName) {
                versionName = buildGradle.android.defaultConfig.versionName;
            }
            else {
                throw new Error("The \"" + buildGradlePath + "\" file doesn't specify a value for the \"android.defaultConfig.versionName\" property.");
            }
            if (typeof versionName !== "string") {
                throw new Error("The \"android.defaultConfig.versionName\" property value in \"" + buildGradlePath + "\" is not a valid string. If this is expected, consider using the --targetBinaryVersion option to specify the value manually.");
            }
            var appVersion = versionName.replace(/"/g, "").trim();
            if (isValidVersion(appVersion)) {
                // The versionName property is a valid semver string,
                // so we can safely use that and move on.
                exports.log("Using the target binary version value \"" + appVersion + "\" from \"" + buildGradlePath + "\".\n");
                return appVersion;
            }
            else if (/^\d.*/.test(appVersion)) {
                // The versionName property isn't a valid semver string,
                // but it starts with a number, and therefore, it can't
                // be a valid Gradle property reference.
                throw new Error("The \"android.defaultConfig.versionName\" property in the \"" + buildGradlePath + "\" file needs to specify a valid semver string, containing both a major and minor version (e.g. 1.3.2, 1.1).");
            }
            // The version property isn't a valid semver string
            // so we assume it is a reference to a property variable.
            var propertyName = appVersion.replace("project.", "");
            var propertiesFileName = "gradle.properties";
            var knownLocations = [
                path.join("android", "app", propertiesFileName),
                path.join("android", propertiesFileName)
            ];
            // Search for gradle properties across all `gradle.properties` files
            var propertiesFile = null;
            for (var i = 0; i < knownLocations.length; i++) {
                propertiesFile = knownLocations[i];
                if (fileExists(propertiesFile)) {
                    var propertiesContent = fs.readFileSync(propertiesFile).toString();
                    try {
                        var parsedProperties = properties.parse(propertiesContent);
                        appVersion = parsedProperties[propertyName];
                        if (appVersion) {
                            break;
                        }
                    }
                    catch (e) {
                        throw new Error("Unable to parse \"" + propertiesFile + "\". Please ensure it is a well-formed properties file.");
                    }
                }
            }
            if (!appVersion) {
                throw new Error("No property named \"" + propertyName + "\" exists in the \"" + propertiesFile + "\" file.");
            }
            if (!isValidVersion(appVersion)) {
                throw new Error("The \"" + propertyName + "\" property in the \"" + propertiesFile + "\" file needs to specify a valid semver string, containing both a major and minor version (e.g. 1.3.2, 1.1).");
            }
            exports.log("Using the target binary version value \"" + appVersion + "\" from the \"" + propertyName + "\" key in the \"" + propertiesFile + "\" file.\n");
            return appVersion.toString();
        });
    }
    else {
        var appxManifestFileName = "Package.appxmanifest";
        try {
            var appxManifestContainingFolder = path.join("windows", projectName);
            var appxManifestContents = fs.readFileSync(path.join(appxManifestContainingFolder, "Package.appxmanifest")).toString();
        }
        catch (err) {
            throw new Error("Unable to find or read \"" + appxManifestFileName + "\" in the \"" + path.join("windows", projectName) + "\" folder.");
        }
        return parseXml(appxManifestContents)
            .catch(function (err) {
            throw new Error("Unable to parse the \"" + path.join(appxManifestContainingFolder, appxManifestFileName) + "\" file, it could be malformed.");
        })
            .then(function (parsedAppxManifest) {
            try {
                return parsedAppxManifest.Package.Identity[0]["$"].Version.match(/^\d+\.\d+\.\d+/)[0];
            }
            catch (e) {
                throw new Error("Unable to parse the package version from the \"" + path.join(appxManifestContainingFolder, appxManifestFileName) + "\" file.");
            }
        });
    }
}
function printJson(object) {
    exports.log(JSON.stringify(object, null, 2));
}
function printAccessKeys(format, keys) {
    if (format === "json") {
        printJson(keys);
    }
    else if (format === "table") {
        printTable(["Name", "Created" /*, "Expires" */], function (dataSource) {
            var now = new Date().getTime();
            function isExpired(key) {
                return now >= key.expires;
            }
            // Access keys never expire in Mobile Center (at least for now--maybe that feature will get added later), so don't show the Expires column anymore
            function keyToTableRow(key, dim) {
                var row = [
                    key.name,
                    key.createdTime ? formatDate(key.createdTime) : ""
                ];
                if (dim) {
                    row.forEach(function (col, index) {
                        row[index] = chalk.dim(col);
                    });
                }
                return row;
            }
            keys.forEach(function (key) {
                return !isExpired(key) && dataSource.push(keyToTableRow(key, false));
            });
            keys.forEach(function (key) {
                return isExpired(key) && dataSource.push(keyToTableRow(key, true));
            });
        });
    }
}
function printSessions(format, sessions) {
    if (format === "json") {
        printJson(sessions);
    }
    else if (format === "table") {
        printTable(["Machine", "Logged in"], function (dataSource) {
            sessions.forEach(function (session) {
                return dataSource.push([session.machineName, formatDate(session.loggedInTime)]);
            });
        });
    }
}
function printTable(columnNames, readData) {
    var table = new Table({
        head: columnNames,
        style: { head: ["cyan"] }
    });
    readData(table);
    exports.log(table.toString());
}
function register(command) {
    return loginWithExternalAuthentication("register", command.serverUrl, command.proxy, command.noProxy);
}
function promote(command) {
    var packageInfo = {
        appVersion: command.appStoreVersion,
        description: command.description,
        label: command.label,
        isDisabled: command.disabled,
        isMandatory: command.mandatory,
        rollout: command.rollout
    };
    return exports.sdk.promote(command.appName, command.sourceDeploymentName, command.destDeploymentName, packageInfo)
        .then(function () {
        exports.log("Successfully promoted " + (command.label ? "\"" + command.label + "\" of " : "") + "the \"" + command.sourceDeploymentName + "\" deployment of the \"" + command.appName + "\" app to the \"" + command.destDeploymentName + "\" deployment.");
    })
        .catch(function (err) { return releaseErrorHandler(err, command); });
}
function patch(command) {
    var packageInfo = {
        appVersion: command.appStoreVersion,
        description: command.description,
        isMandatory: command.mandatory,
        isDisabled: command.disabled,
        rollout: command.rollout
    };
    for (var updateProperty in packageInfo) {
        if (packageInfo[updateProperty] !== null) {
            return exports.sdk.patchRelease(command.appName, command.deploymentName, command.label, packageInfo)
                .then(function () {
                exports.log("Successfully updated the \"" + (command.label ? command.label : "latest") + "\" release of \"" + command.appName + "\" app's \"" + command.deploymentName + "\" deployment.");
            });
        }
    }
    throw new Error("At least one property must be specified to patch a release.");
}
exports.release = function (command) {
    if (isBinaryOrZip(command.package)) {
        throw new Error("It is unnecessary to package releases in a .zip or binary file. Please specify the direct path to the update content's directory (e.g. /platforms/ios/www) or file (e.g. main.jsbundle).");
    }
    throwForInvalidSemverRange(command.appStoreVersion);
    return Q(null).then(function () {
        // Copy the command so that the original is not modified
        var currentCommand = {
            appName: command.appName,
            appStoreVersion: command.appStoreVersion,
            deploymentName: command.deploymentName,
            description: command.description,
            disabled: command.disabled,
            mandatory: command.mandatory,
            package: command.package,
            rollout: command.rollout,
            privateKeyPath: command.privateKeyPath,
            type: command.type
        };
        var releaseHooksPromise = index_1.default.reduce(function (accumulatedPromise, hook) {
            return accumulatedPromise
                .then(function (modifiedCommand) {
                currentCommand = modifiedCommand || currentCommand;
                return hook(currentCommand, command, exports.sdk);
            });
        }, Q(currentCommand));
        return releaseHooksPromise
            .then(function () { })
            .catch(function (err) { return releaseErrorHandler(err, command); });
    });
};
exports.releaseCordova = function (command) {
    var releaseCommand = command;
    // Check for app and deployment exist before releasing an update.
    // This validation helps to save about 1 minute or more in case user has typed wrong app or deployment name.
    return validateDeployment(command.appName, command.deploymentName)
        .then(function () {
        var platform = command.platform.toLowerCase();
        var projectRoot = process.cwd();
        var platformFolder = path.join(projectRoot, "platforms", platform);
        var platformCordova = path.join(platformFolder, "cordova");
        var outputFolder;
        if (platform === "ios") {
            outputFolder = path.join(platformFolder, "www");
        }
        else if (platform === "android") {
            // Since cordova-android 7 assets directory moved to android/app/src/main/assets instead of android/assets                
            var outputFolderVer7 = path.join(platformFolder, "app", "src", "main", "assets", "www");
            if (fs.existsSync(outputFolderVer7)) {
                outputFolder = outputFolderVer7;
            }
            else {
                outputFolder = path.join(platformFolder, "assets", "www");
            }
        }
        else {
            throw new Error("Platform must be either \"ios\" or \"android\".");
        }
        var cordovaCommand = command.build ?
            (command.isReleaseBuildType ? "build --release" : "build") :
            "prepare";
        var cordovaCLI = "cordova";
        // Check whether the Cordova or PhoneGap CLIs are
        // installed, and if not, fail early
        try {
            which.sync(cordovaCLI);
        }
        catch (e) {
            try {
                cordovaCLI = "phonegap";
                which.sync(cordovaCLI);
            }
            catch (e) {
                throw new Error("Unable to " + cordovaCommand + " project. Please ensure that either the Cordova or PhoneGap CLI is installed.");
            }
        }
        exports.log(chalk.cyan("Running \"" + cordovaCLI + " " + cordovaCommand + "\" command:\n"));
        try {
            exports.execSync([cordovaCLI, cordovaCommand, platform, "--verbose"].join(" "), { stdio: "inherit" });
        }
        catch (error) {
            throw new Error("Unable to " + cordovaCommand + " project. Please ensure that the CWD represents a Cordova project and that the \"" + platform + "\" platform was added by running \"" + cordovaCLI + " platform add " + platform + "\".");
        }
        try {
            var configString = fs.readFileSync(path.join(projectRoot, "config.xml"), { encoding: "utf8" });
        }
        catch (error) {
            throw new Error("Unable to find or read \"config.xml\" in the CWD. The \"release-cordova\" command must be executed in a Cordova project folder.");
        }
        var configPromise = parseXml(configString);
        releaseCommand.package = outputFolder;
        releaseCommand.type = cli.CommandType.release;
        return configPromise
            .catch(function (err) {
            throw new Error("Unable to parse \"config.xml\" in the CWD. Ensure that the contents of \"config.xml\" is valid XML.");
        });
    })
        .then(function (parsedConfig) {
        var config = parsedConfig.widget;
        var releaseTargetVersion;
        if (command.appStoreVersion) {
            releaseTargetVersion = command.appStoreVersion;
        }
        else {
            releaseTargetVersion = config["$"].version;
        }
        throwForInvalidSemverRange(releaseTargetVersion);
        releaseCommand.appStoreVersion = releaseTargetVersion;
        exports.log(chalk.cyan("\nReleasing update contents to CodePush:\n"));
        return exports.release(releaseCommand);
    });
};
exports.releaseReact = function (command) {
    var bundleName = command.bundleName;
    var entryFile = command.entryFile;
    var outputFolder = command.outputDir || path.join(os.tmpdir(), "CodePush");
    var platform = command.platform = command.platform.toLowerCase();
    var releaseCommand = command;
    // we have to add "CodePush" root forlder to make update contents file structure 
    // to be compatible with React Native client SDK
    outputFolder = path.join(outputFolder, "CodePush");
    mkdirp.sync(outputFolder);
    // Check for app and deployment exist before releasing an update.
    // This validation helps to save about 1 minute or more in case user has typed wrong app or deployment name.
    return validateDeployment(command.appName, command.deploymentName)
        .then(function () {
        releaseCommand.package = outputFolder;
        switch (platform) {
            case "android":
            case "ios":
            case "windows":
                if (!bundleName) {
                    bundleName = platform === "ios"
                        ? "main.jsbundle"
                        : "index." + platform + ".bundle";
                }
                break;
            default:
                throw new Error("Platform must be \"android\", \"ios\", or \"windows\".");
        }
        try {
            var projectPackageJson = require(path.join(process.cwd(), "package.json"));
            var projectName = projectPackageJson.name;
            if (!projectName) {
                throw new Error("The \"package.json\" file in the CWD does not have the \"name\" field set.");
            }
            var isReactNativeProject = projectPackageJson.dependencies["react-native"] ||
                (projectPackageJson.devDependencies && projectPackageJson.devDependencies["react-native"]);
            if (!isReactNativeProject) {
                throw new Error("The project in the CWD is not a React Native project.");
            }
        }
        catch (error) {
            throw new Error("Unable to find or read \"package.json\" in the CWD. The \"release-react\" command must be executed in a React Native project folder.");
        }
        if (!entryFile) {
            entryFile = "index." + platform + ".js";
            if (fileDoesNotExistOrIsDirectory(entryFile)) {
                entryFile = "index.js";
            }
            if (fileDoesNotExistOrIsDirectory(entryFile)) {
                throw new Error("Entry file \"index." + platform + ".js\" or \"index.js\" does not exist.");
            }
        }
        else {
            if (fileDoesNotExistOrIsDirectory(entryFile)) {
                throw new Error("Entry file \"" + entryFile + "\" does not exist.");
            }
        }
        if (command.appStoreVersion) {
            throwForInvalidSemverRange(command.appStoreVersion);
        }
        var appVersionPromise = command.appStoreVersion
            ? Q(command.appStoreVersion)
            : getReactNativeProjectAppVersion(command, projectName);
        if (command.outputDir) {
            command.sourcemapOutput = path.join(releaseCommand.package, bundleName + ".map");
        }
        return appVersionPromise;
    })
        .then(function (appVersion) {
        releaseCommand.appStoreVersion = appVersion;
        return exports.createEmptyTempReleaseFolder(outputFolder);
    })
        .then(function () { return deleteFolder(os.tmpdir() + "/react-*"); })
        .then(function () { return exports.runReactNativeBundleCommand(bundleName, command.development || false, entryFile, outputFolder, platform, command.sourcemapOutput, command.config); })
        .then(function () {
        exports.log(chalk.cyan("\nReleasing update contents to CodePush:\n"));
        return exports.release(releaseCommand);
    })
        .then(function () {
        if (!command.outputDir) {
            deleteFolder(outputFolder);
        }
    })
        .catch(function (err) {
        deleteFolder(outputFolder);
        throw err;
    });
};
function validateDeployment(appName, deploymentName) {
    return exports.sdk.getDeployment(appName, deploymentName)
        .catch(function (err) {
        // If we get an error that the deployment doesn't exist (but not the app doesn't exist), then tack on a more descriptive error message telling the user what to do
        if (err.statusCode === AccountManager.ERROR_NOT_FOUND && err.message.indexOf("Deployment") !== -1) {
            err.message = err.message + "\nUse \"code-push deployment list\" to view any existing deployments and \"code-push deployment add\" to add deployment(s) to the app.";
        }
        throw err;
    });
}
function rollback(command) {
    return exports.confirm()
        .then(function (wasConfirmed) {
        if (!wasConfirmed) {
            exports.log("Rollback cancelled.");
            return;
        }
        return exports.sdk.rollback(command.appName, command.deploymentName, command.targetRelease || undefined)
            .then(function () {
            exports.log("Successfully performed a rollback on the \"" + command.deploymentName + "\" deployment of the \"" + command.appName + "\" app.");
        });
    });
}
function requestAccessKey() {
    return Promise(function (resolve, reject, notify) {
        prompt.message = "";
        prompt.delimiter = "";
        prompt.start();
        prompt.get({
            properties: {
                response: {
                    description: chalk.cyan("Enter your token from the browser: ")
                }
            }
        }, function (err, result) {
            if (err) {
                resolve(null);
            }
            else {
                resolve(result.response.trim());
            }
        });
    });
}
exports.runReactNativeBundleCommand = function (bundleName, development, entryFile, outputFolder, platform, sourcemapOutput, config) {
    var reactNativeBundleArgs = [];
    var envNodeArgs = process.env.CODE_PUSH_NODE_ARGS;
    if (typeof envNodeArgs !== "undefined") {
        Array.prototype.push.apply(reactNativeBundleArgs, envNodeArgs.trim().split(/\s+/));
    }
    Array.prototype.push.apply(reactNativeBundleArgs, [
        path.join("node_modules", "react-native", "local-cli", "cli.js"), "bundle",
        "--assets-dest", outputFolder,
        "--bundle-output", path.join(outputFolder, bundleName),
        "--dev", development,
        "--entry-file", entryFile,
        "--platform", platform,
    ]);
    if (sourcemapOutput) {
        reactNativeBundleArgs.push("--sourcemap-output", sourcemapOutput);
    }
    if (config) {
        reactNativeBundleArgs.push("--config", config);
    }
    exports.log(chalk.cyan("Running \"react-native bundle\" command:\n"));
    var reactNativeBundleProcess = exports.spawn("node", reactNativeBundleArgs);
    exports.log("node " + reactNativeBundleArgs.join(" "));
    return Promise(function (resolve, reject, notify) {
        reactNativeBundleProcess.stdout.on("data", function (data) {
            exports.log(data.toString().trim());
        });
        reactNativeBundleProcess.stderr.on("data", function (data) {
            console.error(data.toString().trim());
        });
        reactNativeBundleProcess.on("close", function (exitCode) {
            if (exitCode) {
                reject(new Error("\"react-native bundle\" command exited with code " + exitCode + "."));
            }
            resolve(null);
        });
    });
};
function serializeConnectionInfo(accessKey, preserveAccessKeyOnLogout, customServerUrl, proxy, noProxy) {
    var connectionInfo = { accessKey: accessKey, preserveAccessKeyOnLogout: preserveAccessKeyOnLogout, proxy: proxy, noProxy: noProxy };
    if (customServerUrl) {
        connectionInfo.customServerUrl = customServerUrl;
    }
    var json = JSON.stringify(connectionInfo);
    fs.writeFileSync(configFilePath, json, { encoding: "utf8" });
    exports.log("\r\nSuccessfully logged-in. Your session file was written to " + chalk.cyan(configFilePath) + ". You can run the " + chalk.cyan("code-push logout") + " command at any time to delete this file and terminate your session.\r\n");
}
function sessionList(command) {
    throwForInvalidOutputFormat(command.format);
    return exports.sdk.getSessions()
        .then(function (sessions) {
        printSessions(command.format, sessions);
    });
}
function sessionRemove(command) {
    if (os.hostname() === command.machineName) {
        throw new Error("Cannot remove the current login session via this command. Please run 'code-push logout' instead.");
    }
    else {
        return exports.confirm()
            .then(function (wasConfirmed) {
            if (wasConfirmed) {
                return exports.sdk.removeSession(command.machineName)
                    .then(function () {
                    exports.log("Successfully removed the login session for \"" + command.machineName + "\".");
                });
            }
            exports.log("Session removal cancelled.");
        });
    }
}
function releaseErrorHandler(error, command) {
    if (command.noDuplicateReleaseError && error.statusCode === AccountManager.ERROR_CONFLICT) {
        console.warn(chalk.yellow("[Warning] " + error.message));
    }
    else {
        throw error;
    }
}
function isBinaryOrZip(path) {
    return path.search(/\.zip$/i) !== -1
        || path.search(/\.apk$/i) !== -1
        || path.search(/\.ipa$/i) !== -1;
}
function throwForInvalidEmail(email) {
    if (!emailValidator.validate(email)) {
        throw new Error("\"" + email + "\" is an invalid e-mail address.");
    }
}
function throwForInvalidSemverRange(semverRange) {
    if (semver.validRange(semverRange) === null) {
        throw new Error("Please use a semver-compliant target binary version range, for example \"1.0.0\", \"*\" or \"^1.2.3\".");
    }
}
function throwForInvalidOutputFormat(format) {
    switch (format) {
        case "json":
        case "table":
            break;
        default:
            throw new Error("Invalid format:  " + format + ".");
    }
}
function whoami(command) {
    return exports.sdk.getAccountInfo()
        .then(function (account) {
        var accountInfo = "" + account.email;
        var connectionInfo = deserializeConnectionInfo();
        if (connectionInfo.noProxy || connectionInfo.proxy) {
            exports.log(chalk.green('Account: ') + accountInfo);
            var proxyInfo = chalk.green('Proxy: ') + (connectionInfo.noProxy ? 'Ignored' : connectionInfo.proxy);
            exports.log(proxyInfo);
        }
        else {
            exports.log(accountInfo);
        }
    });
}
function getProxy(proxy, noProxy) {
    if (noProxy)
        return null;
    if (!proxy)
        return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    else
        return proxy;
}
function isCommandOptionSpecified(option) {
    return option !== undefined && option !== null;
}
function getSdk(accessKey, headers, customServerUrl, proxy) {
    var sdk = new AccountManager(accessKey, CLI_HEADERS, customServerUrl, proxy);
    /*
     * If the server returns `Unauthorized`, it must be due to an invalid
     * (or expired) access key. For convenience, we patch every SDK call
     * to delete the cached connection so the user can simply
     * login again instead of having to log out first.
     */
    Object.getOwnPropertyNames(AccountManager.prototype).forEach(function (functionName) {
        if (typeof sdk[functionName] === "function") {
            var originalFunction = sdk[functionName];
            sdk[functionName] = function () {
                var maybePromise = originalFunction.apply(sdk, arguments);
                if (maybePromise && maybePromise.then !== undefined) {
                    maybePromise = maybePromise
                        .catch(function (error) {
                        if (error.statusCode && error.statusCode === AccountManager.ERROR_UNAUTHORIZED) {
                            deleteConnectionInfoCache(false);
                        }
                        throw error;
                    });
                }
                return maybePromise;
            };
        }
    });
    return sdk;
}

//# sourceMappingURL=command-executor.js.map
