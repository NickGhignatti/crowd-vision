# crowd-vision


> 📘 **Documentation**
>
> For detailed architectural decisions, requirements, and other comprehensive information, please visit our **[GitHub Pages website](https://nickghignatti.github.io/crowd-vision/)**.

## 🚀 Getting Started

You can run this project easily using Docker or manually by setting up the environment on your local machine.

### Prerequisites

* **Docker & Docker Compose** (Recommended for easiest setup)
* **Node.js** (Version ^20.19.0 or >=22.12.0 recommended)
* **npm**

### Environment Configuration

Before running the project, ensure you have configured your environment variables. Create a `.env` file in the root directory. Based on the configuration, it should look something like this:

```bash
# .env example
MONGO_PORT=27017
SERVER_PORT=3000
CLIENT_PORT=8080
DEV_URL=localhost
PROD_URL=localhost
```

### Running the project with Docker

The project includes a `docker-compose.yml` file that orchestrates the MongoDB database, Express server, Vue client, and Mongo Express interface.
1. **Build and start the services**: 
    ```bash
    docker-compose up --build
    ```
2. **Acess the application**:
    - Client (Vue): your configured DEV_URL + CLIENT_PORT
    - Server (API): your configured DEV_URL + SERVER_PORT
    - Mongo Express (DB GUI): on your DEV_URL at port 8081

### Running the project manually
If you prefer to run the services individually without Docker:
1. Install Dependencies: This project uses npm workspaces. Install dependencies for both client and server from the root:
    ```bash
    npm install
    ```
2. Database: Ensure you have a MongoDB instance running locally (default: mongodb://localhost:27017/visiondb).
3. Start the Server: Open a terminal and run:
    ```bash
    cd server
    npm run dev
    ```
4. Start the Client: Open a second terminal and run:
    ```bash
    cd client
    npm run dev
    ```

## Trigger workflows

### Semantic Release Trigger
To trigger a specific type of release, you must use the following prefixes in your commit titles:
- **Patch Release** (v1.0.0 → v1.0.1): Use fix:
    - Example: `fix: correct login button alignment`
- **Minor Release** (v1.0.0 → v1.1.0): Use feat:
    - Example: `feat: add new dashboard chart`
- **Major Release** (v1.0.0 → v2.0.0): Use `BREAKING CHANGE:` (in the footer) or append `!` after the type.
    - Example: `feat!: remove support for node 18`
