#!/bin/sh


for NODE_ID in $(seq 1 5)
do
    echo ${NODE_ID}
    node servers.js node${NODE_ID} &
    sleep 1
done


