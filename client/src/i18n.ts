import { createI18n } from 'vue-i18n'

const messages = {
  en: {
    language: 'English',
    commons: {
      dashboard: 'Dashboard',
      digitalTwin: 'Digital Twin',
      domains: 'Domains',
      adminPanel: 'Administrator Panel',
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
      languageSelector: {
        changeLanguage: 'Change Language',
        english: 'English',
        italian: 'Italian',
      },
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
        emailPlaceholder: 'name@school.edu',
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
          title: 'Interactive Digital Twin',
          description:
            'Navigate your buildings, floors, and rooms intuitively. ' +
            'Visualize complex spatial hierarchies and pinpoint precise sensor locations within' +
            'a centralized digital model.',
        },
        feature2: {
          title: 'Real-Time IoT Analytics',
          description:
            'Powered by a high-performance metrics engine, seamlessly track live temperature, ' +
            'air quality, and occupancy data to understand space utilization instantly.',
        },
        feature3: {
          title: 'AI Smart Assistant',
          description:
            'Chat directly with your building. Our integrated AI agent understands your spatial data, ' +
            'allowing you to ask natural language questions and receive intelligent insights.',
        },
        feature4: {
          title: 'Proactive alterting system',
          description:
            'Never miss a critical event. Set custom thresholds for specific zones and receive instant' +
            ' web-push notifications across your devices the moment anomalies occur.',
        },
        feature5: {
          title: 'Secure Multi-Tenancy',
          description:
            'Built for enterprise scale. Robust Role-Based Access Control (RBAC) ensures ' +
            'administrators can securely partition data across multiple domains and user hierarchies.',
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
          indoorAqi: 'Indoor Air Quality',
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
          simStart: 'Start Simulator',
          simStop: 'Stop Simulator',
          stop: 'Stop auto',
          start: 'Start auto',
          next: 'Next',
          previous: 'Previous',
        },
      },
      mode: {
        focusMode: 'Focus Mode',
        graphs: 'Graphs',
        table: 'Table',
      },
    },
    domains: {
      table: {
        title: 'Domains',
        headers: {
          name: 'Name',
          action: 'Action',
        },
      },
      administration: {
        organizationDomains: 'Organization Domains',
        addNewDomain: 'Add New DomainInput',
        organizationToken: 'Organization Token',
        activeToken: 'Active Token',
        generateNewToken: 'Generate New Token',
        scanQRCode: 'Scan with Google Authenticator or Authy',
        QRCodeTitle: 'Your organization Qr Codes',
        selectDomainToSeeQRCode: 'Select a domain to see its Qr codes',
      },
      inputs: {
        search: 'Search domain...',
        create: 'Create new domain',
        private: 'Enter in a private domain',
        notFound: 'No domains found',
        modal: {
          step: 'step',
          of: 'of 2',
          main: 'Main DomainInput',
          desc: 'The main domain represents the primary organizational unit. It can have multiple subdomains under it.',
          mainPlaceholder: 'e.g. unibo.it',
          none: '-- None --',
          issuerPlaceholder: 'https://idp.example.com',
          addSub: 'Add Subdomains',
          subdomainPlaceholder: 'e.g. api.unibo.it',
          to: 'to add it to',
        },
        strategy: 'Authentication Strategy',
        standard: 'Standard',
        standardShort: 'STD',
        managedBy: 'Managed by CrowdVision',
        external: 'External SSO',
        ssoShort: 'SSO',
        externalSSO: 'OIDC (Keycloak, Auth0, etc)',
        issuerUrl: 'Issuer URL',
        clientID: 'Client ID',
        clientSecret: 'Client Secret',
        invalid: 'Invalid subdomain format.',
        alreadyPresent: 'DomainInput already exists.',
        visibleFromOutside: 'Visible from outside',
        visibleFromOutsideDesc: 'Allow users outside the organization to see this domain.',
      },
      modal: {
        errorInvalidMain: 'Please check domain name and auth config.',
      },
      roles: {
        admin: 'Admin',
        businessAdmin: 'Org. Administrator',
        businessStaff: 'Org. Staff',
        standardCustomer: 'Member',
      },
    },
    notifications: {
      title: 'Enable critical alerts?',
      description: 'Receive notifications when critical events occur.',
      dropdown: {
        title: 'Notifications',
        live: 'Live',
        offline: 'Offline',
        empty: 'No new notifications',
      },
    },
    model: {
      rooms: {
        editRoom: {
          title: 'Edit Room',
          subtitle: 'Configure parameters and thresholds',
          name: 'Room Name',
          namePlaceholder: 'e.g. Physics Lab',
          identifier: 'Room Identifier',
          identifierPlaceholder: 'Room ID',
          capacity: 'Capacity',
          maxTemp: 'Max Temp (°C)',
          themeColor: 'Theme Color',
        },
        temperature: 'Temperature',
        occupancy: 'Occupancy',
        updateFailed: 'Failed to update room',
      },
      controls: {
        buttons: {
          reset: 'Reset View',
          focus: 'Focus on Room',
          zoomIn: 'Zoom In',
          zoomOut: 'Zoom Out',
          panorama: 'Panorama Mode',
          temperature: 'Temperature Mode',
          airQuality: 'Air Quality Mode',
        },
        uploadJson: 'Upload JSON',
        invalidJsonUpload: 'Please upload a valid JSON file',
        uploadFailed: 'Failed to upload building data',
        toggleControls: 'Toggle Controls',
        floor: 'Floor',
        allFloors: 'All Floors',
        floorSelection: 'Floor selection',
      },
      selection: 'Select building',
      noBuildings: 'No buildings found',
      roomList: 'Rooms List',
      searchRoom: 'Search Room',
      noRooms: 'No rooms found',
      subName: 'Structure Name',
      data: 'Buildings',
      name: 'Domain name',
      loading: 'Loading data...',
    },
  },
  it: {
    language: 'Italiano',
    commons: {
      dashboard: 'Cruscotto',
      digitalTwin: 'Gemello Digitale',
      domains: 'Domini',
      adminPanel: 'Pannello Amministrazione',
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
      languageSelector: {
        changeLanguage: 'Cambia lingua',
        english: 'Inglese',
        italian: 'Italiano',
      },
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
        password: 'PasswordInput',
        passwordPlaceholder: '••••••••',
        forgotPassword: 'PasswordInput dimenticata?',
        email: 'Email',
        emailPlaceholder: 'nome@scuola.it',
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
          title: 'Gemello Digitale Interattivo',
          description:
            'Naviga i tuoi edifici, piani e stanze in modo intuitivo. \n' +
            "Visualizza complesse gerarchie spaziali e individua con precisione la posizione dei sensori all'interno \n" +
            'di un modello digitale centralizzato.\n',
        },
        feature2: {
          title: 'Analisi IoT in Tempo Reale',
          description:
            'Alimentato da un motore di metriche ad alte prestazioni, monitora fluidamente i dati in tempo reale di temperatura, \n' +
            "qualità dell'aria e occupazione per comprendere istantaneamente l'utilizzo degli spazi.",
        },
        feature3: {
          title: 'Assistente Intelligente AI',
          description:
            'Chatta direttamente con il tuo edificio. Il nostro agente AI integrato comprende i tuoi dati spaziali,\n ' +
            'permettendoti di fare domande in linguaggio naturale e ricevere analisi intelligenti.',
        },
        feature4: {
          title: 'Sistema di allerta proattivo',
          description:
            'Non perdere mai un evento critico. Imposta soglie personalizzate per zone specifiche e ' +
            'ricevi notifiche web-push istantanee su tutti i tuoi dispositivi nel momento stesso in cui si verificano anomalie.',
        },
        feature5: {
          title: 'Multi-Tenancy Sicura',
          description:
            'Progettato per le aziende. Un robusto Controllo degli Accessi Basato sui Ruoli (RBAC) assicura \n' +
            'che gli amministratori possano separare in modo sicuro i dati tra molteplici domini e gerarchie di utenti.',
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
          indoorAqi: 'Qualità dell\'aria interna',
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
          simStart: 'Avvia Simulatore',
          simStop: 'Stop Simulatore',
          stop: 'Stop auto',
          start: 'Avvia auto',
          next: 'Succ.',
          previous: 'Prec.',
        },
      },
      mode: {
        focusMode: 'Modalità Focus',
        graphs: 'Grafici',
        table: 'Tabella',
      },
    },
    domains: {
      table: {
        title: 'Domini',
        headers: {
          name: 'Nome',
          action: 'Azione',
        },
      },
      administration: {
        organizationDomains: 'Domini Organizzazione',
        addNewDomain: 'Aggiungi Nuovo Dominio',
        organizationToken: 'Token Organizzazione',
        activeToken: 'Token Attivo',
        generateNewToken: 'Genera Nuovo Token',
        scanQRCode: 'Scansiona con Google Authenticator o Authy',
        QRCodeTitle: 'Il Qr Code della tua organizzazione',
        selectDomainToSeeQRCode: 'Seleziona un dominio per vedere i suoi Qr code',
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
          mainPlaceholder: 'es. unibo.it',
          none: '-- Nessuno --',
          issuerPlaceholder: 'https://idp.example.com',
          addSub: 'Aggiungi Sottodomini',
          subdomainPlaceholder: 'es. api.unibo.it',
          to: 'per aggiungere',
        },
        strategy: 'Strategia di Autenticazione',
        standard: 'Standard',
        standardShort: 'STD',
        managedBy: 'Gestito da CrowdVision',
        external: 'SSO Esterno',
        ssoShort: 'SSO',
        externalSSO: 'OIDC (Keycloak, Auth0, ecc.)',
        issuerUrl: 'Issuer URL',
        clientID: 'Client ID',
        clientSecret: 'Client Secret',
        invalid: 'Formato sottodominio non valido.',
        alreadyPresent: 'Il dominio esiste gia.',
        visibleFromOutside: "Visibile dall'esterno",
        visibleFromOutsideDesc:
          "Consenti agli utenti esterni all'organizzazione di vedere questo dominio.",
      },
      modal: {
        errorInvalidMain: 'Controlla il nome dominio e la configurazione di autenticazione.',
      },
      roles: {
        admin: 'Amministratore',
        businessAdmin: 'Responsabile Org.',
        businessStaff: 'Staff Org.',
        standardCustomer: 'Membro',
      },
    },
    notifications: {
      title: 'Abilitare avvisi critici?',
      description: 'Ricevi notifiche quando si verificano eventi critici.',
      dropdown: {
        title: 'Notifiche',
        live: 'Live',
        offline: 'Offline',
        empty: 'Nessuna nuova notifica',
      },
    },
    model: {
      rooms: {
        editRoom: {
          title: 'Modifica Stanza',
          subtitle: 'Configura parametri e soglie',
          name: 'Nome Stanza',
          namePlaceholder: 'es. Laboratorio di Fisica',
          identifier: 'Identificativo Stanza',
          identifierPlaceholder: 'ID Stanza',
          capacity: 'Capacità',
          maxTemp: 'Temp Max (°C)',
          themeColor: 'Colore Tema',
        },
        temperature: 'Temperatura',
        occupancy: 'Occupazione',
        updateFailed: 'Aggiornamento stanza non riuscito',
      },
      controls: {
        buttons: {
          reset: 'Reimposta Vista',
          focus: 'Focus su Stanza',
          zoomIn: 'Zoom Avanti',
          zoomOut: 'Zoom Indietro',
          panorama: 'Modalità Panorama',
          temperature: 'Modalità Temperatura',
          airQuality: 'Modalità Qualità Aria',
        },
        uploadJson: 'Carica JSON',
        invalidJsonUpload: 'Carica un file JSON valido',
        uploadFailed: 'Caricamento dati edificio non riuscito',
        toggleControls: 'Mostra/Nascondi Controlli',
        floor: 'Piano',
        allFloors: 'Tutti i piani',
        floorSelection: 'Selezione Piano',
      },
      selection: 'Seleziona edificio',
      noBuildings: 'Nessun edificio trovato',
      roomList: 'Lista Stanze',
      searchRoom: 'Cerca Stanza',
      noRooms: 'Nessuna stanza trovata',
      subName: 'Nome Struttura',
      data: 'Strutture',
      name: 'Nome dominio',
      loading: 'Caricamento dati...',
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
