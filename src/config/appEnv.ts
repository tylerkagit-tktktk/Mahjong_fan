export type AppEnv = 'dev' | 'uat' | 'prd';

/**
 * 單一來源：目前分支所代表的 app 環境。
 *
 * 暫時設定：
 * - dev_1.0 branch 內：'dev'
 * - 之後如果你幫我做 UAT / PRD cut，可以再於相應分支改成 'uat' / 'prd'
 */
export const APP_ENV: AppEnv = 'dev';

export const IS_DEV_ENV = APP_ENV === 'dev';
export const IS_UAT_ENV = APP_ENV === 'uat';
export const IS_PRD_ENV = APP_ENV === 'prd';

/**
 * 是否容許顯示「開發者專用」介面（例如 Settings 底部的 DEV 按鈕）。
 *
 * 雙重保險：
 * - 需要 APP_ENV === 'dev'
 * - 同時要求 __DEV__ 為 true（避免 Release bundle 出錯設置都會顯示）
 */
export const IS_DEV_TOOLS_ENABLED = __DEV__ && IS_DEV_ENV;
