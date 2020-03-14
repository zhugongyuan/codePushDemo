//todo is it safe? maybe we should use guid\uuid generation here?
var CommonUtils = (function () {
    function CommonUtils() {
    }
    CommonUtils.generateRandomFilename = function (length) {
        var filename = "";
        var validChar = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < length; i++) {
            filename += validChar.charAt(Math.floor(Math.random() * validChar.length));
        }
        return filename;
    };
    CommonUtils.log = function (message) { return console.log(message); };
    return CommonUtils;
})();
exports.CommonUtils = CommonUtils;

//# sourceMappingURL=common-utils.js.map
