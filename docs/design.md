# Design

## Sensors simulation

This project implements a scalable architecture for simulating an IoT sensor network.

The solution utilizes Node.js scripts integrated with Faker.js to generate stochastic, realistic environmental data. 
Data transmission is handled via WebSockets (Socket.io), replacing traditional HTTP polling with an event-driven "push" 
mechanism. The architecture employs a many-to-one multiplexing pattern, where multiple autonomous simulated clients—representing
distinct classrooms—transmit data asynchronously to a centralized Express.js backend through a shared socket channel.

Identification of individual sensors is managed via unique IDs embedded within the JSON payload.

## Data exchange

Between the Vue.js client and the Express server there would be open a websocket where processed data from the server are 
pushed towards the client. 

!!! note "How to model data sent on the socket ???"

    Here the Express server should have a map containing each processor where is physically located, cause the sensor should
    send only its ID (if I change the sensor's position it is stupid change the sensor's configuration) ???? 