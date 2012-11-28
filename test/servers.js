(function () {
    "use strict";

    var cfg = {
            node1: {
                control: {host: '127.0.0.1', port: 1001},
                tags: ["master"]
            },
            node2: {
                control: {host: '127.0.0.1', port: 1002},
                connect: [{host: '127.0.0.1', port: 1001}],
                tags: ["slave", "grunt"]
            },
            node3: {
                control: {host: '127.0.0.1', port: 1003},
                connect: [{host: '127.0.0.1', port: 1002}],
                tags: ["slave", "grunt"]
            }
        },
        i,
        NetStar = require("../index.js").NetStar,
        node,
        storage;

    for (i = 4; i < 100; ++i) {
        cfg["node" + i] = {
            control: {host: '127.0.0.1', port: 1000 + i},
            connect: [{host: '127.0.0.1', port: 1001}],
            tags: ["slave"]
        };
    }

    cfg = cfg[process.argv[2]];

    node = new NetStar();
    node.setup(process.argv[2], cfg.control.host, cfg.control.port, null, cfg.tags);
    node.createServer();
    /*
    setInterval(function () {
        console.log(node.__control_nodes);
        console.log(node.__control_node_list);
    }, 10000);
    */
    node.on("ready", function () {
        console.log("ROCK AND ROLL!");

        if (process.argv[2]) {
            setTimeout(function () {

            });
        }
    });

    // our test program, has two commands: store/retrieve that set/get data from a unique var perfect for testing :)
    storage = 'null';
    node.on('data', function (data, connection) {
        var command,
            cut;

        if ((cut = data.indexOf(" ")) !== -1) {
            command = data.substring(0, cut);
        } else {
            command = data;
        }

        switch (command) {
        case 'store':
            storage = data.trim();
            break;
        case 'retrieve':
            node.send({command: "data-in-storage", args: storage}, connection);
            break;
        }

    });

    if (cfg.connect) {
        node.connect(cfg.connect);
    } else {
        node.emit("ready");
    }

}());