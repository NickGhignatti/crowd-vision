import swaggerUi from 'swagger-ui-express'
import YAML from 'yamljs'
import path from 'path'
import {app} from "./index";

export const swaggerSetup = () => {
    const swaggerDocument = YAML.load(path.join(__dirname, './openapi.yml'))
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
}