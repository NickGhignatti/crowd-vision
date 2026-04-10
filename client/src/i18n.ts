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
      administration: {
        organizationDomains: 'Organization Domains',
        addNewDomain: 'Add New Domain',
        organizationToken: 'Organization Token',
        activeToken: 'Active Token',
        generateNewToken: 'Generate New Token',
        scanQRCode: 'Scan with Google Authenticator or Authy',
        QRCodeTitle: 'Your organization QR Code',
        selectDomainToSeeQRCode: 'Select a domain to see its QR codes',
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
        alreadyPresent: 'Domain already exists.',
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
        },
        uploadJson: 'Upload JSON',
        invalidJsonUpload: 'Please upload a valid JSON file',
        uploadFailed: 'Failed to upload building data',
        toggleControls: 'Toggle Controls',
        floor: 'Floor',
        allFloors: 'All Floors',
        floorSelection: 'Floor Selection',
      },
      selection: 'Select building',
      noBuildings: 'No buildings found',
      roomList: 'Room List',
      searchRoom: 'Search Room',
      noRooms: 'No rooms found',
      subName: 'Structure Name',
      data: 'Buildings Data',
      name: 'Domain name',
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
        password: 'Password',
        passwordPlaceholder: '••••••••',
        forgotPassword: 'Password dimenticata?',
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
      administration: {
        organizationDomains: 'Domini Organizzazione',
        addNewDomain: 'Aggiungi Nuovo Dominio',
        organizationToken: 'Token Organizzazione',
        activeToken: 'Token Attivo',
        generateNewToken: 'Genera Nuovo Token',
        scanQRCode: 'Scansiona con Google Authenticator o Authy',
        QRCodeTitle: 'Il QR Code della tua organizzazione',
        selectDomainToSeeQRCode: 'Seleziona un dominio per vedere i suoi QR code',
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
      data: 'Dati delle Strutture',
      name: 'Nome dominio',
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
