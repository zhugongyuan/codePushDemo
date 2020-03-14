/**
 * NOTE!!! This utility file is duplicated for use by the CodePush service (for server-driven hashing/
 * integrity checks) and Management SDK (for end-to-end code signing), please keep them in sync.
 */
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var q = require("q");
// Do not throw an exception if either of these modules are missing, as they may not be needed by the
// consumer of this file.
// - recursiveFs: Only required for hashing of directories
// - yauzl: Only required for in-memory hashing of zip files
try {
    var recursiveFs = require("recursive-fs");
}
catch (e) { }
try {
    var yauzl = require("yauzl");
}
catch (e) { }
var HASH_ALGORITHM = "sha256";
function generatePackageHashFromDirectory(directoryPath, basePath) {
    if (!fs.lstatSync(directoryPath).isDirectory()) {
        throw new Error("Not a directory. Please either create a directory, or use hashFile().");
    }
    return generatePackageManifestFromDirectory(directoryPath, basePath)
        .then(function (manifest) {
        return manifest.computePackageHash();
    });
}
exports.generatePackageHashFromDirectory = generatePackageHashFromDirectory;
function generatePackageManifestFromZip(filePath) {
    var deferred = q.defer();
    var reject = function (error) {
        if (deferred.promise.isPending()) {
            deferred.reject(error);
        }
    };
    var resolve = function (manifest) {
        if (deferred.promise.isPending()) {
            deferred.resolve(manifest);
        }
    };
    var zipFile;
    yauzl.open(filePath, { lazyEntries: true }, function (error, openedZipFile) {
        if (error) {
            // This is the first time we try to read the package as a .zip file;
            // however, it may not be a .zip file.  Handle this gracefully.
            resolve(null);
            return;
        }
        zipFile = openedZipFile;
        var fileHashesMap = new Map();
        var hashFilePromises = [];
        // Read each entry in the archive sequentially and generate a hash for it.
        zipFile.readEntry();
        zipFile
            .on("error", function (error) {
            reject(error);
        })
            .on("entry", function (entry) {
            var fileName = PackageManifest.normalizePath(entry.fileName);
            if (PackageManifest.isIgnored(fileName)) {
                zipFile.readEntry();
                return;
            }
            zipFile.openReadStream(entry, function (error, readStream) {
                if (error) {
                    reject(error);
                    return;
                }
                hashFilePromises.push(hashStream(readStream)
                    .then(function (hash) {
                    fileHashesMap.set(fileName, hash);
                    zipFile.readEntry();
                }, reject));
            });
        })
            .on("end", function () {
            q.all(hashFilePromises).then(function () { return resolve(new PackageManifest(fileHashesMap)); }, reject);
        });
    });
    return deferred.promise
        .finally(function () { return zipFile && zipFile.close(); });
}
exports.generatePackageManifestFromZip = generatePackageManifestFromZip;
function generatePackageManifestFromDirectory(directoryPath, basePath) {
    var deferred = q.defer();
    var fileHashesMap = new Map();
    recursiveFs.readdirr(directoryPath, function (error, directories, files) {
        if (error) {
            deferred.reject(error);
            return;
        }
        if (!files || files.length === 0) {
            deferred.reject("Error: Can't sign the release because no files were found.");
            return;
        }
        // Hash the files sequentially, because streaming them in parallel is not necessarily faster
        var generateManifestPromise = files.reduce(function (soFar, filePath) {
            return soFar
                .then(function () {
                var relativePath = PackageManifest.normalizePath(path.relative(basePath, filePath));
                if (!PackageManifest.isIgnored(relativePath)) {
                    return hashFile(filePath)
                        .then(function (hash) {
                        fileHashesMap.set(relativePath, hash);
                    });
                }
            });
        }, q(null));
        generateManifestPromise
            .then(function () {
            deferred.resolve(new PackageManifest(fileHashesMap));
        }, deferred.reject)
            .done();
    });
    return deferred.promise;
}
exports.generatePackageManifestFromDirectory = generatePackageManifestFromDirectory;
function hashFile(filePath) {
    var readStream = fs.createReadStream(filePath);
    return hashStream(readStream);
}
exports.hashFile = hashFile;
function hashStream(readStream) {
    var hashStream = crypto.createHash(HASH_ALGORITHM);
    var deferred = q.defer();
    readStream
        .on("error", function (error) {
        if (deferred.promise.isPending()) {
            hashStream.end();
            deferred.reject(error);
        }
    })
        .on("end", function () {
        if (deferred.promise.isPending()) {
            hashStream.end();
            var buffer = hashStream.read();
            var hash = buffer.toString("hex");
            deferred.resolve(hash);
        }
    });
    readStream.pipe(hashStream);
    return deferred.promise;
}
exports.hashStream = hashStream;
var PackageManifest = (function () {
    function PackageManifest(map) {
        if (!map) {
            map = new Map();
        }
        this._map = map;
    }
    PackageManifest.prototype.toMap = function () {
        return this._map;
    };
    PackageManifest.prototype.computePackageHash = function () {
        var entries = [];
        this._map.forEach(function (hash, name) {
            entries.push(name + ":" + hash);
        });
        // Make sure this list is alphabetically ordered so that other clients
        // can also compute this hash easily given the update contents.
        entries = entries.sort();
        return q(crypto.createHash(HASH_ALGORITHM)
            .update(JSON.stringify(entries))
            .digest("hex"));
    };
    PackageManifest.prototype.serialize = function () {
        var obj = {};
        this._map.forEach(function (value, key) {
            obj[key] = value;
        });
        return JSON.stringify(obj);
    };
    PackageManifest.deserialize = function (serializedContents) {
        try {
            var obj = JSON.parse(serializedContents);
            var map = new Map();
            for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
                var key = _a[_i];
                map.set(key, obj[key]);
            }
            return new PackageManifest(map);
        }
        catch (e) {
        }
    };
    PackageManifest.normalizePath = function (filePath) {
        //replace all backslashes coming from cli running on windows machines by slashes
        return filePath.replace(/\\/g, "/");
    };
    PackageManifest.isIgnored = function (relativeFilePath) {
        var __MACOSX = "__MACOSX/";
        var DS_STORE = ".DS_Store";
        var CODEPUSH_METADATA = ".codepushrelease";
        return startsWith(relativeFilePath, __MACOSX)
            || relativeFilePath === DS_STORE
            || endsWith(relativeFilePath, "/" + DS_STORE)
            || relativeFilePath === CODEPUSH_METADATA
            || endsWith(relativeFilePath, "/" + CODEPUSH_METADATA);
    };
    return PackageManifest;
})();
exports.PackageManifest = PackageManifest;
function startsWith(str, prefix) {
    return str && str.substring(0, prefix.length) === prefix;
}
function endsWith(str, suffix) {
    return str && str.indexOf(suffix, str.length - suffix.length) !== -1;
}

//# sourceMappingURL=hash-utils.js.map
