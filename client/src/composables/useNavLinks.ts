import { useI18n } from 'vue-i18n'

export function useNavLinks() {
  const { t } = useI18n()

  const links = [
    { to: '/dashboard', label: () => t('commons.dashboard') },
    { to: '/model', label: () => t('commons.digitalTwin') },
    { to: '/domains', label: () => t('commons.domains') },
  ]

  return { links }
}
