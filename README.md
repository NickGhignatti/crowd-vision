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

We provide a `build-application.sh` script to automate the setup process.

> ⚠️ **Attention**
>
> To delete the containers the script offer a `--down` mode which cna be triggered through `build-application.sh --down` command

#### 1. Standard Run
To run the application with the default configuration:

```bash
./build-application.sh
```

#### 2. Developer Mode (with MongoDb GUI)

```bash
./build-application.sh --dev
```

Additional features:
- Auth DB GUI: Accessible at http://localhost/auth-db-gui/
- Twin DB GUI: Accessible at http://localhost/twin-db-gui/

#### 3. Manual setup (Docker)

If you prefer to run `docker-compose` manually without the script:

1. Environment Configuration: Create a .env file in the root directory:
    ```bash
    MONGO_PORT=27017
    SERVER_PORT=3000
    CLIENT_PORT=8080
    DEV_URL=http://localhost
    PROD_URL=http://localhost
    ```
2. Run services:
    - Standard: `docker-compose up --build`
    - Dev mode: `docker-compose --profile dev up --build`

## Trigger workflows

### Semantic Release Trigger
To trigger a specific type of release, you must use the following prefixes in your commit titles:
- **Patch Release** (v1.0.0 → v1.0.1): Use fix:
    - Example: `fix: correct login button alignment`
- **Minor Release** (v1.0.0 → v1.1.0): Use feat:
    - Example: `feat: add new dashboard chart`
- **Major Release** (v1.0.0 → v2.0.0): Use `BREAKING CHANGE:` (in the footer) or append `!` after the type.
    - Example: `feat!: remove support for node 18`
