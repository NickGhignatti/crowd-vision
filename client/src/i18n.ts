import { createI18n } from 'vue-i18n'

const messages = {
  en: {
    language: 'English',
    commons: {
      dashboard: 'Dashboard',
      digitalTwin: 'Digital Twin',
      domains: 'Domains',
      app: {
        crowd: 'Crowd',
        vision: 'Vision',
        crowdVision: 'Crowd Vision',
        rights: 'CrowdVision Systems. All rights reserved.',
      },
      enable: 'Enable',
      later: 'Later',
      save: 'Save',
      cancel: 'Cancel',
      back: 'Back',
      continue: 'Continue',
      create: 'Create',
      edit: 'Edit',
      press: 'Press',
      enter: 'Enter',
      ID: 'ID',
      open: 'Open',
      search: 'Search',
    },
    authentication: {
      login: 'Login',
      register: 'Register',
      logout: 'Logout',
      profile: 'Profile',
      getStarted: 'Get Started',
      signedInAs: 'Signed in as',
      input: {
        username: 'Username',
        usernamePlaceholder: 'Enter your username',
        password: 'Password',
        passwordPlaceholder: '••••••••',
        forgotPassword: 'Forgot Password?',
        email: 'Email',
      },
      createAnAccount: 'Create an Account',
      join: 'Join CrowdVision to start monitoring!',
      alreadyAnAccount: 'Already have an account?',
      welcomeBack: 'Welcome Back!',
      signInToContinue: 'Sign in to continue to CrowdVision',
      noAccount: "Don't have an account?",
    },
    home: {
      title: {
        monitoring: 'Live Monitoring',
        insights: 'Smart insights for',
        spaces: 'safer spaces',
      },
      subTitle: {
        biography:
          'CrowdVision provides real-time occupancy tracking and flow analysis for educational\n' +
          '          institutions. Make data-driven decisions without the clutter.',
        documentation: 'View Documentation',
      },
      features: {
        why: 'Why CrowdVision?',
        motivation: 'Built for administrators who need clarity, not complexity.',
        feature1: {
          title: 'Real-time Occupancy Tracking',
          description:
            'Monitor student density across multiple rooms instantly. Visual indicators update via\n' +
            '              our optimized 3D engine.',
        },
        feature2: {
          title: 'Capacity Alerts',
          description:
            'Set thresholds for specific zones. Receive visual cues when hallways or classrooms\n' +
            ' exceed safe capacity limits.',
        },
        feature3: {
          title: 'Privacy First',
          description:
            'We analyze movement data without storing biometric information. Compliant with\n' +
            '              standard safety regulations.',
        },
      },
    },
    dashboard: {
      table: {
        headers: {
          room: 'Room',
          status: 'Status',
          teacher: 'Teacher',
          capacity: 'Capacity',
          temperature: 'Temperature',
          people: 'People',
        },
        rooms: {
          status: {
            empty: 'Empty',
            normal: 'Normal',
            crowded: 'Crowded',
            full: 'Full',
            overcrowded: 'Overcrowded',
          },
        },
        noDataAvailable: 'No data available',
        startIndex: 'Page',
        ofIndex: 'of',
        buttons: {
          stop: 'Stop auto',
          start: 'Start auto',
          next: 'Next',
          previous: 'Previous',
        },
      },
      mode: {
        focusMode: 'Focus Mode',
      },
    },
    domains: {
      table: {
        title: 'Domains Management',
        headers: {
          name: 'Name',
          action: 'Action',
        },
      },
      inputs: {
        search: 'Search domain...',
        create: 'Create new domain',
        private: 'Enter in a private domain',
        notFound: 'No domains found',
        modal: {
          step: 'step',
          of: 'of 2',
          main: 'Main Domain',
          desc: 'The main domain represents the primary organizational unit. It can have multiple subdomains under it.',
          addSub: 'Add Subdomains',
          to: 'to add it to',
        },
        strategy: 'Authentication Strategy',
        standard: 'Standard',
        managedBy: 'Managed by CrowdVision',
        external: 'External SSO',
        externalSSO: 'OIDC (Keycloak, Auth0, etc)',
        issuerUrl: 'Issuer URL',
        clientID: 'Client ID',
        clientSecret: 'Client Secret',
        invalid: 'Invalid subdomain format.',
        alreadyPresent: 'Domain already exists.',
      },
    },
    notifications: {
      title: 'Enable critical alerts?',
      description: 'Receive notifications when critical events occur.',
    },
    model: {
      rooms: {
        editRoom: {
          title: 'Edit Room',
          subtitle: 'Configure parameters and thresholds',
          identifier: 'Room Identifier',
          identifierPlaceholder: 'Room ID',
          capacity: 'Capacity',
          maxTemp: 'Max Temp (°C)',
          themeColor: 'Theme Color',
        },
        temperature: 'Temperature',
        occupancy: 'Occupancy',
      },
      controls: {
        buttons: {
          reset: 'Reset View',
          focus: 'Focus on Room',
          zoomIn: 'Zoom In',
          zoomOut: 'Zoom Out',
          panorama: 'Panorama Mode',
        },
        uploadJson: 'Upload JSON',
        toggleControls: 'Toggle Controls',
        floor: 'Floor',
        floorSelection: 'Floor Selection',
      },
      selection: 'Select building',
      noBuildings: 'No buildings found',
      roomList: 'Room List',
      searchRoom: 'Search Room',
      noRooms: 'No rooms found',
      name: 'Structure Name',
      data: 'Buildings Data',
    },
  },
  it: {
    language: 'Italiano',
    commons: {
      dashboard: 'Cruscotto',
      digitalTwin: 'Gemello Digitale',
      domains: 'Domini',
      app: {
        crowd: 'Crowd',
        vision: 'Vision',
        crowdVision: 'Crowd Vision',
        rights: 'CrowdVision Systems. Tutti i diritti riservati.',
      },
      enable: 'Abilita',
      later: 'Più tardi',
      save: 'Salva',
      cancel: 'Annulla',
      back: 'Indietro',
      continue: 'Continua',
      create: 'Crea',
      edit: 'Modifica',
      press: 'Premi',
      enter: 'Invio',
      ID: 'ID',
      open: 'Apri',
      search: 'Cerca',
    },
    authentication: {
      login: 'Accedi',
      register: 'Registrati',
      logout: 'Esci',
      profile: 'Profilo',
      getStarted: 'Inizia',
      signedInAs: 'Accesso effettuato come',
      input: {
        username: 'Nome utente',
        usernamePlaceholder: 'Inserisci il tuo nome utente',
        password: 'Password',
        passwordPlaceholder: '••••••••',
        forgotPassword: 'Password dimenticata?',
        email: 'Email',
      },
      createAnAccount: 'Crea un Account',
      join: 'Unisciti a CrowdVision per iniziare il monitoraggio!',
      alreadyAnAccount: 'Hai già un account?',
      welcomeBack: 'Bentornato!',
      signInToContinue: 'Accedi per continuare su CrowdVision',
      noAccount: 'Non hai un account?',
    },
    home: {
      title: {
        monitoring: 'Monitoraggio in tempo reale',
        insights: 'Analisi intelligenti per',
        spaces: 'spazi più sicuri',
      },
      subTitle: {
        biography:
          "CrowdVision fornisce tracciamento dell'occupazione in tempo reale e analisi dei flussi per istituti\n" +
          '          educativi. Prendi decisioni basate sui dati senza confusione.',
        documentation: 'Vedi Documentazione',
      },
      features: {
        why: 'Perché CrowdVision?',
        motivation: 'Costruito per amministratori che necessitano di chiarezza, non complessità.',
        feature1: {
          title: 'Tracciamento Occupazione Live',
          description:
            'Monitora la densità degli studenti in più stanze istantaneamente. Indicatori visivi aggiornati tramite\n' +
            '              il nostro motore 3D ottimizzato.',
        },
        feature2: {
          title: 'Avvisi di Capacità',
          description:
            'Imposta soglie per zone specifiche. Ricevi segnali visivi quando corridoi o aule\n' +
            ' superano i limiti di capacità di sicurezza.',
        },
        feature3: {
          title: 'Privacy al Primo Posto',
          description:
            'Analizziamo i dati di movimento senza memorizzare informazioni biometriche. Conforme alle\n' +
            '              normative di sicurezza standard.',
        },
      },
    },
    dashboard: {
      table: {
        headers: {
          room: 'Stanza',
          status: 'Stato',
          teacher: 'Insegnante',
          capacity: 'Capacità',
          temperature: 'Temperatura',
          people: 'Persone',
        },
        rooms: {
          status: {
            empty: 'Vuota',
            normal: 'Normale',
            crowded: 'Affollata',
            full: 'Piena',
            overcrowded: 'Sovraffollata',
          },
        },
        noDataAvailable: 'Nessun dato disponibile',
        startIndex: 'Pagina',
        ofIndex: 'di',
        buttons: {
          stop: 'Stop auto',
          start: 'Avvia auto',
          next: 'Succ.',
          previous: 'Prec.',
        },
      },
      mode: {
        focusMode: 'Modalità Focus',
      },
    },
    domains: {
      table: {
        title: 'Gestione Domini',
        headers: {
          name: 'Nome',
          action: 'Azione',
        },
      },
      inputs: {
        search: 'Cerca dominio...',
        create: 'Crea nuovo dominio',
        private: 'Entra in un dominio privato',
        notFound: 'Nessun dominio trovato',
        modal: {
          step: 'passaggio',
          of: 'di 2',
          main: 'Dominio Principale',
          desc: "Il dominio principale rappresenta l'unità organizzativa primaria. Può avere molteplici sottodomini al suo interno.",
          addSub: 'Aggiungi Sottodomini',
          to: 'per aggiungere',
        },
        strategy: 'Strategia di Autenticazione',
        standard: 'Standard',
        managedBy: 'Gestito da CrowdVision',
        external: 'SSO Esterno',
        externalSSO: 'OIDC (Keycloak, Auth0, ecc.)',
        issuerUrl: 'Issuer URL',
        clientID: 'Client ID',
        clientSecret: 'Client Secret',
      },
    },
    notifications: {
      title: 'Abilitare avvisi critici?',
      description: 'Ricevi notifiche quando si verificano eventi critici.',
    },
    model: {
      rooms: {
        editRoom: {
          title: 'Modifica Stanza',
          subtitle: 'Configura parametri e soglie',
          identifier: 'Identificativo Stanza',
          identifierPlaceholder: 'ID Stanza',
          capacity: 'Capacità',
          maxTemp: 'Temp Max (°C)',
          themeColor: 'Colore Tema',
        },
        temperature: 'Temperatura',
        occupancy: 'Occupazione',
      },
      controls: {
        buttons: {
          reset: 'Reimposta Vista',
          focus: 'Focus su Stanza',
          zoomIn: 'Zoom Avanti',
          zoomOut: 'Zoom Indietro',
          panorama: 'Modalità Panorama',
        },
        uploadJson: 'Carica JSON',
        toggleControls: 'Mostra/Nascondi Controlli',
        floor: 'Piano',
        floorSelection: 'Selezione Piano',
      },
      selection: 'Seleziona edificio',
      noBuildings: 'Nessun edificio trovato',
      roomList: 'Lista Stanze',
      searchRoom: 'Cerca Stanza',
      noRooms: 'Nessuna stanza trovata',
      name: 'Nome Struttura',
      data: 'Dati delle Strutture',
    },
  },
}

const storedLocale = typeof localStorage !== 'undefined' ? localStorage.getItem('locale') : null

const i18n = createI18n({
  legacy: false,
  locale: storedLocale || 'en', // Persist locale
  fallbackLocale: 'en',
  messages,
})

export default i18n
