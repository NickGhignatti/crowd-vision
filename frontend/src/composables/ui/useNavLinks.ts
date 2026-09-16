import { useI18n } from 'vue-i18n'
import { ROUTES } from '@/router/routes.ts'

export function useNavLinks() {
  const { t } = useI18n()

  const links = [
    { to: ROUTES.dashboard, icon: 'squares-four', label: () => t('commons.dashboard') },
    { to: ROUTES.digitalTwin, icon: 'cube', label: () => t('commons.digitalTwin') },
    { to: ROUTES.domains, icon: 'globe-hemisphere-west', label: () => t('commons.domains') },
    { to: ROUTES.administration, icon: 'shield-check', label: () => t('commons.adminPanel') },
  ]

  return { links }
}
