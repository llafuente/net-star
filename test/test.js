(function () {
    "use strict";

    var spawn = require('child_process').spawn,
        net = require('net'),
        path = require('path'),
        i,
        mservers = 5,
        node_server,
        node_servers = [],
        s_output = {},
        tap = require("tap"),
        test = tap.test;


    function on_data_stdout(data) {
        s_output[this] += data;
        //console.log('node' + this + 'stdout: ' + data);
    }

    function on_data_stderr(data) {
        s_output[this] += data;
        //console.log('node' + this + 'stderr: ' + data);
    }

    function on_exit(code) {
        s_output[this] += 'child process exited with code ' + code;
        //console.log('node' + this + 'child process exited with code ' + code);
    }

    process.on('exit', function () {
        // print all information by server
        console.log(s_output);
    });

    function telnet(host, port, message, callback) {

        var connection = net.createConnection(port, host);
        connection.on('connect', function () { //'connect' listener
            connection.write(message);

        }.bind(this));
        connection.on('data', function (data) {
            callback(data, connection);
        });

    }

    //run X servers each in a process
    for(i = 1; i <= mservers; ++i) {
        s_output[i] = '';

        node_server = spawn("/usr/local/bin/node", [path.join(path.dirname(process.mainModule.filename), "servers.js"), "node"+i]);
        node_servers.push(node_server);

        node_server.stdout.on('data', on_data_stdout.bind(i));
        node_server.stderr.on('data', on_data_stderr.bind(i));
        node_server.on('exit', on_exit.bind(i));
    }

    // run the test, but first be sure all servers are online...

    for(i = 1; i <= mservers; ++i) {
        test("last node is online" + i, function(t) {
            var connection = net.createConnection(1000 + this, "127.0.0.1");
            connection.on('connect', function () { //'connect' listener
                connection.destroy();
                setTimeout(function() {
                    t.end();
                }, 250);
            }.bind(this));

            connection.on('data', function (data) {
            });

            connection.on('error', function (data) {
                console.log("retry..." , this, data);
                setTimeout(function() {
                    connection.connect(1000 + this, "127.0.0.1");
                }.bind(this), 500);
            }.bind(this));
        }.bind(i));
    }


    for(i = 1; i <= mservers; ++i) {
        test("get-server-list" + i, function(t) {
            var connection = net.createConnection(1000 + this, "127.0.0.1"),
                first = true;
            connection.on('connect', function () {
            }.bind(this));
            connection.setEncoding('utf8');
            connection.on('data', function (data) {
                data = data.split("\r\n");
                //console.log(first, data);
                if(first) {
                    connection.write("get-server-list\r\n");
                    first = false;
                } else {
                    connection.destroy();

                    var cmd = data[0].substring(0, "update-list".length),
                        json = JSON.parse(data[0].substring("update-list".length + 1)),
                        j,
                        ports = [];

                    t.equal(json.length, mservers, "each server is connect to all others");

                    for(j = 0; j < json.length; ++j) {
                        ports.push(json[j].port);
                    }
                    ports = ports.sort();
                    for(j = 0; j < ports.length; ++j) {
                        t.equal(ports[j], 1000 + j + 1, "server" + this + " connected to " + (j + 1));
                    }
                    //console.log(cmd, json);
                    t.end();
                }
            });
            connection.on('error', function (e) {
                t.equal(e, false);
                t.end();
            });
        }.bind(i));
    }


    test("store/retrieve test", function(t) {
        var connection = net.createConnection(1001, "127.0.0.1"),
            first = true,
            content = "string-test!";
        connection.on('connect', function () {
        }.bind(this));
        connection.setEncoding('utf8');
        connection.on('data', function (data) {
            data = data.split("\r\n");
            //console.log(first, data);
            if(first) {
                connection.write("msg store " + content + "\r\nmsg retrieve\r\n");
                first = false;
            } else {

                console.log(data);

                var cmd = data[0].substring(0, "data-in-storage store".length),
                    json = data[0].substring("data-in-storage store".length + 1),
                    j,
                    ports = [];

                t.equal(json, content);

                connection.write(
                    "route master msg store 'master'\r\n"+
                    "route slave msg store 'slave'\r\n"+
                    "route grunt msg store 'grunt'\r\n"
                );
                connection.destroySoon();
                setTimeout(function() {
                    t.end();
                }, 1000);
            }
        });
        connection.on('error', function (e) {
            t.equal(e, false);
            t.end();
        });
    });

    var server_tags = ["", "'master'", "'grunt'", "'grunt'", "'slave'", "'slave'"];
    for(i = 1; i <= mservers; ++i) {
        test("route test is ok " + i, function(t) {
            var connection = net.createConnection(1000 + this, "127.0.0.1"),
                first = true,
                content = server_tags[this];

            connection.on('connect', function () {
            }.bind(this));
            connection.setEncoding('utf8');
            connection.on('data', function (data) {
                data = data.split("\r\n");
                //console.log(first, data);
                if(first) {
                    connection.write("msg retrieve\r\n");
                    first = false;
                } else {
                    connection.destroy();

                    var cmd = data[0].substring(0, "data-in-storage store".length),
                        json = data[0].substring("data-in-storage store".length + 1),
                        j,
                        ports = [];

                    t.equal(json, content);
                    console.log(cmd, json);
                    t.end();
                }
            });
            connection.on('error', function (e) {
                t.equal(e, false);
                t.end();
            });
        }.bind(i));
    }



    test("kill them all!", function(t) {
        for(i = 1; i <= mservers; ++i) {
            telnet("127.0.0.1", 1000 + i, "shutdown\r\n", function(data, con) {
                console.log(data.toString());
                con.destroy();
            });
        }
        t.end();
    });







}());