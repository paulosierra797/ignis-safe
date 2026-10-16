import { createContext } from 'react';

// A page can wrap a region in this provider to collect every TranslationControls
// inside it, so one "Translate" action can drive all of them. Value shape:
// { register(api) -> unregister }, where api.translate(directionKey) resolves
// to { applied, pending, skipped, failed }.
const TranslatorRegistryContext = createContext(null);

export default TranslatorRegistryContext;
