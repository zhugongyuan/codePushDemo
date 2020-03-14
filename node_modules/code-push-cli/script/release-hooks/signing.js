var fs = require("fs");
var hashUtils = require("../hash-utils");
var jwt = require("jsonwebtoken");
var os = require("os");
var path = require("path");
var q = require("q");
var rimraf = require("rimraf");
var CURRENT_CLAIM_VERSION = "1.0.0";
var METADATA_FILE_NAME = ".codepushrelease";
var deletePreviousSignatureIfExists = function (package) {
    var signatureFilePath = path.join(package, METADATA_FILE_NAME);
    var prevSignatureExists = true;
    try {
        fs.accessSync(signatureFilePath, fs.R_OK);
    }
    catch (err) {
        if (err.code === "ENOENT") {
            prevSignatureExists = false;
        }
        else {
            return q.reject(new Error("Could not delete previous release signature at " + signatureFilePath + ".\n                Please, check your access rights."));
        }
    }
    if (prevSignatureExists) {
        console.log("Deleting previous release signature at " + signatureFilePath);
        rimraf.sync(signatureFilePath);
    }
    return q.resolve(null);
};
var sign = function (currentCommand, originalCommand, sdk) {
    if (!currentCommand.privateKeyPath) {
        if (fs.lstatSync(currentCommand.package).isDirectory()) {
            // If new update wasn't signed, but signature file for some reason still appears in the package directory - delete it
            return deletePreviousSignatureIfExists(currentCommand.package).then(function () {
                return q.resolve(currentCommand);
            });
        }
        else {
            return q.resolve(currentCommand);
        }
    }
    var privateKey;
    var signatureFilePath;
    return q(null)
        .then(function () {
        signatureFilePath = path.join(currentCommand.package, METADATA_FILE_NAME);
        try {
            privateKey = fs.readFileSync(currentCommand.privateKeyPath);
        }
        catch (err) {
            return q.reject(new Error("The path specified for the signing key (\"" + currentCommand.privateKeyPath + "\") was not valid"));
        }
        if (!fs.lstatSync(currentCommand.package).isDirectory()) {
            // If releasing a single file, copy the file to a temporary 'CodePush' directory in which to publish the release
            var outputFolderPath = path.join(os.tmpdir(), "CodePush");
            rimraf.sync(outputFolderPath);
            fs.mkdirSync(outputFolderPath);
            var outputFilePath = path.join(outputFolderPath, path.basename(currentCommand.package));
            fs.writeFileSync(outputFilePath, fs.readFileSync(currentCommand.package));
            currentCommand.package = outputFolderPath;
        }
        return deletePreviousSignatureIfExists(currentCommand.package);
    })
        .then(function () {
        return hashUtils.generatePackageHashFromDirectory(currentCommand.package, path.join(currentCommand.package, ".."));
    })
        .then(function (hash) {
        var claims = {
            claimVersion: CURRENT_CLAIM_VERSION,
            contentHash: hash
        };
        return q.nfcall(jwt.sign, claims, privateKey, { algorithm: "RS256" })
            .catch(function (err) {
            return q.reject(new Error("The specified signing key file was not valid"));
        });
    })
        .then(function (signedJwt) {
        var deferred = q.defer();
        fs.writeFile(signatureFilePath, signedJwt, function (err) {
            if (err) {
                deferred.reject(err);
            }
            else {
                console.log("Generated a release signature and wrote it to " + signatureFilePath);
                deferred.resolve(null);
            }
        });
        return deferred.promise;
    })
        .then(function () { return currentCommand; })
        .catch(function (err) {
        err.message = "Could not sign package: " + err.message;
        return q.reject(err);
    });
};
module.exports = sign;

//# sourceMappingURL=signing.js.map
