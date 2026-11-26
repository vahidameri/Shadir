import { L } from './i18n'
/** Shown on the login page; must match MADAR_VERSION in Code.gs. */
export const VERSION = '2.10.0'
export const APP_NAME_FA = 'تسکامون'
export const APP_NAME_EN = 'Taskamun'
export const APP_NAME = () => L(APP_NAME_FA, APP_NAME_EN)
export const SHAD_WORDMARK = `Shad · ${APP_NAME_EN}`
