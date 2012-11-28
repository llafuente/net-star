(function (exports) {
    "use strict";

    var Class = require("node-class").Class,
        Transport;

    Transport = new Class("Transport", {
    });

    Transport.abstract({
        new_connection: function(connection) {
        },
        parse: function (message) {
        },
        encode: function (message) {
        }
    });

    module.exports.Transport = Transport;

}(module.exports));