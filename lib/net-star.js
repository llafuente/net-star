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
        __master: false,

        __control_host: '127.0.0.1',
        __control_port: 1337,
        __name: "unnamed-node",
        __control_server: null,
        __control_nodes: {},
        __control_node_list: [],

        __elections: false,
        __elections_bid: 0,
        __elections_ivotefor: null,
        __bids_recieved: 0,
        __votes_recieved: 0,
        __votes: {},
        __my_votes: 0,

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
    NetStar.COMMAND_MATER_IS_DEAD = "master/dead";
    //->
    NetStar.COMMAND_MATER_BID_START = "master/elections-start";
    NetStar.COMMAND_MASTER_BID = "master/bid";
    //->
    NetStar.COMMAND_MASTER_VOTE = "master/elected";
    // |->
    NetStar.COMMAND_MASTER_SELECTED = "master/set";
    NetStar.COMMAND_MATER_BID_END = "master/elections-end";


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
                    master: this.__master,
                    respond: respond
                }
            };
        },

        on_command: function (command, args, connection) {
            console.log("<-- command-on: ", connection ? connection.$__name: this.__name, command || "no-name-command ?", args || "null");

            var i,
                list,
                max,
                found,
                connect_list,
                response = [],
                encoded,
                master_found = false;

            switch (command) {
            case NetStar.COMMAND_STATS:
                response.push({command: "result ", args: this.__stats});
                break;

            case NetStar.COMMAND_ROUTE:
                this.route(args[0], args.splice(1).join(" "), connection);
                break;

            case NetStar.COMMAND_BROADCAST:
                this.broadcast(args.join(" "), true);
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
                        if(list[i].master) {
                            master_found = true;
                        }

                        if (list[i].port === s.port && list[i].host === s.host) {
                            return false;
                        }
                    }

                    return true;
                });

                if(connect_list.length) {
                    console.log("connect_list", connect_list);
                    this.connect(connect_list, function() {
                        this.emit("ready");
                    });
                }

                //todo remove this when the callback in connet is done
                this.emit("ready");

                if(!master_found) {
                    //on ready
                    setTimeout(function() {
                        this.broadcast({command: NetStar.COMMAND_MATER_IS_DEAD, args: null}, true);
                        setTimeout(function() {
                            this.broadcast({command: NetStar.COMMAND_MATER_BID_START, args: null}, true);
                        }.bind(this),1000);
                    }.bind(this),1000);
                }

                break;

            case NetStar.COMMAND_MATER_IS_DEAD:
                this.__elections = true;
                break;

            case NetStar.COMMAND_MATER_BID_START:
                if (!this.__elections_bid) { // just once, this message will arrive many times...
                    this.__elections_bid = Math.random();
                    this.__elections_ivotefor = this.__name;

                    this.broadcast({command: NetStar.COMMAND_MASTER_BID, args: this.__elections_bid}, true);
                }
                break;

            case NetStar.COMMAND_MASTER_BID:
                //
                var bid = parseFloat(args[0], 10);
                if (this.__elections_bid > bid) {
                    this.__elections_ivotefor = connection.$__name;
                    this.__elections_bid = bid;

                    console.log("this one is winning", connection);
                }
                ++this.__bids_recieved;
                if(this.__bids_recieved >= this.__control_node_list.length) {
                    // emit our vote!!!
                    this.broadcast({command: NetStar.COMMAND_MASTER_VOTE, args: this.__elections_ivotefor}, true);
                }
                break;

            case NetStar.COMMAND_MASTER_VOTE:

                    this.__votes[args[0]] = (this.__votes[args[0]] || 0) + 1;
                    ++this.__votes_recieved;

                    if(this.__votes_recieved >= this.__control_node_list.length) {

                        console.log();
                        //max
                        max = -1;
                        for (i in this.__votes) {
                            if(max < this.__votes[i]) {
                                found = i;
                                max = this.__votes[i];
                            }
                        }

                        // emit our vote!!!
                        this.broadcast({command: NetStar.COMMAND_MASTER_SELECTED, args: found}, true);
                    }
                break;

            case NetStar.COMMAND_MASTER_SELECTED:
                console.log("master is: ", args[0], "I'm", this.__name);
                if(this.__name === args[0]) {
                    console.log("I'm voted!");
                    ++this.__my_votes
                    if(this.__my_votes > this.__control_node_list.length * 0.5) {
                        this.__master = true;
                        this.broadcast(this.__get_server_info(false), true);
                        this.broadcast(this.__get_server_info(false), false);
                    }
                }

                break;

            case NetStar.COMMAND_MATER_BID_END:
                this.__elections = false;
                this.__elections_bid = 0;
                this.__elections_ivotefor = null;
                this.__bids_recieved = 0;
                this.__my_votes = 0;
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
                    response.push(this.__get_server_info(false));
                }
                break;
            case NetStar.COMMAND_TUMBLE_MASTER:
                this.__add_state("master-elections");
                break;
            }

            if (response.length) {
                console.log(response.length, response);

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

            // has a space!
            var t2,
                t = process.hrtime(),
                cmd = this.__transport.parse(string),
                result;
            t2 = process.hrtime(t);

            console.log("<-- ", cmd);

            t = process.hrtime();

            if (cmd.command === NetStar.COMMAND_APP_MESSAGE) {
                result =  this.emit("data", [cmd.args, connection]);
            } else {
                result = this.on_command(cmd.command, cmd.args, connection);
            }

            t = process.hrtime(t);
            ++this.__stats.commands;
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
                console.log("<<<<raw incoming(", typeof data, ")", data.replace(/\r\n/g, "\\r\\n"));

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
        __connect: function (server) {
            console.log("outgoing: ", server);

            var connection = net.createConnection(server.port, server.host);

            connection.on('connect', function () { //'connect' listener
                this.__control_node_list.push(server);

                console.log('connection ready', server);
                this.__push_connection(connection);
            }.bind(this));

            connection.on('error', function (e) {
                if (e.code === "ECONNREFUSED") {
                    //retry!
                    setTimeout(function () {
                        console.log("retry", server);
                        connection.connect(server.port, server.host);
                    }, 250);
                }
            });
        },
        /**
         * @param {Array} ip_server_list
         * @param {Function} callback, fired when all connections are ok
         * @returns {NetStar} this for chaining
         */
        connect: function (ip_server_list, callback) {
            ip_server_list.forEach(this.__connect.bind(this));

            return this;
        },
        get_connection_tagged: function () { // todo
        },
        send: function (command, connection) {
            var encoded = this.__transport.encode(null, command.command, command.args, null);
            console.log("--> ", encoded);
            connection.write(encoded);
        },
        route: function (tag_list, message, connection) {
            console.log("route", tag_list, message);

            if (tag_list.indexOf("all") !== -1) {
                return this.broadcast(message, true);
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
                connections[i].write(DELIMITER);
            }
        },
        broadcast: function (message, to_myself) {

            if(typeof(message) === "object") {
                message = this.__transport.encode(null, message.command, message.args, null);
            }

            console.log("b-> ", message);
            var j;

            if(to_myself === true) {
                this.__parse_command(message);
            }

            //search in the rest
            for (j in this.__control_nodes) {
                this.__control_nodes[j].connection.write(message);
                this.__control_nodes[j].connection.write(DELIMITER);
            }
        }
    });

    module.exports.NetStar = NetStar;

    TextTransport = require("./text-transport.js").TextTransport;

}(module.exports));