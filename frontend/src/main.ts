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
import { startTheme } from '@/composables/commons/useTheme.ts'
import { startSessionExpiry } from '@/composables/authentication/sessionExpiry.ts'

startTheme()

const app = createApp(App)

app.use(Tres)
app.use(createPinia())
app.use(router)
app.use(i18n)

// Before mount: the very first /me and every later 401 already go through the same policy.
startSessionExpiry(router)

app.mount('#app')
