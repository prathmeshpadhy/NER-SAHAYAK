import { useAuth } from '../context/AuthContext';
import { DICTIONARY } from '../i18n';

export const useTranslation = () => {
  const { user } = useAuth();
  
  // Default to English if user language is not set or not supported
  const currentLang = user?.language && DICTIONARY[user.language] ? user.language : 'en';

  const t = (key) => {
    // 1. Try current language
    let value = DICTIONARY[currentLang]?.[key];
    if (value) return value;

    // 2. Try English fallback
    let fallback = DICTIONARY['en']?.[key];
    if (fallback) return fallback;

    if (process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] Missing translation: ${key} for language ${currentLang} and no English fallback found.`);
    }

    // 3. Last resort fallback: return human readable
    const parts = key.split('.');
    const last = parts[parts.length - 1];
    return last
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  return { t, currentLang };
};
