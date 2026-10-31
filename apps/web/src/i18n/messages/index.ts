import { en, TranslationDictionary } from './en';
import { bn } from './bn';
import { DEFAULT_LOCALE, Locale, TranslationFunction, TranslationParams } from '../types';
import { toBanglaDigits } from '../format';

export const messages: Record<Locale, TranslationDictionary> = {
  en,
  bn,
};

export { en, bn };
export type { TranslationDictionary };

/**
 * Safely extract a deeply nested string by dot notation (e.g. 'nav.home').
 * Returns undefined if key is missing or not a string.
 */
export function getMessage(messagesObj: unknown, key: string): string | undefined {
  if (!messagesObj || typeof messagesObj !== 'object') return undefined;
  const parts = key.split('.');
  let current: unknown = messagesObj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Creates a robust, error-tolerant translation function for a given locale.
 * Fallback chain:
 * 1. Target locale (e.g. 'bn')
 * 2. Default locale ('en')
 * 3. Raw key string
 */
export function createTranslate(locale: Locale = DEFAULT_LOCALE): TranslationFunction {
  const targetDict = messages[locale] || messages[DEFAULT_LOCALE];
  const defaultDict = messages[DEFAULT_LOCALE];

  const translateFn = (key: string, params?: TranslationParams): string => {
    // 1. Try target locale
    let text = getMessage(targetDict, key);

    // 2. Fall back to default locale if missing in target
    if (text === undefined && locale !== DEFAULT_LOCALE) {
      text = getMessage(defaultDict, key);
    }

    // 3. Fall back to key itself if not found anywhere
    if (text === undefined) {
      text = key;
    }

    // 4. Interpolate variables like {name} or {count}
    if (params && typeof text === 'string') {
      let interpolated = text;
      for (const [k, v] of Object.entries(params)) {
        const valStr =
          typeof v === 'number' && locale === 'bn' ? toBanglaDigits(v) : String(v);
        interpolated = interpolated.replace(new RegExp(`\\{${k}\\}`, 'g'), valStr);
      }
      return interpolated;
    }

    return text;
  };

  return Object.assign(translateFn, targetDict) as unknown as TranslationFunction;
}
