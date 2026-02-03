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
1. **Sensor -> Server**: Simulated sensors push telemetry data (updates on people count, temperature) to the **Socket Service**.
2. **Server -> Client**: The Socket Service broadcasts these updates to connected Vue.js clients subscribed to the specific room or building topics.
3. **Alerts**: If data thresholds are breached (e.g., temperature > maxTemperature), events are published to Redis. The **Notification Service** consumes these events and triggers Push Notifications to relevant users.