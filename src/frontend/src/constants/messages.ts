/**
 * Application messages and UI strings
 * Centralized for easy maintenance and future i18n support
 */

export const MESSAGES = {
  APP_TITLE: 'Sistema de Gestión de Horarios',
  APP_SUBTITLE: 'USM - Facultad de Farmacia | Servicio Comunitario',
  STATUS: {
    INITIALIZED: '✅ Sistema Inicializado',
    ENCRYPTION_ACTIVE: '🔒 Cifrado de base de datos: Configurado',
    ZERO_TOLERANCE: '🚫 Política de Tolerancia Cero: Activa',
    LOGGING_OK: '📊 Sistema de logging: Operativo',
    OFFLINE_ENABLED: '⚡ Modo offline: Habilitado',
  },
  NOTES: {
    SKELETON:
      'Este es el esqueleto del proyecto. Las funcionalidades de gestión de horarios se implementarán en los próximos sprints Scrum.',
  },
} as const;
