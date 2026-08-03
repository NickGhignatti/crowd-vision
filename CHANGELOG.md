# Changelog

## [0.3.1-alpha](https://github.com/NickGhignatti/crowd-vision/compare/v0.3.0-alpha...v0.3.1-alpha) (2026-08-03)


### Features

* building upload notification ([#335](https://github.com/NickGhignatti/crowd-vision/issues/335)) ([f8027ad](https://github.com/NickGhignatti/crowd-vision/commit/f8027ad3a83a774f921335a4979ca3b2a5f9dcfb))

## [0.3.0-alpha](https://github.com/NickGhignatti/crowd-vision/compare/v0.2.0-alpha...v0.3.0-alpha) (2026-08-02)


### Features

* **digital-twin:** add supports for SLOs and SLIs ([#327](https://github.com/NickGhignatti/crowd-vision/issues/327)) ([d67c21e](https://github.com/NickGhignatti/crowd-vision/commit/d67c21ea400b977a9679561b597c84a1a33abb6c))

## [0.2.0-alpha](https://github.com/NickGhignatti/crowd-vision/compare/v0.1.0-alpha...v0.2.0-alpha) (2026-07-29)


### ⚠ BREAKING CHANGES

* Infrastructure with moonrepo, per-service compose, just, and mise ([#182](https://github.com/NickGhignatti/crowd-vision/issues/182))
* redesign all the RBAC system and the administration panel
* add structure of llm service

### Features

* add 3D digital twin model editor ([#296](https://github.com/NickGhignatti/crowd-vision/issues/296)) ([bb47daa](https://github.com/NickGhignatti/crowd-vision/commit/bb47daa9664e12aa6b3955fd4a3c435a03013de9))
* add chat service ([643dd40](https://github.com/NickGhignatti/crowd-vision/commit/643dd408c560a93e865bc03b03b1d87cd6ede250))
* add client view ([bf78c32](https://github.com/NickGhignatti/crowd-vision/commit/bf78c326bc4a62b6057dee77076d401b36c7dd49))
* add configuration for llm ([7e2ef0a](https://github.com/NickGhignatti/crowd-vision/commit/7e2ef0a5cf2d4ea9f7b6c023075da814f53dc8e8))
* add document ingestion pipeline ([18d8674](https://github.com/NickGhignatti/crowd-vision/commit/18d86745531d3e1d13a040b82a8a690ab77150ed))
* add entry point ([34c8bb8](https://github.com/NickGhignatti/crowd-vision/commit/34c8bb894245ce26e52e4d76f72406e878438356))
* add hybrid retrieval ([7a9bf01](https://github.com/NickGhignatti/crowd-vision/commit/7a9bf0146e5ed93c680f013d7c80117cad07d804))
* add langfuse dashboard ([0dde8fb](https://github.com/NickGhignatti/crowd-vision/commit/0dde8fb4d76bee0a2c35f546e1451b971594e3dc))
* add postgres schema and migrations (db dumping) ([6ef7603](https://github.com/NickGhignatti/crowd-vision/commit/6ef7603711ad5ba3f5ca8ea4b3b45e1e17c3d5a2))
* add room status visualization based on sensor data ([c1a419f](https://github.com/NickGhignatti/crowd-vision/commit/c1a419fa1a8ad64a7676e9aa86d15b7a654329bb))
* Add sensor business logic to application ([#141](https://github.com/NickGhignatti/crowd-vision/issues/141)) ([6525eab](https://github.com/NickGhignatti/crowd-vision/commit/6525eab6a7cbae81069173fd57ae29f94fb3b7e4))
* add structure of llm service ([2b21fde](https://github.com/NickGhignatti/crowd-vision/commit/2b21fdeb82094d429f1cba7cd40e0882a13a6345))
* add temperature detection and fix sensors id strictness ([#297](https://github.com/NickGhignatti/crowd-vision/issues/297)) ([5c10479](https://github.com/NickGhignatti/crowd-vision/commit/5c10479d023aaf59f987ffa677ea7f3819965a53))
* add tool calling and agent loop ([c8b5905](https://github.com/NickGhignatti/crowd-vision/commit/c8b5905bb7e4f6a872d2c69ef5ce85314d8a91e3))
* add unit and integration test ([9008e69](https://github.com/NickGhignatti/crowd-vision/commit/9008e69a781e9685d62e8f7e01704b155739167a))
* authentication microservice ([813c79e](https://github.com/NickGhignatti/crowd-vision/commit/813c79e3ac3a99da0bf98b4a0baa3174bb8fc4f3))
* authentication service now support token ([1aea157](https://github.com/NickGhignatti/crowd-vision/commit/1aea157cdffe2e0abac95da7c2f3e8f10b6b4e4d))
* **auth:** migrate identity/tenancy to Keycloak + Go control plane ([#293](https://github.com/NickGhignatti/crowd-vision/issues/293)) ([fb7808e](https://github.com/NickGhignatti/crowd-vision/commit/fb7808e7e19f73f9de6bd75557c68216dd0a8d90))
* auto rotate ([c2e70ae](https://github.com/NickGhignatti/crowd-vision/commit/c2e70ae36ea50b72c3c07216b9ac8dcf785f28ff))
* building controls ([4c1753d](https://github.com/NickGhignatti/crowd-vision/commit/4c1753d0e9202458efc1a06524193e8ec5b7d9fd))
* code test coverage ([#276](https://github.com/NickGhignatti/crowd-vision/issues/276)) ([442c539](https://github.com/NickGhignatti/crowd-vision/commit/442c5391b0ce4152831b38060dad4e67215688ca))
* dependencies CI to check package-lock.json ([59b7ee5](https://github.com/NickGhignatti/crowd-vision/commit/59b7ee5a993bd715103374ad6c7ff478bb7f8a49))
* digital twin service basic features ([2ed14b9](https://github.com/NickGhignatti/crowd-vision/commit/2ed14b9b6ce426349a18c2aaaae6c4683d858c45))
* domains and fix missing translations ([17b15b2](https://github.com/NickGhignatti/crowd-vision/commit/17b15b2789c1cc4083748be4fcad9cd0337bb3ef))
* error handler ([1fc3a6a](https://github.com/NickGhignatti/crowd-vision/commit/1fc3a6ac6fd8bd984e1390da6090846cb541f023))
* errors openapi spec ([738637f](https://github.com/NickGhignatti/crowd-vision/commit/738637f9b701b94853ad225a5d472b2070678935))
* evaluation with LLMasaJudge ([ba026d7](https://github.com/NickGhignatti/crowd-vision/commit/ba026d7a0b5ee0428f0c26b0c6cd1209e91db3c3))
* fine-grained packages push ([#267](https://github.com/NickGhignatti/crowd-vision/issues/267)) ([f3eddd3](https://github.com/NickGhignatti/crowd-vision/commit/f3eddd31cdaba4172cae59402a9f80b7a81410e2))
* ID + name for both Room and Building struct ([786367f](https://github.com/NickGhignatti/crowd-vision/commit/786367f081eff91d5a5a85226418094155bafbdc))
* improve llm capabilities + report improvements ([#286](https://github.com/NickGhignatti/crowd-vision/issues/286)) ([e002d29](https://github.com/NickGhignatti/crowd-vision/commit/e002d29db51725e051a3dfda72120401088d4d5f))
* in-app push notification ([db31554](https://github.com/NickGhignatti/crowd-vision/commit/db315540b6800a6948812e5fc01d8b133fc38c90))
* Infrastructure with moonrepo, per-service compose, just, and mise ([#182](https://github.com/NickGhignatti/crowd-vision/issues/182)) ([04f4e64](https://github.com/NickGhignatti/crowd-vision/commit/04f4e64f57572233bd2726892a509aac45efbb7e))
* interfaces for DRY + unified language check for roles ([022f157](https://github.com/NickGhignatti/crowd-vision/commit/022f157c2edcdad9e74fc4e80aaa3a2e07783123))
* linting ([838bdae](https://github.com/NickGhignatti/crowd-vision/commit/838bdae058af16863717b6b19592b3b9de703ac5))
* llm works yay ([01f66c0](https://github.com/NickGhignatti/crowd-vision/commit/01f66c00a276387ce3585971a2ed6bb91542a612))
* metrics for auth service and twin service ([#173](https://github.com/NickGhignatti/crowd-vision/issues/173)) ([33624e9](https://github.com/NickGhignatti/crowd-vision/commit/33624e9f0e7c7e4f134cf8edfe7011f0d3b17635))
* model selection dropdown in dashboard ([0000374](https://github.com/NickGhignatti/crowd-vision/commit/00003741a8c357ed831eb3b32af6419e62b40029))
* multiple digital twins for domain support ([a2c7270](https://github.com/NickGhignatti/crowd-vision/commit/a2c72708aef0da21d89d4ce571cd254789854c05))
* openapi documentation endpoint ([54cd9e4](https://github.com/NickGhignatti/crowd-vision/commit/54cd9e40f78d6f3f4b3654af675face1fa41d46e))
* pass from gemini to openAI-compatible workflow ([38ecdf3](https://github.com/NickGhignatti/crowd-vision/commit/38ecdf3607aaf195572c22b126f005ff55a81182))
* preferences saving ([#257](https://github.com/NickGhignatti/crowd-vision/issues/257)) ([243db96](https://github.com/NickGhignatti/crowd-vision/commit/243db96f66ac4de29ad5ec793a7b902ad1ea4fc1))
* QR code shown in the admin view ([7576b19](https://github.com/NickGhignatti/crowd-vision/commit/7576b195a6207575f43f6e5e39d27f1b3063d71e))
* redesign all the RBAC system and the administration panel ([c41c201](https://github.com/NickGhignatti/crowd-vision/commit/c41c201c9d145190731e610b432f116622995420))
* room edit functionality ([d2ced88](https://github.com/NickGhignatti/crowd-vision/commit/d2ced8854f991e2b13f002c2e94bea0f763dd07c))
* room exploitation ([cde1e89](https://github.com/NickGhignatti/crowd-vision/commit/cde1e89dd394d3c7e692f9bcdbda229eccde350b))
* room selection from lateral menu ([d8d0100](https://github.com/NickGhignatti/crowd-vision/commit/d8d01003689445291e3832339e9417cbf7c2bef4))
* scaffold python service ([3088c5b](https://github.com/NickGhignatti/crowd-vision/commit/3088c5b388b64d76e222916924ed6184099608cb))
* script which automatize the project run ([64e6076](https://github.com/NickGhignatti/crowd-vision/commit/64e607644bcfff77e6f6ccecc4e6c33f5b0c60e2))
* search room from lateral menu ([a683cc9](https://github.com/NickGhignatti/crowd-vision/commit/a683cc9cadb9d45acb1751c954519ea1c9c6efde))
* selection by 3d object ([13e98c7](https://github.com/NickGhignatti/crowd-vision/commit/13e98c7a85e3110f55a8b9bb3342736d981e448e))
* setup agent service structure and add it to the architecture ([c8c81a1](https://github.com/NickGhignatti/crowd-vision/commit/c8c81a1c185d982327d8e1e7f8e968014480d226))
* stores for authentication ([9e045b5](https://github.com/NickGhignatti/crowd-vision/commit/9e045b5cde6e47e9b666a7b61a159d170514611d))
* stores to avoid repetitive API calls ([42dc84c](https://github.com/NickGhignatti/crowd-vision/commit/42dc84c7233b9be72018b9423716852274eb31c6))
* web api push notifications ([c2a21b3](https://github.com/NickGhignatti/crowd-vision/commit/c2a21b31ceb4ed8393dc77c4987fca733decbc36))
* workflow to delete old packages ([#178](https://github.com/NickGhignatti/crowd-vision/issues/178)) ([540abb4](https://github.com/NickGhignatti/crowd-vision/commit/540abb401391401f3c8032fcbe957f42cb7934fe))


### Bug Fixes

* add .DS_Store in gitignore for macos dev ([e490d10](https://github.com/NickGhignatti/crowd-vision/commit/e490d10d565aeadac3d3769bb3d358ed4125ad77))
* add build working on unix like systems ([fe396ac](https://github.com/NickGhignatti/crowd-vision/commit/fe396ac490dcb1d36ecaa4edc9effc33d0c3295c))
* add logic for notification ([bfc6524](https://github.com/NickGhignatti/crowd-vision/commit/bfc652450f8beb4daa383be431782cdc2d3394cb))
* add macstyle build ([4a101de](https://github.com/NickGhignatti/crowd-vision/commit/4a101def43db55c010c0eddde0d6dda319a4813d))
* add model evaluations and add some better documentation around the code ([ebf900d](https://github.com/NickGhignatti/crowd-vision/commit/ebf900da521f05568c6f38d0a82d00dd200d57a0))
* apply CI workflow review feedback ([fbf3dd8](https://github.com/NickGhignatti/crowd-vision/commit/fbf3dd8d066a4df05b5153436d1af6d32d7c50d5))
* apply security and correctness fixes from PR review comments ([32dbfdd](https://github.com/NickGhignatti/crowd-vision/commit/32dbfdd00b185909eeba8d91dcd254820c85fca8))
* audit fix ([b11d11e](https://github.com/NickGhignatti/crowd-vision/commit/b11d11e4dac3c8842e0162f15ebacdd7256dee40))
* auth pipeline working dir ([820dc9e](https://github.com/NickGhignatti/crowd-vision/commit/820dc9e8fd0e6838139691613c8412167244226b))
* change compatibility issue ([22b3187](https://github.com/NickGhignatti/crowd-vision/commit/22b31878d5fb9d44e8c85ae3bb80212d0bed87e5))
* change formatting of provide verifier ([e970cde](https://github.com/NickGhignatti/crowd-vision/commit/e970cde8356250dcd031107feacd5538bb64d910))
* ci ([#177](https://github.com/NickGhignatti/crowd-vision/issues/177)) ([36e7fec](https://github.com/NickGhignatti/crowd-vision/commit/36e7fec4709e3446b0b69312518137b61ea21279))
* CI docs ([6a0f998](https://github.com/NickGhignatti/crowd-vision/commit/6a0f998484ddaf8c4a1a9362757338bb3039cbe1))
* CI pipeline rootDir and path not found ([75cd0de](https://github.com/NickGhignatti/crowd-vision/commit/75cd0dee5a8eb2d163593369477cb2e0a2be8e97))
* CI pipelines ([5b99c44](https://github.com/NickGhignatti/crowd-vision/commit/5b99c44e98a05d439e10a0f268efd6356fd8ef5f))
* ci semantic release work on PRs ([2e94f02](https://github.com/NickGhignatti/crowd-vision/commit/2e94f023c0d8ee1d491f5b9c482ea3e700753498))
* ci semantic release work on PRs ([d31889f](https://github.com/NickGhignatti/crowd-vision/commit/d31889fb26f1e687355a5d6ecdd9c6ca45759817))
* dependencies ([174092e](https://github.com/NickGhignatti/crowd-vision/commit/174092e7d1c50245fbc59a2d9002f9420ed7162b))
* divide agents from non agents ([82a63a4](https://github.com/NickGhignatti/crowd-vision/commit/82a63a42010c1c598086eeb802f382a42d1aa3ce))
* documentation CI ([#190](https://github.com/NickGhignatti/crowd-vision/issues/190)) ([ed678db](https://github.com/NickGhignatti/crowd-vision/commit/ed678db0b87a4b726f56850927cbfa161673a8dc))
* dubdomain public visibility ([#292](https://github.com/NickGhignatti/crowd-vision/issues/292)) ([93b758e](https://github.com/NickGhignatti/crowd-vision/commit/93b758e09c070b3a7b926a9a694b84819eeac9b9))
* fine-grained control over docker compose ([8be52ce](https://github.com/NickGhignatti/crowd-vision/commit/8be52ce0064d94348e5f56467f33fefc33c3b682))
* fix agent dependencies ([6cdef2f](https://github.com/NickGhignatti/crowd-vision/commit/6cdef2ff6603dbece0f4e40ec6c82334de019bb5))
* fix dev env ([0d1f27f](https://github.com/NickGhignatti/crowd-vision/commit/0d1f27fc277e7a99b2af57bdb8fa4bc1b0f98479))
* fuck the trailing spaces ([f4beb48](https://github.com/NickGhignatti/crowd-vision/commit/f4beb4893a04d19e5aca42835e9f3a7567739cc6))
* gate /ask model override behind role + allowlist ([3e093a4](https://github.com/NickGhignatti/crowd-vision/commit/3e093a42d333d6de7b1aacb5818aa2f88098bb68))
* gh-image-push-ci ([#196](https://github.com/NickGhignatti/crowd-vision/issues/196)) ([853bfab](https://github.com/NickGhignatti/crowd-vision/commit/853bfabf287296a20ef1e2a380bcb3526e209e7b))
* improve stores usage ([0acb035](https://github.com/NickGhignatti/crowd-vision/commit/0acb035e1d94bb8ce3d10fd80e8e554a98cbccce))
* include agent service in the CI ([955f47d](https://github.com/NickGhignatti/crowd-vision/commit/955f47df4369d9a60c45351499eb1aa4be992ee4))
* linting problems in test, now just with a TODO for next stuff ([62642ee](https://github.com/NickGhignatti/crowd-vision/commit/62642eeeec9cddae1ba6202d575be49516987b38))
* made components more granular + fix i18n ([#175](https://github.com/NickGhignatti/crowd-vision/issues/175)) ([512787a](https://github.com/NickGhignatti/crowd-vision/commit/512787a118f941392893beee97950225fa7a3491))
* model selection ([62c75b0](https://github.com/NickGhignatti/crowd-vision/commit/62c75b03feedf04be7d7cbeb1edab46cd02500c0))
* moon installation registry ([#192](https://github.com/NickGhignatti/crowd-vision/issues/192)) ([52a5f17](https://github.com/NickGhignatti/crowd-vision/commit/52a5f17fc55e3969c8cbef948397caadb971ec19))
* no more hardcoded pricing points ([f127cdd](https://github.com/NickGhignatti/crowd-vision/commit/f127cdd61a502703cf3c386fb658d31fad9b2acc))
* **notification-service:** correct alert timestamp, high/low temperature direction, dead code & schema/interface mismatch ([#290](https://github.com/NickGhignatti/crowd-vision/issues/290)) ([ddaf8ab](https://github.com/NickGhignatti/crowd-vision/commit/ddaf8ab5f4685efff468adeb5e1aaf42b6deb804))
* now agent logs are no more super invasive ([25c8eff](https://github.com/NickGhignatti/crowd-vision/commit/25c8eff73fb2de57a717f7a56755761860f4b455))
* old tooling system + consolidate dev tooling on mise + moon ([#262](https://github.com/NickGhignatti/crowd-vision/issues/262)) ([5c007c6](https://github.com/NickGhignatti/crowd-vision/commit/5c007c606cbe2588ef3d3cd1438ac7f3d4170627))
* omit devDependencies for audit check in the CI ([#143](https://github.com/NickGhignatti/crowd-vision/issues/143)) ([48945cc](https://github.com/NickGhignatti/crowd-vision/commit/48945ccc53cc6b7edcc255fce7618f2e227fe58d))
* prevent duplicate domain memberships in grantTOTPRoles using $pull then $push ([9f2e177](https://github.com/NickGhignatti/crowd-vision/commit/9f2e177e436d5f1a7d704868ec4987e64cdcf0ac))
* QR store + doc typo ([#172](https://github.com/NickGhignatti/crowd-vision/issues/172)) ([cf72d65](https://github.com/NickGhignatti/crowd-vision/commit/cf72d650eff77b72da1e396b403ce942d6083a26))
* release + docs workflow ([#189](https://github.com/NickGhignatti/crowd-vision/issues/189)) ([977266a](https://github.com/NickGhignatti/crowd-vision/commit/977266af2cea42fbbb1f1de2a9ee21de2d53641e))
* remove debug console.log from fetchAllDomains ([2d81c10](https://github.com/NickGhignatti/crowd-vision/commit/2d81c10ad934e42ae0bd12424062f0c16cb47e3a))
* remove fetch for using the useApi composable ([c1a4568](https://github.com/NickGhignatti/crowd-vision/commit/c1a45685830128a080e058314636b5ef82c998c7))
* renovate ([#288](https://github.com/NickGhignatti/crowd-vision/issues/288)) ([0a6091b](https://github.com/NickGhignatti/crowd-vision/commit/0a6091be351ba8697e0ec620f9a652caf6c28c83))
* replace broken ts-node/esm loader with tsx +  modularize Justfile into submodules ([#281](https://github.com/NickGhignatti/crowd-vision/issues/281)) ([fcfa92a](https://github.com/NickGhignatti/crowd-vision/commit/fcfa92a1830c960d233a253ce34517b78a8a0cd7))
* **security:** authenticate twin/sensor/notification services + close membership & preferences IDORs ([#285](https://github.com/NickGhignatti/crowd-vision/issues/285)) ([cb58f5c](https://github.com/NickGhignatti/crowd-vision/commit/cb58f5c60b79791817acd6f3604b45b7b015653a))
* standard API calling point ([ed66e96](https://github.com/NickGhignatti/crowd-vision/commit/ed66e96285cd4ae1cb45117ea8554e6502925238))
* stores promises ([5be9399](https://github.com/NickGhignatti/crowd-vision/commit/5be9399368ab151920e443d7c8a5518db1e0834c))
* table row len standardized with empty rows ([8e22581](https://github.com/NickGhignatti/crowd-vision/commit/8e2258148868c485f75c78c1c3269630f599475a))
* test with the new way of managing errors ([a76436b](https://github.com/NickGhignatti/crowd-vision/commit/a76436bdd9c710b10036da12b4550e9b25e91fb2))
* tests and app structure, __init__ files are important ([6cb8295](https://github.com/NickGhignatti/crowd-vision/commit/6cb8295efc200018daf2aedbeddde1275c08ccc2))
* threshold evaluation and threshold upload configuration ([#194](https://github.com/NickGhignatti/crowd-vision/issues/194)) ([3b6d8a8](https://github.com/NickGhignatti/crowd-vision/commit/3b6d8a8eba9c661e574ed5877b0517cc12c2744a))
* typos ([c2d97c9](https://github.com/NickGhignatti/crowd-vision/commit/c2d97c9ff947d4c3a48fb817f9f62491f7c4f071))
* typos and refactor code ([91c1658](https://github.com/NickGhignatti/crowd-vision/commit/91c1658a0545365bf55879f798323d7058dff09a))
* update pyjwt ([32d89fe](https://github.com/NickGhignatti/crowd-vision/commit/32d89feee55fe52fdd828a80845cef94755613ff))
* updated documentation ([68a09ef](https://github.com/NickGhignatti/crowd-vision/commit/68a09ef15d79d018ccbdfcabe6a7eebaae78e9db))
* upgrade all dependencies to latest + remediate CodeQL findings ([#280](https://github.com/NickGhignatti/crowd-vision/issues/280)) ([c39deb8](https://github.com/NickGhignatti/crowd-vision/commit/c39deb8b378580e6570bc7d97b9998b4ea49a3f7))
* upload button shown previous auth & rank ([f8b2976](https://github.com/NickGhignatti/crowd-vision/commit/f8b29762d89d575c41acd86d0173d0ae5248554c))
* xfail support so known gaps don't fail the run ([cebccd0](https://github.com/NickGhignatti/crowd-vision/commit/cebccd0ef15e0ddaf8749beeb502f4967b726d81))


### Performance Improvements

* CI optimization ([#259](https://github.com/NickGhignatti/crowd-vision/issues/259)) ([a58e5ac](https://github.com/NickGhignatti/crowd-vision/commit/a58e5ac62ad5415741fd0d3297e34ff19b108deb))
* **client:** batch room rendering with InstancedMesh + WebGPU renderer ([#295](https://github.com/NickGhignatti/crowd-vision/issues/295)) ([52aff6c](https://github.com/NickGhignatti/crowd-vision/commit/52aff6cbe5d6579ea9e1d2efd8f490550f234644))
* speed up local dev stack ([#260](https://github.com/NickGhignatti/crowd-vision/issues/260)) ([18fbaf9](https://github.com/NickGhignatti/crowd-vision/commit/18fbaf984d1491117802fd3996d31aa684f2c66b))
* telemetry hot-path, real-time delivery & frontend render overhaul ([#278](https://github.com/NickGhignatti/crowd-vision/issues/278)) ([36da77f](https://github.com/NickGhignatti/crowd-vision/commit/36da77fc55fc746b1f1791cb712d77f654a7003b))

## Changelog
