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

### Quick start

We provide convenient `npm` scripts to automate the setup and running process.

#### 1. Standard Run
To run the application with the default configuration in the background:

```bash
npm start
```

#### 2. Developer Mode (with MongoDb GUI and Hot Reload)

```bash
npm run dev
```

Additional features:
- Auth DB GUI: Accessible at http://localhost/auth-db-gui/
- Twin DB GUI: Accessible at http://localhost/twin-db-gui/
- Hot reload enabled for server and client

#### 3. Manual setup (Docker)

If you prefer to run `docker-compose` manually without the script:

1. Environment Configuration: Create a .env file in the root directory:
    ```bash
    MONGO_PORT=27017
    SERVER_PORT=3000
    CLIENT_PORT=8080
    DEV_URL=http://localhost
    PROD_URL=http://localhost
    VAPID_PUBLIC_KEY=x
    VAPID_PRIVATE_KEY=y
    VITE_VAPID_PUBLIC_KEY=x
    ```
    The VAPID keys can be generated using thefollowing Node.js script:
    ```bash
    npm install web-push
    npm install -D @types/web-push
    npx web-push generate-vapid-keys
    ```

2. Run services:
    - Standard: `docker compose up --build`
    - Dev mode: `docker compose -f docker-compose.dev.yml up --watch --build`

#### Stop application
```bash
npm run stop
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
