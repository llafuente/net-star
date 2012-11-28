(function (exports) {
    "use strict";

    var Class = require("node-class").Class,
        Events = require("node-class").Events,
        TextTransport,
        net = require("net"),
        NetStar,
        DELIMITER = '\r\n';

//console.log = function () {};

    NetStar = new Class("NetStar", {
        __control_host: '127.0.0.1',
        __control_port: 1337,
        __name: "unnamed-node",
        __control_server: null,
        __control_nodes: {},
        __control_node_list: [],
        __transport: null,
        __tags: [],
        __stats: {
            commands: 0,
            exec_time: false,
            parse_time: false,
            last_command_time: 0
        }
    });

    NetStar.COMMAND_PING = "ping";
    NetStar.COMMAND_PONG = "pong";
    NetStar.COMMAND_UPDATE_SERVER_INFO = "update-info";
    NetStar.COMMAND_UPDATE_SEVER_LIST = "update-list";
    NetStar.COMMAND_GET_SERVER_LIST = "get-server-list";
    NetStar.COMMAND_SHUTDOWN = "shutdown";
    NetStar.COMMAND_APP_MESSAGE = "msg";
    NetStar.COMMAND_ROUTE = "route";
    NetStar.COMMAND_BROADCAST = "broadcast";
    NetStar.COMMAND_STATS = "stats";

    //
    NetStar.COMMAND_GET_UID = "get-uid"; //and use


    //
    NetStar.COMMAND_TUMBLE_MASTER = "tumble-master";
    NetStar.COMMAND_MATER_IS_DEAD = "dead-master";
    //->
    NetStar.COMMAND_MATER_IS_DEAD = "bid <number>";
    //->
    NetStar.COMMAND_MATER_IS_DEAD = "elected <list>";
    NetStar.COMMAND_MATER_IS_DEAD = "bid <number>";
    // |->
    NetStar.COMMAND_MATER_IS_DEAD = "master <node>";


    NetStar.extends(Events);


    NetStar.implements({
        __get_server_info: function (respond) {
            return {
                command: NetStar.COMMAND_UPDATE_SERVER_INFO,
                args: {
                    name: this.__name,
                    addr: {
                        host: '127.0.0.1', //process.env.HOSTNAME,
                        port: this.__control_port
                    },
                    tags: this.__tags,
                    respond: respond
                }
            };
        },

        on_command: function (command, args, connection) {
            console.log("exec command", command || "no-name-command ?", args);

            var i,
                list,
                max,
                found,
                connect_list,
                response = [];

            switch (command) {
            case NetStar.COMMAND_STATS:
                response.push({command: "result ", args: this.__stats});
                break;

            case NetStar.COMMAND_ROUTE:
                this.route(args[0], args.splice(1).join(" "), connection);
                break;

            case NetStar.COMMAND_BROADCAST:
                this.broadcast(args.join(" "), connection);
                break;

            case NetStar.COMMAND_APP_MESSAGE:
                console.error(NetStar.COMMAND_APP_MESSAGE, "require parameter <message>");
                break;

            case NetStar.COMMAND_SHUTDOWN:
                console.log("request shutdown arrive from: ", connection.$__addr);
                process.exit();
                break;

            case NetStar.COMMAND_PING:
                response.push(this.__get_server_info(true));
                response.push({command: NetStar.COMMAND_GET_SERVER_LIST, args: null});
                break;

            case NetStar.COMMAND_GET_SERVER_LIST:
                response.push({command: NetStar.COMMAND_UPDATE_SEVER_LIST, args: this.__control_node_list});
                break;

            case NetStar.COMMAND_UPDATE_SEVER_LIST:
                list = this.__control_node_list;
                max = list.length;

                connect_list = args.filter(function (s) {
                    found = false;

                    for (i = 0; i < max; ++i) {
                        if (list[i].port === s.port && list[i].host === s.host) {
                            return false;
                        }
                    }

                    return true;
                });

                console.log("connect_list", connect_list);
                this.connect(connect_list);
                this.emit("ready");
                break;

            case NetStar.COMMAND_UPDATE_SERVER_INFO:
                connection.$__name = args.name;
                args.addr.name = args.name;
                args.addr.tags = args.tags;
                connection.$__addr = args.addr;

                args.connection = connection;
                this.__control_nodes[args.name] = args;

                for (i = 0; i < this.__control_node_list.length; ++i) {
                    if (this.__control_node_list[i].host === args.addr.host && this.__control_node_list[i].port === args.addr.port) {
                        this.__control_node_list[i] = connection.$__addr;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    this.__control_node_list.push(args.addr);
                }

                if (args.respond === true) {
                    response.push(response = this.__get_server_info(false));
                }
                break;
            case NetStar.COMMAND_TUMBLE_MASTER:
                this.__add_state("master-elections");
                break;
            }

            console.log(response.length, response);
            if (response.length) {
                var i = 0,
                    encoded;
                for (i = 0; i < response.length; ++i) {
                    encoded = this.__transport.encode(null, response[i].command, response[i].args, null);
                    console.log(encoded);
                    connection.write(encoded);
                    connection.write(DELIMITER);
                }
                console.log(">>outgoing ", response);

            }

            return true;
        },
        __parse_command: function (string, connection) {
            if (string.length === 0) {
                return false;
            }

            console.log("__parse_command = ", string);
            // has a space!
            var t2,
                t = process.hrtime(),
                cmd = this.__transport.parse(string),
                result;
            t2 = process.hrtime(t),

            console.log("\n\n!! --> transport: ", cmd, "\n\n", t2, "\n");

            t = process.hrtime();

            if(cmd.command === NetStar.COMMAND_APP_MESSAGE) {
                result =  this.emit("data", [cmd.args, connection]);
            } else {
                result = this.on_command(cmd.command, cmd.args, connection);
            }

            ++this.__stats.commands;
            t = process.hrtime(t);
            if (this.__stats.exec_time === false) {
                this.__stats.exec_time = t;
            } else {
                this.__stats.exec_time[0] += t[0];
                this.__stats.exec_time[0] *= 0.5;
                this.__stats.exec_time[1] += t[1];
                this.__stats.exec_time[1] *= 0.5;
            }

            if (this.__stats.parse_time === false) {
                this.__stats.parse_time = t2;
            } else {
                this.__stats.parse_time[0] += t2[0];
                this.__stats.parse_time[0] *= 0.5;
                this.__stats.parse_time[1] += t2[1];
                this.__stats.parse_time[1] *= 0.5;
            }


            this.__stats.last_command_time = t;

            return result;
        },
        __push_connection: function (connection) {
            var name = connection.remoteAddress + ":" + connection.remotePort,
                i; // i setup here...

            this.__transport.new_connection(connection);

            connection.on('close', function () {
                console.log(name, 'connection closed');
                delete this.__control_nodes[connection.$__name];

                var cut = this.__control_node_list.indexOf(connection.$__addr);
                if (cut !== -1) {
                    this.__control_node_list.splice(cut, 1);
                }
            }.bind(this));

            connection.on('data', function (data) {
                //data = data.toString();
                console.log("<<incoming(", typeof data, ")", data.replace(/\r\n/g, "\\r\\n"));

                if (data.indexOf(DELIMITER) !== -1) {
                    data = data.split(DELIMITER);
                    for (i = 0; i < data.length; ++i) {
                        this.__parse_command(data[i], connection);
                    }
                } else {
                    return this.__parse_command(data, connection);
                }
            }.bind(this));

            connection.on('error', function (e) {
                console.log(name, 'WTF!!', arguments);
            });
        },


        setup: function (name, control_host, control_port, transport, tags) {
            console.log("setup", arguments);

            this.__name = name;
            this.__control_host = control_host;
            this.__control_port = control_port;
            this.__transport = transport || new TextTransport();
            this.__tags = tags || [];
        },
        createServer: function () {

            this.__control_server = net.createServer(function (connection) { //'connection' listener
                console.log("incomming: ", connection.remoteAddress);
                console.log(this.__name, 'node connected');

                //connection.remotePort = control_port;
                this.__push_connection(connection);

                connection.write(NetStar.COMMAND_PING + DELIMITER);
            }.bind(this));

            this.__control_server.listen(this.__control_port);
            this.__control_node_list.push({host: this.__control_host, port: this.__control_port, name: this.__name, tags: this.__tags});

            return this;

        },
        __connect: function(server) {
            console.log("outgoing: ", server);
            this.__control_node_list.push(server);
            var connection = net.createConnection(server.port, server.host);
            connection.on('connect', function () { //'connect' listener
                console.log('connection ready');
                this.__push_connection(connection);
            }.bind(this));

            connection.on('error', function (e) {
                if(e.code == "ECONNREFUSED") {
                    //retry!
                    setTimeout(function() {
                        console.log("retry", server);
                        connection.connect(server.port, server.host);
                    }, 250);
                }
            });
        },
        connect: function (ip_server_list) {
            ip_server_list.forEach(function (server) {
                this.__connect(server);
            }.bind(this));

            return this;
        },
        get_connection_tagged: function () { // todo
        },
        route: function (tag_list, message, connection) {
            console.log("route", tag_list, message);

            if (tag_list === "all") {
                return this.broadcast(message, connection);
            }

            if (tag_list.indexOf(",") !== -1) {
                tag_list = tag_list.split(",");
            } else {
                tag_list = [tag_list];
            }

            var i, j, tag, node, connections = [];

            for (i = 0; i < tag_list.length; ++i) {
                tag = tag_list[i];
                console.log("search tag: ", tag, "@", this.__control_nodes.length);

                //search in the rest
                for (j in this.__control_nodes) {
                    node = this.__control_nodes[j];
                    console.log("in", node.tags);

                    if (node.tags.indexOf(tag) !== -1) { //found
                        if (connections.indexOf(node.connection) === -1) { //not found
                            connections.push(node.connection);
                        }
                    }
                }

                //myself ?
                if (this.__tags.indexOf(tag) !== -1) {
                    this.__parse_command(message, connection);
                }
            }

            for (i = 0; i < connections.length; ++i) {
                connections[i].write(message);
            }
        },
        broadcast: function (message, connection) {
            var j;

            this.__parse_command(message, connection);
            //search in the rest
            for (j in this.__control_nodes) {
                this.__control_nodes[j].connection.write(message);
            }
        }
    });

    module.exports.NetStar = NetStar;

    TextTransport = require("./text-transport.js").TextTransport;

}(module.exports));