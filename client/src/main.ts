import './assets/main.css'
import '@phosphor-icons/web/regular'
import '@phosphor-icons/web/bold'
import '@phosphor-icons/web/fill'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Tres from '@tresjs/core'
import App from './App.vue'
import router from './router'
import i18n from '@/i18n.ts'

const app = createApp(App)

app.use(Tres)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.mount('#app')
