# Architecture

Crowd Vision is a scalable, digital-twin solution designed to monitor and visualize crowd density within building
structures in real-time. The system employs an event-driven architecture to handle high-frequency data streams from IoT
sensors, visualizing them on a 3D web dashboard.

## 1. High-level architecture

The system follows a Client-Server-Database pattern, enhanced with a dedicated IoT Simulation layer. It operates on a
hybrid communication model using REST APIs for configuration and WebSockets for real-time telemetry.

## 2. Technology Stack

### Backend

- Runtime: Node.js with TypeScript.
- Framework: Express.js.
- API Documentation: OpenAPI 3.0 / Swagger UI.
- Authentication: Custom implementation using bcryptjs for hashing.

### Frontend

- Framework: Vue 3.
- Visualization: Three.js for 3D rendering of the building/digital twin.
- Styling: Tailwind CSS.
- Build Tool: Vite.

### Database

- Engine: MongoDB (v4+ implied by mongo:latest).
- ODM: Mongoose.
- Management: Mongo-Express for web-based database administration.

## 3. Core Components

### Server Application

The Express application acts as the central controller.

- REST Endpoints: handles user authentication and building configuration.

### Client Dashboard

An interface that allows admins and users to view status updates.

- Views: both table view and 3d digital twin, allowing a great management.

## 4. Infrastructure & Deployment

The application is containerized using Docker Compose, orchestrating four distinct services

