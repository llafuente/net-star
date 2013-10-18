(function (exports) {
    "use strict";

    var Class = require("node-class").Class,
        Events = require("node-class").Events,
        Eventize = require("node-class").Eventize,
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
        },
        acks: {
        }
    });

    NetStar.ACK = "ack";
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


    NetStar.Extends(Events);


    NetStar.Implements({
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

        exec_command: function (command, args, connection) {
            console.log("<--[", connection ? connection.$__name: this.__name, "] exec-command" , command || "no-name-command ?", args || "null");

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
                this.send({command: "result ", args: this.__stats}, connection);
                break;

            case NetStar.COMMAND_ROUTE:
                if(!args || args.length < 2) {
                    this.send({command: "error", args: "router <where[,]> <message>"}, connection);
                } else {
                    this.route(args[0], args.splice(1).join(" "), connection);
                }
                break;
//broadcast wtf!
            case NetStar.COMMAND_BROADCAST:
                    this.broadcast({
                        command: null,
                        args: args,
                        ack:true
                    }, true, function() {
                    console.log("broadscast is OK!");
                });
                break;

            case NetStar.COMMAND_APP_MESSAGE:
                console.error(NetStar.COMMAND_APP_MESSAGE, "require parameter <message>");
                break;

            case NetStar.COMMAND_SHUTDOWN:
                console.log("request shutdown arrive from: ", connection.$__addr);
                process.exit();
                break;

            case NetStar.COMMAND_PING:
                this.send(this.__get_server_info(true), connection);
                this.send({command: NetStar.COMMAND_GET_SERVER_LIST, args: null}, connection);
                break;

            case NetStar.COMMAND_GET_SERVER_LIST:
                this.send({command: NetStar.COMMAND_UPDATE_SEVER_LIST, args: this.__control_node_list}, connection);
                break;

            case NetStar.COMMAND_UPDATE_SEVER_LIST:
                list = this.__control_node_list;
                max = list.length;

                connect_list = args.value.filter(function (s) {
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

                if(!master_found) {
                    this.on("ready", function() {
                        this.broadcast({command: NetStar.COMMAND_MATER_IS_DEAD, args: null}, true, function() {
                            this.broadcast({command: NetStar.COMMAND_MATER_BID_START, args: null}, true);
                        }.bind(this));
                    }.bind(this));

                    // if in X seconds dont have a master... we should end and start a new election
                }

                if(connect_list.length) {
                    this.connect(connect_list, function() {
                        this.emit("ready");
                    }.bind(this));
                } else {
                    this.emit("ready");
                }
                break;

            case NetStar.COMMAND_MATER_IS_DEAD:
                this.__elections = true;
                break;

            case NetStar.COMMAND_MATER_BID_START:
                if (!this.__elections_bid) { // just once, this message will arrive many times...
                    this.__elections_ivotefor = this.__name;

                    this.broadcast({command: NetStar.COMMAND_MASTER_BID, args: Math.random()}, true);
                }
                break;

            case NetStar.COMMAND_MASTER_BID:
                //
                var bid = parseFloat(args.value, 10);
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

                    this.__votes[args.value] = (this.__votes[args.value] || 0) + 1;
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
                console.log("master is: ", args.value, "I'm", this.__name);
                if(this.__name === args.value) {
                    console.log("I'm voted!");
                    ++this.__my_votes
                    if(this.__my_votes > this.__control_node_list.length * 0.5) {
                        this.__master = true;
                        this.broadcast({command: NetStar.COMMAND_MATER_BID_END}, true);
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
                    this.send(this.__get_server_info(false), connection);
                }
                break;
            case NetStar.COMMAND_TUMBLE_MASTER:
                this.__add_state("master-elections");
                break;
            case NetStar.ACK:
                this.emit(NetStar.ACK, [args.value]);
                break;
            }

            if(connection && args && args.ack === true && command !== NetStar.ACK) {
                this.send({command: NetStar.ACK, args: args.id}, connection);
            }

            return true;
        },
        __parse_command: function (string, connection) {
            if (!string || string.length === 0) {
                return false;
            }


            // has a space!
            var t2,
                t = process.hrtime(),
                cmd = this.__transport.parse(string),
                result;

            connection = connection || null;

            t2 = process.hrtime(t);
            t = process.hrtime();

            console.log("<--[", connection ? connection.$_name : this.__name, "]" , cmd);

            if (cmd.command === NetStar.COMMAND_APP_MESSAGE) {
                result =  this.emit("data", [cmd.args, connection]);
            } else {
                result = this.exec_command(cmd.command, cmd.args, connection);
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
        /**
         * @param {Array} ip_server_list
         * @param {Function} callback, fired when all connections are ok
         * @returns {NetStar} this for chaining
         */
        connect: function (ip_server_list, callback) {
            var connected = 0;

            ip_server_list.forEach(function (server) {
                console.log("outgoing: ", server);

                var connection = net.createConnection(server.port, server.host);

                connection.on('connect', function () { //'connect' listener
                    this.__control_node_list.push(server);

                    console.log('connection ready', server);
                    this.__push_connection(connection);

                    ++connected;
                    if(connected === ip_server_list.length && callback) {
                        callback();
                    }
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
            }.bind(this));

            return this;
        },
        get_connection_tagged: function () { // todo
        },
        wait_acks: function(id, ack_left, ack_cb) {
            if (ack_left === 0) { //not connected to anyone, just fire
                return ack_cb();
            }

            var event_fn = Eventize(function(ack_id) {
                if (ack_id === id) {
                    --ack_left;
                    if(ack_left === 0) {
                        ack_cb();
                        this.remove();
                    }
                }
            });
            this.on(NetStar.ACK, event_fn);
        },
        send: function (command, connection) {
            if(!connection) {
                console.log("(warning) connection is null!");
                console.trace();
                return;
            }
            var encoded = this.__transport.encode(command.command, command.args, null, command.ack);
            console.log("-->[", connection ? connection.$__name : this.__name, "]", encoded);
            connection.write(encoded);
            connection.write(DELIMITER);
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
        broadcast: function (message, to_myself, ack_cb) {
            var j,
                ack_left = 0,
                id,
                encoded,
                event_fn;

            if(typeof(message) === "object") {
                if(ack_cb !== undefined) {
                    id = Math.floor(Math.random() * 1000000);
                    encoded = this.__transport.encode(message.command, message.args, id, true);
                } else {
                    encoded = this.__transport.encode(message.command, message.args, null, null);
                }
            } else {
                encoded = message;
            }

            console.log("B=> ", encoded);

            if(to_myself === true) {
                this.__parse_command(encoded);
            }

            //search in the rest
            for (j in this.__control_nodes) {
                ++ack_left;
                this.__control_nodes[j].connection.write(encoded);
                this.__control_nodes[j].connection.write(DELIMITER);
            }
            if(ack_cb) {
                this.wait_acks(id, ack_left, ack_cb);
            }
        }
    });

    module.exports.NetStar = NetStar;

    TextTransport = require("./text-transport.js").TextTransport;

}(module.exports));