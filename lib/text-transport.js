(function (exports) {
    "use strict";

    var Class = require("node-class").Class,
        __typeof = require("node-class").typeof,
        Transport = require("./transport.js").Transport,
        NetStar = require("./net-star.js").NetStar,
        TextTransport;

    TextTransport = new Class("TextTransport", {
    });

    TextTransport.extends(Transport);

    function parse_args(args_str) {
        if (args_str[0] === "{" || args_str[0] === "[") { // JSON!
            return JSON.parse(args_str); // TODO: try/catch ?!
        }

        // single-double quote space string
        console.log("parsing args", args_str);
        // search for a quoted or non-spaced group
        var regex = new RegExp("\'(\\\"|(?!\\\").)+\'|\"(\\\"|(?!\\\").)+\"|[^ ]+"),
            arr = [],
            m;

        console.log(args_str);

        while (args_str.length > 0) {
            args_str = args_str.trim();
            if (regex.test(args_str)) {
                m = args_str.match(regex)[0];
                arr.push(m);
                args_str = args_str.substring(m.length); // progress to next "word"
            }
        }

        return arr;
    }

    TextTransport.implements({
        new_connection: function(connection) {
            connection.setEncoding('utf8');
        },
        parse: function(message) {

            if (message.length === 0) {
                return false;
            }

            // has a space!
            var cut,
                output = {
                    command: null,
                    args: null
                };

            // just the command ?
            if ((cut = message.indexOf(" ")) === -1) {
                output.command = message;
            } else {

                output.command = message.substring(0, cut);
                output.args = message.substring(cut + 1);

                if (output.command !== NetStar.COMMAND_APP_MESSAGE) { // internal command so parse
                    output.args = parse_args(output.args);
                }

            }

            return output;
        },
        encode: function(id, command, args, ack_required) {
            //leave args instact if is a app message
            if(command !== NetStar.COMMAND_APP_MESSAGE && args) {
                switch(__typeof(args)) {
                    case 'object':
                    case 'array':
                        args = JSON.stringify(args);
                        break;
                    case 'string':
                    case 'number':
                    default:
                        args = '';
                }
            }

            return (args && args.length ? command + " " + args : command);
        },
    });

    module.exports.TextTransport = TextTransport;

}(module.exports));

