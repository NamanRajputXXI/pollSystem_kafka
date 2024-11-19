run these command before starting the server

1. on first terminal
   docker run -p 2181:2181 zookeeper
2. on second terminal
   docker run -p 9092:9092 ^
   More? -e KAFKA_ZOOKEEPER_CONNECT=192.168.1.5:2181 ^
   More? -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://192/168.1.5:9092 ^
   More? -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 ^
   More? confluentinc/cp-kafka

after that 3. In project terminal run -> node server.js
