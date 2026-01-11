import { createI18n } from 'vue-i18n'
import LeftMenu from './components/menus/LeftMenu.vue'
import RightMenu from './components/menus/RightMenu.vue'

const messages = {
  en: {
    nav: {
      dashboard: 'Dashboard',
      digitalTwin: 'Digital Twin',
      login: 'Log in',
      getStarted: 'Get Started',
      signedInAs: 'Signed in as',
      signOut: 'Sign Out',
    },
    home: {
      monitoring: 'Live Monitoring',
      utils: {
        insights: 'Smart insights for',
        spaces: 'safer spaces',
      },
      bio:
        'CrowdVision provides real-time occupancy tracking and flow analysis for educational\n' +
        '          institutions. Make data-driven decisions without the clutter.',
      doc: 'View Documentation',
      features: {
        why: 'Why CrowdVision?',
        built: 'Built for administrators who need clarity, not complexity.',
        f1: {
          title: 'Real-time Counting',
          description:
            'Monitor student density across multiple rooms instantly. Visual indicators update via\n' +
            '              our optimized 3D engine.',
        },
        f2: {
          title: 'Capacity Alerts',
          description:
            'Set thresholds for specific zones. Receive visual cues when hallways or classrooms\n' +
            ' exceed safe capacity limits.',
        },
        f3: {
          title: 'Privacy First',
          description:
            'We analyze movement data without storing biometric information. Compliant with\n' +
            '              standard safety regulations.',
        },
      },
    },
    headers: {
      room: 'Room',
      status: 'Status',
      teacher: 'Teacher',
      temp: 'Temperature',
      people: 'People',
      capacity: 'Capacity'
    },
    model: {
      LeftMenu: {
        data: 'Building Data',
        structureName: 'Structure Name',
      },
      RightMenu: {
        roomsList: 'Rooms List',
        missingRooms: 'No rooms data available',
        temperature: 'Temperature',
        occupancy: 'Occupancy',
      }
    }
  },
  it: {
    nav: {
      dashboard: 'Cruscotto',
      digitalTwin: 'Gemello Digitale',
      login: 'Accedi',
      getStarted: 'Inizia',
      signedInAs: 'Utente',
      signOut: 'Disconnetti',
    },
    home: {
      monitoring: 'Monitoraggio in tempo reale',
      utils: {
        insights: 'Analisi intelligenti per',
        spaces: 'spazi più sicuri',
      },
      bio:
        "CrowdVision offre monitoraggio dell'occupazione e analisi dei flussi in tempo reale per\n" +
        '          le istituzioni educative. Prendi decisioni basate sui dati, senza il superfluo.',
      doc: 'Visualizza Documentazione',
      features: {
        why: 'Perché CrowdVision?',
        built: 'Creato per amministratori che cercano chiarezza, non complessità.',
        f1: {
          title: 'Conteggio in Tempo Reale',
          description:
            'Monitora la densità studentesca in più aule istantaneamente. Gli indicatori visivi si aggiornano tramite\n' +
            '              il nostro motore 3D ottimizzato.',
        },
        f2: {
          title: 'Avvisi di Capienza',
          description:
            'Imposta soglie per zone specifiche. Ricevi segnali visivi quando corridoi o aule\n' +
            ' superano i limiti di capienza sicura.',
        },
        f3: {
          title: 'Privacy al Primo Posto',
          description:
            'Analizziamo i dati di movimento senza archiviare informazioni biometriche. Conforme alle\n' +
            '              normative di sicurezza standard.',
        },
      },
    },
    headers: {
      room: 'Stanza',
      status: 'Stato',
      teacher: 'Insegnante',
      temp: 'Temperatura',
      people: 'Persone',
      capacity: 'Capienza'
    },
    model: {
      LeftMenu: {
        data: 'Dati Edificio',
        structureName: 'Nome Struttura',
      },
      RightMenu: {
        roomsList: 'Lista Stanze',
        missingRooms: 'Nessun dato disponibile per le stanze',
        temperature: 'Temperatura',
        occupancy: 'Percentuale di Occupazione',
      }
    }
  },
}

const i18n = createI18n({
  legacy: false, // Use Composition API
  locale: localStorage.getItem('locale') || 'en', // Persist locale
  fallbackLocale: 'en',
  messages,
})

export default i18n
