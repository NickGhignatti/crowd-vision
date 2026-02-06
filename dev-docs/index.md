# Abstract 

Crowd-Vision is a web app simplifying the management of a structure through a 
digital twin, by monitoring (and showing) in real time the people inside it, thanks 
to several sensors.

The goal is to allow a better management and security of movements and study
through an interactive map and tools.

## Main features

- **Real time visualization**: High-frequency updates via WebSocket technology to monitor crowd density.
- **Push Notifications**: Server-initiated alerts for security issues, overcrowded areas, or temperature anomalies (Web Push & In-App).
- **Digital Twin Management**:
    - Full 3D visualization of buildings and rooms.
    - Multi-domain support for managing different environments.
    - Edit room properties (capacity, layout) directly from the dashboard.
- **Interactive Tools**:
    - Search rooms by name or attributes.
    - Selection by 3D object interaction.
    - Building controls and visual feedback.

## Technical aspects
Built on top of **MEVN** stack (MongoDB, Express.js, Vue.js, Node.js) with a microservices architecture.