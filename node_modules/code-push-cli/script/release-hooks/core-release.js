/// <reference path="../../../definitions/external/q/Q.d.ts" />
/// <reference path="../../../definitions/external/node/node.d.ts" />
/// <reference path="../../definitions/recursive-fs.d.ts" />
/// <reference path="../../definitions/slash.d.ts" />
/// <reference path="../definitions/slash.d.ts" />
/// <reference path="../../definitions/generated/code-push.d.ts" />
var fs = require("fs");
var path = require("path");
var recursiveFs = require("recursive-fs");
var slash = require("slash");
var Q = require("q");
var Promise = Q.Promise;
var yazl = require("yazl");
var progress = require("progress");
var common_utils_1 = require("../common-utils");
var log = common_utils_1.CommonUtils.log;
var coreReleaseHook = function (currentCommand, originalCommand, sdk) {
    return Q(null)
        .then(function () {
        var releaseFiles = [];
        if (!fs.lstatSync(currentCommand.package).isDirectory()) {
            releaseFiles.push({
                sourceLocation: currentCommand.package,
                targetLocation: path.basename(currentCommand.package) // Put the file in the root
            });
            return Q(releaseFiles);
        }
        var deferred = Q.defer();
        var directoryPath = currentCommand.package;
        var baseDirectoryPath = path.join(directoryPath, ".."); // For legacy reasons, put the root directory in the zip
        recursiveFs.readdirr(currentCommand.package, function (error, directories, files) {
            if (error) {
                deferred.reject(error);
                return;
            }
            files.forEach(function (filePath) {
                var relativePath = path.relative(baseDirectoryPath, filePath);
                // yazl does not like backslash (\) in the metadata path.
                relativePath = slash(relativePath);
                releaseFiles.push({
                    sourceLocation: filePath,
                    targetLocation: relativePath
                });
            });
            deferred.resolve(releaseFiles);
        });
        return deferred.promise;
    })
        .then(function (releaseFiles) {
        return Promise(function (resolve, reject) {
            var packagePath = path.join(process.cwd(), common_utils_1.CommonUtils.generateRandomFilename(15) + ".zip");
            var zipFile = new yazl.ZipFile();
            var writeStream = fs.createWriteStream(packagePath);
            zipFile.outputStream.pipe(writeStream)
                .on("error", function (error) {
                reject(error);
            })
                .on("close", function () {
                resolve(packagePath);
            });
            releaseFiles.forEach(function (releaseFile) {
                zipFile.addFile(releaseFile.sourceLocation, releaseFile.targetLocation);
            });
            zipFile.end();
        });
    })
        .then(function (packagePath) {
        var lastTotalProgress = 0;
        var progressBar = new progress("Upload progress:[:bar] :percent :etas", {
            complete: "=",
            incomplete: " ",
            width: 50,
            total: 100
        });
        var uploadProgress = function (currentProgress) {
            progressBar.tick(currentProgress - lastTotalProgress);
            lastTotalProgress = currentProgress;
        };
        var updateMetadata = {
            description: currentCommand.description,
            isDisabled: currentCommand.disabled,
            isMandatory: currentCommand.mandatory,
            rollout: currentCommand.rollout
        };
        return sdk.isAuthenticated(true)
            .then(function (isAuth) {
            return sdk.release(currentCommand.appName, currentCommand.deploymentName, packagePath, currentCommand.appStoreVersion, updateMetadata, uploadProgress);
        })
            .then(function () {
            log(("Successfully released an update containing the \"" + originalCommand.package + "\" ")
                + ("" + (fs.lstatSync(originalCommand.package).isDirectory() ? "directory" : "file"))
                + (" to the \"" + currentCommand.deploymentName + "\" deployment of the \"" + currentCommand.appName + "\" app."));
        })
            .then(function () { return currentCommand; })
            .finally(function () {
            fs.unlinkSync(packagePath);
        });
    });
};
module.exports = coreReleaseHook;

//# sourceMappingURL=core-release.js.map
