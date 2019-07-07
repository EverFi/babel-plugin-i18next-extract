import extractTransComponent from './transComponent';
import extractWithTranslationHOC from './withTranslationHOC';
import extractUseTranslationHook from './useTranslationHook';
import extractTranslationRenderProp from './translationRenderProp';
import extractI18nextInstance from './i18nextInstance';
import extractTFunction from './tFunction';
import { ExtractionError } from './commons';

export { ExtractionError };

/**
 * All extractors sorted by priority.
 */
export const EXTRACTORS_PRIORITIES = [
  extractTransComponent.name,
  extractUseTranslationHook.name,
  extractTranslationRenderProp.name,
  extractWithTranslationHOC.name,
  extractI18nextInstance.name,
  extractTFunction.name,
];

export default {
  extractTransComponent,
  extractUseTranslationHook,
  extractTranslationRenderProp,
  extractWithTranslationHOC,
  extractI18nextInstance,
  extractTFunction,
};
