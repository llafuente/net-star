#!/bin/sh

SERVERS=$(seq 1001 1005)
MASTER_PORT=1001

for PORT in  ${SERVERS}
do
    echo 'info' ${PORT}
    echo -e 'update-info {"name":"monitor","addr":{"host":"127.0.0.1","port":1002},"tags":["monitor"],"respond":false}\r\nget-server-list\r\n' | nc localhost ${PORT};
done

echo
echo

echo -e 'msg store aleluya\r\n' | nc localhost ${MASTER_PORT};
echo
echo -e 'msg retrieve\r\n' | nc localhost ${MASTER_PORT};

echo -e 'route master msg store "im an master!!!"\r\n' | nc localhost ${MASTER_PORT};
echo -e 'route slave msg store "im an slave!!!"\r\n' | nc localhost ${MASTER_PORT};
echo -e 'route grunt msg store "im an grunt!!!"\r\n' | nc localhost ${MASTER_PORT};

sleep 1;

for PORT in  ${SERVERS}
do
    echo "retrieve ${PORT}"
    echo -e 'msg retrieve\r\n' | nc localhost ${PORT};
    echo
done

echo -e 'broadcast msg store "broadcast message"\r\n' | nc localhost 1001;
sleep 1;
for PORT in  ${SERVERS}
do
    echo "retrieve ${PORT}"
    echo -e 'msg retrieve\r\n' | nc localhost ${PORT};
    echo
done

echo
echo

echo -e 'stats\r\n' | nc localhost ${MASTER_PORT};

for PORT in  ${SERVERS}
do
    echo 'shutdown' ${PORT}
    echo -e 'shutdown\r\n' | nc localhost ${PORT};
done

echo "someone alive ?";
pgrep node
