import * as BabelCore from '@babel/core';
import * as BabelTypes from '@babel/types';

import { parseCommentHints, CommentHint } from './comments';
import { ExtractionError } from './extractors/commons';
import extractUseTranslationHook from './extractors/useTranslationHook';
import extractI18nextInstance from './extractors/i18nextInstance';
import extractTranslationRenderProp from './extractors/translationRenderProp';
import extractTransComponent from './extractors/transComponent';
import { computeDerivedKeys, ExtractedKey, TranslationKey } from './keys';
import { Config, parseConfig } from './config';
import exportTranslationKeys, {
  ExporterCache,
  createExporterCache,
} from './exporter';
import { PLUGIN_NAME } from './constants';
import extractWithTranslationHOC from './extractors/withTranslationHOC';

export interface VisitorState {
  // Options inherited from Babel.
  file: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  opts: Partial<Config>;

  // This app state.
  I18NextExtract: I18NextExtractState;
}

interface I18NextExtractState {
  extractedKeys: ExtractedKey[];
  commentHints: CommentHint[];
  config: Config;
  extractedNodes: WeakSet<BabelTypes.Node>;
  exporterCache: ExporterCache;
}

/**
 * Handle the extraction.
 *
 * In case of ExtractionError occurring in the callback, a useful error
 * message will display and extraction will continue.
 *
 * @param path Current node path.
 * @param state Current visitor state.
 * @param callback Function to call that may throw ExtractionError.
 */
function handleExtraction<T>(
  path: BabelCore.NodePath,
  state: VisitorState,
  callback: (collect: (keys: ExtractedKey[]) => void) => T,
): T | undefined {
  const filename = (state.file && state.file.opts.filename) || '???';
  const lineNumber = (path.node.loc && path.node.loc.start.line) || '???';
  const extractState = state.I18NextExtract;

  const collect = (keys: ExtractedKey[]): void => {
    for (const key of keys) {
      if (extractState.extractedNodes.has(key.sourceNodePaths[0].node)) {
        // The node was already extracted. Skip it.
        continue;
      }
      extractState.extractedNodes.add(key.sourceNodePaths[0].node);
      state.I18NextExtract.extractedKeys.push(key);
    }
  };

  try {
    return callback(collect);
  } catch (err) {
    if (!(err instanceof ExtractionError)) {
      throw err;
    }

    // eslint-disable-next-line no-console
    console.warn(
      `${PLUGIN_NAME}: Extraction error in ${filename} at line ` +
        `${lineNumber}. ${err.message}`,
    );
  }
}

const Visitor: BabelCore.Visitor<VisitorState> = {
  CallExpression(path, state: VisitorState) {
    const extractState = this.I18NextExtract;

    handleExtraction(path, state, collect => {
      collect(
        extractUseTranslationHook(
          path,
          extractState.config,
          extractState.commentHints,
        ),
      );
      collect(
        extractI18nextInstance(
          path,
          extractState.config,
          extractState.commentHints,
        ),
      );
    });
  },

  JSXElement(path, state: VisitorState) {
    const extractState = this.I18NextExtract;

    handleExtraction(path, state, collect => {
      collect(
        extractTranslationRenderProp(
          path,
          extractState.config,
          extractState.commentHints,
        ),
      );
      collect(
        extractTransComponent(
          path,
          extractState.config,
          extractState.commentHints,
        ),
      );
    });
  },

  ClassDeclaration(path, state: VisitorState) {
    const extractState = this.I18NextExtract;

    handleExtraction(path, state, collect => {
      collect(
        extractWithTranslationHOC(
          path,
          extractState.config,
          extractState.commentHints,
        ),
      );
    });
  },

  Function(path, state: VisitorState) {
    const extractState = this.I18NextExtract;

    handleExtraction(path, state, collect => {
      collect(
        extractWithTranslationHOC(
          path,
          extractState.config,
          extractState.commentHints,
        ),
      );
    });
  },
};

export default function(
  api: BabelCore.ConfigAPI,
): BabelCore.PluginObj<VisitorState> {
  api.assertVersion(7);

  // We have to store which nodes were extracted because the visitor might be
  // called multiple times by Babel and the state would be lost across calls.
  const extractedNodes = new WeakSet<BabelTypes.Node>();

  // This is a cache for the exporter to keep track of the translation files.
  // It must remain global and persist across transpiled files.
  const exporterCache = createExporterCache();

  return {
    pre() {
      this.I18NextExtract = {
        config: parseConfig(this.opts),
        extractedKeys: [],
        commentHints: [],
        extractedNodes,
        exporterCache,
      };
    },

    post() {
      const extractState = this.I18NextExtract;

      if (extractState.extractedKeys.length === 0) return;

      for (const locale of extractState.config.locales) {
        const derivedKeys = extractState.extractedKeys.reduce(
          (accumulator, k) => [
            ...accumulator,
            ...computeDerivedKeys(k, locale, extractState.config),
          ],
          Array<TranslationKey>(),
        );
        exportTranslationKeys(
          derivedKeys,
          locale,
          extractState.config,
          extractState.exporterCache,
        );
      }
    },

    visitor: {
      Program(path, state: VisitorState) {
        // FIXME can't put this in Visitor because `path.traverse()` on a
        // Program node doesn't call the visitor for Program node.
        if (BabelTypes.isFile(path.container)) {
          this.I18NextExtract.commentHints = parseCommentHints(
            path.container.comments,
          );
        }

        path.traverse(Visitor, state);
      },
    },
  };
}
